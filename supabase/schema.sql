-- =============================================================================
-- MathVision Materials Portal — consolidated schema (all migrations in order).
-- Paste this whole file into the Supabase SQL editor for a one-shot setup, OR
-- use the individual files in supabase/migrations/ with the Supabase CLI.
-- =============================================================================


-- >>> 20260611000001_schema.sql ------------------------------------------------------

-- =============================================================================
-- MathVision Materials Portal — Schema
-- Five entities. Roles live on the membership, not the person.
-- =============================================================================

-- profiles extend Supabase auth.users -----------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  full_name   text,
  app_role    text not null default 'member' check (app_role in ('admin','member')),
  created_at  timestamptz not null default now()
);

-- courses ---------------------------------------------------------------------
create table if not exists public.courses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text unique,                 -- "IM2T", "A2T", etc.
  description text,
  archived_at timestamptz,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- course_memberships : (course, user, role) ----------------------------------
create table if not exists public.course_memberships (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('student','teacher','in_charge')),
  created_at timestamptz not null default now(),
  unique (course_id, user_id)              -- one role per person per course
);
create index if not exists course_memberships_user_idx   on public.course_memberships (user_id);
create index if not exists course_memberships_course_idx on public.course_memberships (course_id);

-- folders : self-referencing tree per course ----------------------------------
create table if not exists public.folders (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  parent_id        uuid references public.folders(id) on delete cascade,  -- null = course root
  name             text not null,
  teacher_only     boolean,            -- null = inherit; true/false = explicit override
  eff_teacher_only boolean not null default false,  -- DENORMALIZED, trigger-maintained
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by       uuid references public.profiles(id),
  delete_batch_id  uuid              -- groups one delete op so restore is exact
);
create index if not exists folders_course_idx on public.folders (course_id);
create index if not exists folders_parent_idx on public.folders (parent_id);
create index if not exists folders_deleted_idx on public.folders (deleted_at);

-- files : a PDF hanging off a folder (or a course root) -----------------------
create table if not exists public.files (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.courses(id) on delete cascade,
  folder_id        uuid references public.folders(id) on delete cascade,  -- null = course root
  name             text not null,
  storage_path     text not null unique,       -- immutable; courses/{course_id}/{file_id}.pdf
  size_bytes       bigint,
  mime_type        text not null default 'application/pdf',
  teacher_only     boolean,            -- null = inherit from folder; else override
  eff_teacher_only boolean not null default false,  -- DENORMALIZED
  uploaded_by      uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by       uuid references public.profiles(id),
  delete_batch_id  uuid
);
create index if not exists files_course_idx  on public.files (course_id);
create index if not exists files_folder_idx  on public.files (folder_id);
create index if not exists files_deleted_idx on public.files (deleted_at);

-- profiles auto-provisioning ---------------------------------------------------
-- Every auth user gets a profiles row. Standalone roster: first sign-in (via
-- invite or signup) lands here. app_role defaults to 'member'; promote to
-- 'admin' manually (see DEPLOYMENT.md) for MV staff.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- >>> 20260611000002_functions.sql ------------------------------------------------------

-- =============================================================================
-- Access-control helpers + effective-teacher-only resolution + mutations
-- =============================================================================

-- 3.1 Helper functions (SECURITY DEFINER so they don't recurse through RLS) ----
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and app_role = 'admin'
  );
$$;

create or replace function public.course_role(_course_id uuid)
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select role from public.course_memberships
  where course_id = _course_id and user_id = auth.uid();
$$;

-- 3.2 Resolving effective teacher-only ----------------------------------------
-- Rule: the first explicit flag found walking up (file -> folder -> ancestors),
-- else false.
create or replace function public.resolve_folder_eff(_folder_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  with recursive chain as (
    select id, parent_id, teacher_only, 1 as lvl
    from public.folders where id = _folder_id
    union all
    select f.id, f.parent_id, f.teacher_only, c.lvl + 1
    from public.folders f join chain c on f.id = c.parent_id
    where c.teacher_only is null            -- stop climbing once an explicit flag is found
  )
  select coalesce(
    (select teacher_only from chain where teacher_only is not null order by lvl limit 1),
    false
  );
$$;

-- recompute a folder and the part of its subtree that inherits from it.
-- descendants with their OWN explicit flag anchor their subtree, so we stop
-- descending there. SECURITY DEFINER: this is denormalization maintenance and
-- must run regardless of the caller's RLS write scope on individual rows.
create or replace function public.recompute_subtree(_root uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r record;
begin
  update public.folders
    set eff_teacher_only = public.resolve_folder_eff(_root)
    where id = _root;

  for r in
    with recursive sub as (
      select id, teacher_only from public.folders where parent_id = _root
      union all
      select f.id, f.teacher_only
      from public.folders f join sub s on f.parent_id = s.id
      where s.teacher_only is null
    ) select id from sub
  loop
    update public.folders
      set eff_teacher_only = public.resolve_folder_eff(r.id)
      where id = r.id;
  end loop;

  -- files inheriting from any recomputed folder
  update public.files fi
    set eff_teacher_only = coalesce(fi.teacher_only, fo.eff_teacher_only, false)
  from public.folders fo
  where fi.folder_id = fo.id
    and fo.id in (
      with recursive sub as (
        select id, teacher_only from public.folders where id = _root
        union all
        select f.id, f.teacher_only from public.folders f join sub s on f.parent_id = s.id
        where s.teacher_only is null
      ) select id from sub
    );
end;
$$;

-- 6. Cycle guard for moves ----------------------------------------------------
create or replace function public.is_descendant(_candidate uuid, _of uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  with recursive sub as (
    select id from public.folders where id = _of
    union all
    select f.id from public.folders f join sub s on f.parent_id = s.id
  )
  select exists (select 1 from sub where id = _candidate);
$$;

-- Move a folder with cycle rejection. SECURITY INVOKER so RLS gates who may move.
create or replace function public.move_folder(_folder_id uuid, _new_parent_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare _course uuid;
        _parent_course uuid;
begin
  if _new_parent_id is not null then
    if _new_parent_id = _folder_id then
      raise exception 'Cannot move a folder into itself';
    end if;
    if public.is_descendant(_new_parent_id, _folder_id) then
      raise exception 'Cannot move a folder into one of its own descendants';
    end if;
    -- keep moves within the same course
    select course_id into _course from public.folders where id = _folder_id;
    select course_id into _parent_course from public.folders where id = _new_parent_id;
    if _course is distinct from _parent_course then
      raise exception 'Cannot move a folder to a different course';
    end if;
  end if;

  update public.folders set parent_id = _new_parent_id where id = _folder_id;
end;
$$;

-- 5. Soft delete (folder subtree) under one batch id --------------------------
create or replace function public.soft_delete_folder(_folder_id uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare batch uuid := gen_random_uuid();
begin
  with recursive sub as (
    select id from public.folders where id = _folder_id
    union all
    select f.id from public.folders f join sub s on f.parent_id = s.id
  )
  update public.folders
    set deleted_at = now(), deleted_by = auth.uid(), delete_batch_id = batch
    where id in (select id from sub) and deleted_at is null;

  update public.files
    set deleted_at = now(), deleted_by = auth.uid(), delete_batch_id = batch
    where folder_id in (
      with recursive sub as (
        select id from public.folders where id = _folder_id
        union all select f.id from public.folders f join sub s on f.parent_id = s.id
      ) select id from sub
    ) and deleted_at is null;

  return batch;
end;
$$;

-- Soft delete a single file ---------------------------------------------------
create or replace function public.soft_delete_file(_file_id uuid)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare batch uuid := gen_random_uuid();
begin
  update public.files
    set deleted_at = now(), deleted_by = auth.uid(), delete_batch_id = batch
    where id = _file_id and deleted_at is null;
  return batch;
end;
$$;

-- Restore a batch : clears the three delete columns for exactly that batch ----
create or replace function public.restore_batch(_batch_id uuid)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.folders
    set deleted_at = null, deleted_by = null, delete_batch_id = null
    where delete_batch_id = _batch_id;

  update public.files
    set deleted_at = null, deleted_by = null, delete_batch_id = null
    where delete_batch_id = _batch_id;
end;
$$;

-- Breadcrumb : ordered ancestor chain root..folder ----------------------------
create or replace function public.folder_path(_folder_id uuid)
returns table (id uuid, name text, lvl int)
language sql
stable
set search_path = public, pg_temp
as $$
  with recursive chain as (
    select id, parent_id, name, 0 as depth
    from public.folders where id = _folder_id
    union all
    select f.id, f.parent_id, f.name, c.depth + 1
    from public.folders f join chain c on f.id = c.parent_id
  )
  select id, name, depth as lvl from chain order by depth desc;
$$;


-- >>> 20260611000003_triggers.sql ------------------------------------------------------

-- =============================================================================
-- Effective-teacher-only triggers
-- The single trickiest component: keep eff_teacher_only correct on every event
-- that changes inheritance (flag change or move).
-- =============================================================================

-- folder created, flag changed, or moved -> recompute its subtree -------------
create or replace function public.trg_folder_eff()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recompute_subtree(new.id);
  return new;
end;
$$;

drop trigger if exists folder_eff_ins on public.folders;
create trigger folder_eff_ins
  after insert on public.folders
  for each row execute function public.trg_folder_eff();

drop trigger if exists folder_eff_upd on public.folders;
create trigger folder_eff_upd
  after update of teacher_only, parent_id on public.folders
  for each row execute function public.trg_folder_eff();

-- file created, flag changed, or moved -> recompute just that file ------------
create or replace function public.trg_file_eff()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.eff_teacher_only := coalesce(
    new.teacher_only,
    (select eff_teacher_only from public.folders where id = new.folder_id),
    false
  );
  return new;
end;
$$;

drop trigger if exists file_eff on public.files;
create trigger file_eff
  before insert or update of teacher_only, folder_id on public.files
  for each row execute function public.trg_file_eff();


-- >>> 20260611000004_rls.sql ------------------------------------------------------

-- =============================================================================
-- Row-level security. The whole permission matrix lives here. There is NO
-- DELETE policy on folders/files -> hard delete is impossible from any user
-- path. The only physical delete is the service-role purge (Edge Function).
-- =============================================================================

alter table public.profiles           enable row level security;
alter table public.courses            enable row level security;
alter table public.course_memberships enable row level security;
alter table public.folders            enable row level security;
alter table public.files              enable row level security;

-- profiles --------------------------------------------------------------------
-- A user reads their own profile; admins read everyone (e.g. admin console).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());

-- A user may update their own display name; admins may update anyone.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- courses ---------------------------------------------------------------------
-- Read a course if you are a member of it, or you are an admin.
drop policy if exists courses_select on public.courses;
create policy courses_select on public.courses for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.course_memberships m
      where m.course_id = courses.id and m.user_id = auth.uid()
    )
  );

drop policy if exists courses_write on public.courses;
create policy courses_write on public.courses for all
  using (public.is_admin())
  with check (public.is_admin());

-- course_memberships ----------------------------------------------------------
-- See your own memberships; admins see all. Only admins write.
drop policy if exists memberships_select on public.course_memberships;
create policy memberships_select on public.course_memberships for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists memberships_write on public.course_memberships;
create policy memberships_write on public.course_memberships for all
  using (public.is_admin())
  with check (public.is_admin());

-- folders ---------------------------------------------------------------------
-- admins see everything (all courses, all trash);
-- in_charge sees their course including trash;
-- teachers see non-deleted everything (incl. teacher-only);
-- students see non-deleted, non-teacher-only.
drop policy if exists folders_select on public.folders;
create policy folders_select on public.folders for select using (
  public.is_admin()
  or (public.course_role(course_id) = 'in_charge')
  or (public.course_role(course_id) = 'teacher' and deleted_at is null)
  or (public.course_role(course_id) = 'student' and deleted_at is null and eff_teacher_only = false)
);

drop policy if exists folders_insert on public.folders;
create policy folders_insert on public.folders for insert
  with check (public.is_admin() or public.course_role(course_id) = 'in_charge');

-- soft delete and restore are both UPDATEs -> covered here.
drop policy if exists folders_update on public.folders;
create policy folders_update on public.folders for update
  using      (public.is_admin() or public.course_role(course_id) = 'in_charge')
  with check (public.is_admin() or public.course_role(course_id) = 'in_charge');

-- files -----------------------------------------------------------------------
drop policy if exists files_select on public.files;
create policy files_select on public.files for select using (
  public.is_admin()
  or (public.course_role(course_id) = 'in_charge')
  or (public.course_role(course_id) = 'teacher' and deleted_at is null)
  or (public.course_role(course_id) = 'student' and deleted_at is null and eff_teacher_only = false)
);

drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert
  with check (public.is_admin() or public.course_role(course_id) = 'in_charge');

drop policy if exists files_update on public.files;
create policy files_update on public.files for update
  using      (public.is_admin() or public.course_role(course_id) = 'in_charge')
  with check (public.is_admin() or public.course_role(course_id) = 'in_charge');


-- >>> 20260611000005_storage.sql ------------------------------------------------------

-- =============================================================================
-- Storage : one private bucket `course-materials`. Never public.
-- Path is by file id, not folder tree: courses/{course_id}/{file_id}.pdf
--
-- Reads: locked to the service role. Clients never read objects directly;
--        they call getViewUrl(), which checks RLS on the caller's session and
--        then mints a 60s service-role signed URL. This is what keeps
--        teacher-only enforced — a teacher-only PDF never sits behind a
--        guessable public URL.
-- Writes: in_charge / admin upload directly over TUS using their own session,
--         so we grant INSERT/UPDATE on objects scoped to their course path.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-materials', 'course-materials', false, null, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      allowed_mime_types = excluded.allowed_mime_types;

-- Course id is the 2nd path segment: courses/{course_id}/{file_id}.pdf
-- A non-conforming path fails the uuid cast and is therefore denied.

drop policy if exists course_materials_insert on storage.objects;
create policy course_materials_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'course-materials'
    and (
      public.is_admin()
      or public.course_role(split_part(name, '/', 2)::uuid) = 'in_charge'
    )
  );

drop policy if exists course_materials_update on storage.objects;
create policy course_materials_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'course-materials'
    and (
      public.is_admin()
      or public.course_role(split_part(name, '/', 2)::uuid) = 'in_charge'
    )
  )
  with check (
    bucket_id = 'course-materials'
    and (
      public.is_admin()
      or public.course_role(split_part(name, '/', 2)::uuid) = 'in_charge'
    )
  );

-- No SELECT and no DELETE policy for clients on this bucket: reads go through
-- service-role signed URLs and purges run as the service role.



-- >>> 20260612000006_accounts_enrollment.sql ------------------------------------------------------

-- =============================================================================
-- Accounts & enrollment (self-signup, approval, join requests)
--
-- * profiles gain account_role (student|teacher) and status (pending|approved).
--   Self-signups land as pending; an admin approves them. Admin invites are
--   pre-approved. Existing rows are backfilled to approved.
-- * enrollment_requests: an approved user asks to join a course; an admin or
--   that course's in_charge approves (creating the membership) or declines.
-- * in_charge can now manage student/teacher memberships of their own course.
--   Only admins can grant/revoke in_charge or touch other in_charge rows.
-- * Lock down profiles updates: authenticated users may only write full_name
--   directly (RLS alone can't stop a user from editing their own app_role /
--   status). Admin role/status changes go through the service role.
-- =============================================================================

-- 6.1 profiles columns ---------------------------------------------------------
alter table public.profiles
  add column if not exists account_role text not null default 'student'
    check (account_role in ('student','teacher'));

alter table public.profiles
  add column if not exists status text not null default 'pending'
    check (status in ('pending','approved'));

-- Everyone who existed before this feature was invited deliberately: approve.
update public.profiles set status = 'approved' where status = 'pending';

-- 6.2 signup trigger now reads account_role / invited from signup metadata -----
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, account_role, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    case when new.raw_user_meta_data ->> 'account_role' = 'teacher'
         then 'teacher' else 'student' end,
    -- Admin invites carry invited=true and skip the approval queue.
    case when new.raw_user_meta_data ->> 'invited' = 'true'
         then 'approved' else 'pending' end
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

-- 6.3 approval helper ----------------------------------------------------------
create or replace function public.is_approved()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

-- 6.4 enrollment_requests ------------------------------------------------------
create table if not exists public.enrollment_requests (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  requested_role text not null check (requested_role in ('student','teacher')),
  status         text not null default 'pending'
                   check (status in ('pending','approved','declined')),
  created_at     timestamptz not null default now(),
  decided_at     timestamptz,
  decided_by     uuid references public.profiles(id)
);
create index if not exists enrollment_requests_course_idx on public.enrollment_requests (course_id);
create index if not exists enrollment_requests_user_idx   on public.enrollment_requests (user_id);
-- One open request per person per course.
create unique index if not exists enrollment_requests_pending_uniq
  on public.enrollment_requests (course_id, user_id) where (status = 'pending');

grant select, insert, update, delete on public.enrollment_requests to authenticated;

alter table public.enrollment_requests enable row level security;

-- Your own requests; admins all; in_charge their course's.
drop policy if exists requests_select on public.enrollment_requests;
create policy requests_select on public.enrollment_requests for select using (
  user_id = auth.uid()
  or public.is_admin()
  or public.course_role(course_id) = 'in_charge'
);

-- Only approved accounts may ask, only for themselves, only for live courses
-- they aren't already in.
drop policy if exists requests_insert on public.enrollment_requests;
create policy requests_insert on public.enrollment_requests for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and public.is_approved()
    and public.course_role(course_id) is null
    and exists (
      select 1 from public.courses c
      where c.id = course_id and c.archived_at is null
    )
  );

-- Deciding (approve/decline) is an UPDATE by admin or the course's in_charge.
drop policy if exists requests_update on public.enrollment_requests;
create policy requests_update on public.enrollment_requests for update
  using      (public.is_admin() or public.course_role(course_id) = 'in_charge')
  with check (public.is_admin() or public.course_role(course_id) = 'in_charge');

-- Requesters may withdraw a still-pending request.
drop policy if exists requests_delete on public.enrollment_requests;
create policy requests_delete on public.enrollment_requests for delete
  using (user_id = auth.uid() and status = 'pending');

-- 6.5 course directory ---------------------------------------------------------
-- Approved users can see live courses they're NOT in, so they can request to
-- join. (Members/admins already see theirs via courses_select.)
drop policy if exists courses_directory_select on public.courses;
create policy courses_directory_select on public.courses for select
  using (public.is_approved() and archived_at is null);

-- 6.6 in_charge roster management ----------------------------------------------
-- Admins keep full control; in_charge may add/change/remove student & teacher
-- rows in their course but can never grant in_charge or touch in_charge rows.
drop policy if exists memberships_write on public.course_memberships;
drop policy if exists memberships_admin_write on public.course_memberships;
create policy memberships_admin_write on public.course_memberships for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists memberships_incharge_insert on public.course_memberships;
create policy memberships_incharge_insert on public.course_memberships for insert
  with check (
    public.course_role(course_id) = 'in_charge'
    and role in ('student','teacher')
  );

drop policy if exists memberships_incharge_update on public.course_memberships;
create policy memberships_incharge_update on public.course_memberships for update
  using (
    public.course_role(course_id) = 'in_charge'
    and role in ('student','teacher')
  )
  with check (
    public.course_role(course_id) = 'in_charge'
    and role in ('student','teacher')
  );

drop policy if exists memberships_incharge_delete on public.course_memberships;
create policy memberships_incharge_delete on public.course_memberships for delete
  using (
    public.course_role(course_id) = 'in_charge'
    and role in ('student','teacher')
  );

-- in_charge needs to see their whole roster (not just their own row).
drop policy if exists memberships_select on public.course_memberships;
create policy memberships_select on public.course_memberships for select using (
  user_id = auth.uid()
  or public.is_admin()
  or public.course_role(course_id) = 'in_charge'
);

-- 6.7 profile visibility for roster screens ------------------------------------
-- in_charge can read profiles of their course's members and pending requesters.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.course_memberships m
    where m.user_id = profiles.id
      and public.course_role(m.course_id) = 'in_charge'
  )
  or exists (
    select 1 from public.enrollment_requests r
    where r.user_id = profiles.id
      and r.status = 'pending'
      and public.course_role(r.course_id) = 'in_charge'
  )
);

-- 6.8 close the self-promotion hole --------------------------------------------
-- RLS lets a user UPDATE their own profiles row, and RLS can't restrict which
-- columns. Column privileges can: direct writes from the app are limited to
-- full_name. app_role / status / account_role changes go through the service
-- role (server actions verify the caller is an admin first).
revoke update on table public.profiles from authenticated;
grant update (full_name) on table public.profiles to authenticated;


-- >>> 20260612000007_student_details.sql ------------------------------------------------------

-- =============================================================================
-- Student details: grade + school on profiles.
-- Students provide them at signup (teachers just give a name); rosters can then
-- be filled by searching names or bulk-adding a whole grade/school.
-- =============================================================================

alter table public.profiles add column if not exists grade  text;
alter table public.profiles add column if not exists school text;

-- Signup trigger also captures grade/school from the signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, account_role, status, grade, school)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    case when new.raw_user_meta_data ->> 'account_role' = 'teacher'
         then 'teacher' else 'student' end,
    case when new.raw_user_meta_data ->> 'invited' = 'true'
         then 'approved' else 'pending' end,
    nullif(trim(new.raw_user_meta_data ->> 'grade'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'school'), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

-- Users may maintain their own grade/school alongside their display name
-- (column privileges; RLS still limits non-admins to their own row).
grant update (grade, school) on table public.profiles to authenticated;


-- >>> 20260612000008_country.sql ------------------------------------------------------

-- =============================================================================
-- Country on profiles — for students outside Singapore ("Global"). They give a
-- country + free-text school at signup; SG students keep picking from the list.
-- =============================================================================

alter table public.profiles add column if not exists country text;

-- Signup trigger also captures country from the signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, account_role, status, grade, school, country)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    case when new.raw_user_meta_data ->> 'account_role' = 'teacher'
         then 'teacher' else 'student' end,
    case when new.raw_user_meta_data ->> 'invited' = 'true'
         then 'approved' else 'pending' end,
    nullif(trim(new.raw_user_meta_data ->> 'grade'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'school'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'country'), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

grant update (country) on table public.profiles to authenticated;


-- >>> 20261017000009_questions.sql ------------------------------------------------------

-- Topics: one fixed list per course, in the owner's order. Rows are added in
-- the SQL editor (DEPLOYMENT.md), never by this migration, so re-running it
-- never touches them.
create table if not exists public.question_topics (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name      text not null,
  position  smallint not null default 0,
  unique (course_id, name)
);

-- A question: up to four boxes on one bank, printed one under another.
create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  -- The course is the file's course; the purge's hard delete takes questions with it.
  file_id    uuid not null references public.files(id) on delete cascade,
  topic_id   uuid references public.question_topics(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- What question_boxes points at, so that a box's file is always its question's.
  constraint questions_id_file_key unique (id, file_id)
);
create index if not exists questions_file_idx  on public.questions (file_id);
create index if not exists questions_topic_idx on public.questions (topic_id);

-- A question's boxes, on any pages of its file, printed in box_no order. Four
-- at most: a past paper's question runs over at most four pages. A stimulus
-- printed once above several questions is box 1 of each, copied: every
-- question owns its rows, so changing one question never changes another.
create table if not exists public.question_boxes (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  -- The question's file, kept right by the foreign key below, so that a box's
  -- policies read files directly, as a question's do. Through questions instead,
  -- every box row re-ran the questions policy: 12 times slower to list a course.
  file_id     uuid not null,
  box_no      smallint not null check (box_no between 1 and 4),
  page        integer not null check (page >= 1),
  -- PDF user-space points on the source page, before its /Rotate, CropBox
  -- offset included: what pdf.js convertToPdfPoint returns, and what
  -- convertToViewportPoint takes to render the box. y grows upwards.
  x0 real not null, y0 real not null, x1 real not null, y1 real not null,
  -- Reading order on its page (columns left to right, then top to bottom),
  -- set by the crop screen every time the page is saved.
  pos         smallint not null default 0,
  constraint question_boxes_question_fkey foreign key (question_id, file_id)
    references public.questions (id, file_id) on delete cascade,
  constraint question_boxes_box_check check (
    x1 > x0 and y1 > y0
    and x0 >= -14400 and y0 >= -14400 and x1 <= 14400 and y1 <= 14400),
  -- Deferrable, so that one statement can renumber a question's boxes.
  constraint question_boxes_box_no_key unique (question_id, box_no) deferrable initially immediate,
  -- The same box twice in one question would print twice.
  constraint question_boxes_once_key unique (question_id, page, x0, y0, x1, y1)
);
create index if not exists question_boxes_file_page_idx on public.question_boxes (file_id, page, pos);

-- Who may crop this file: admin, or in_charge of its course; the file is live
-- and students cannot see it. The one place the rule is written: the write
-- policies below and the page view both ask it.
create or replace function public.can_crop_file(_file_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.files f
    where f.id = _file_id
      and f.deleted_at is null
      and f.eff_teacher_only
      and ((select public.is_admin()) or public.course_role(f.course_id) = 'in_charge')
  );
$$;

-- A question's topic, if any, belongs to its file's course.
create or replace function public.topic_fits(_topic_id uuid, _file_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select _topic_id is null or exists (
    select 1 from public.question_topics t
    join public.files f on f.course_id = t.course_id
    where t.id = _topic_id and f.id = _file_id
  );
$$;

-- The courses whose questions the caller may read: every course for an admin,
-- otherwise those they teach or are in_charge of; students never. Asked once per
-- query, so the read policies below look only at the caller's own courses' files
-- instead of running files_select over every file there is.
create or replace function public.question_course_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.is_admin() then (select coalesce(array_agg(c.id), '{}') from public.courses c)
    else (select coalesce(array_agg(m.course_id), '{}') from public.course_memberships m
          where m.user_id = (select auth.uid()) and m.role in ('teacher','in_charge'))
  end;
$$;

alter table public.question_topics enable row level security;
alter table public.questions       enable row level security;
alter table public.question_boxes  enable row level security;

drop policy if exists question_topics_select on public.question_topics;
create policy question_topics_select on public.question_topics for select
  to authenticated using (
    (select public.is_admin()) or public.course_role(course_id) in ('teacher','in_charge')
  );

-- Teachers, in_charge and admins of the file's course; students never. The
-- EXISTS runs files_select as the caller, so the file's own rule decides the rest.
-- The course list keeps it to the caller's own courses' files: without it every
-- read ran files_select over every file there is (200 ms at 10,000 files).
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions for select
  to authenticated using (
    exists (
      select 1 from public.files f
      where f.id = questions.file_id and f.deleted_at is null
        and f.course_id = any ((select public.question_course_ids())::uuid[])
    )
  );

drop policy if exists questions_insert on public.questions;
create policy questions_insert on public.questions for insert
  to authenticated
  with check (public.can_crop_file(file_id) and public.topic_fits(topic_id, file_id));

drop policy if exists questions_update on public.questions;
create policy questions_update on public.questions for update
  to authenticated
  using (public.can_crop_file(file_id))
  with check (public.can_crop_file(file_id) and public.topic_fits(topic_id, file_id));

-- A question is deleted outright, with no Trash: the bank itself is untouched.
drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions for delete
  to authenticated
  using (public.can_crop_file(file_id));

-- A box's policies are its question's, on the same file. questions_select is
-- copied rather than called, so the planner can still check files once per
-- query; the test suite fails if the two ever disagree.
drop policy if exists question_boxes_select on public.question_boxes;
create policy question_boxes_select on public.question_boxes for select
  to authenticated using (
    exists (
      select 1 from public.files f
      where f.id = question_boxes.file_id and f.deleted_at is null
        and f.course_id = any ((select public.question_course_ids())::uuid[])
    )
  );

drop policy if exists question_boxes_insert on public.question_boxes;
create policy question_boxes_insert on public.question_boxes for insert
  to authenticated
  with check (public.can_crop_file(file_id));

drop policy if exists question_boxes_update on public.question_boxes;
create policy question_boxes_update on public.question_boxes for update
  to authenticated
  using (public.can_crop_file(file_id))
  with check (public.can_crop_file(file_id));

drop policy if exists question_boxes_delete on public.question_boxes;
create policy question_boxes_delete on public.question_boxes for delete
  to authenticated
  using (public.can_crop_file(file_id));

-- Column privileges: created_by comes from its default; a saved question can
-- change its topic, never its file; a saved box can change its place, box and
-- reading order, never its question, file or page.
revoke all on table public.question_topics from anon, authenticated;
grant select on table public.question_topics to authenticated;
revoke all on table public.questions from anon, authenticated;
grant select, delete on table public.questions to authenticated;
grant insert (id, file_id, topic_id) on table public.questions to authenticated;
grant update (topic_id) on table public.questions to authenticated;
revoke all on table public.question_boxes from anon, authenticated;
grant select, delete on table public.question_boxes to authenticated;
grant insert (question_id, file_id, box_no, page, x0, y0, x1, y1, pos) on table public.question_boxes to authenticated;
grant update (box_no, x0, y0, x1, y1, pos) on table public.question_boxes to authenticated;

-- Save the crop screen's changes to one bank in one transaction, as the caller
-- (RLS decides). The screen calls it once per page; a page's changes can reach
-- a question's boxes on other pages.
--   _add:    new questions, [{id, topic_id, boxes: [{page,x0,y0,x1,y1,pos}, ...]}], box 1
--            first; the id is made by the screen, so a retried save is refused
--   _edit:   saved questions, [{id, topic_id, boxes: [...]}]. topic_id is written only
--            when sent (null clears it). boxes is the whole question in print order:
--            {id} keeps a box where it is, {id,x0,y0,x1,y1,pos} keeps it with a new box
--            and reading order on its own page, and a box with no id is new
--   _remove: saved boxes; a question left with none is deleted
-- Every id must name something in this bank that the caller may change, and an
-- edited question must list or remove every box it has; otherwise nothing at
-- all is written.
create or replace function public.save_crops(
  _file_id uuid,
  _add     jsonb  default '[]'::jsonb,
  _edit    jsonb  default '[]'::jsonb,
  _remove  uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  n       integer;
  touched uuid[];
  listed  jsonb;
  a       jsonb;
  qid     uuid;
begin
  -- Removals first, so an edited question drops a box by removing it.
  with d as (
    delete from public.question_boxes b
     where b.id = any(_remove) and b.file_id = _file_id
    returning b.question_id
  )
  select count(*), coalesce(array_agg(distinct d.question_id), '{}') into n, touched from d;
  if n <> cardinality(_remove) then
    raise exception 'A question in this bank was changed elsewhere, or cannot be changed by you.'
      using errcode = '42501';
  end if;

  -- A topic is written only when the edit sends one, so a page save never undoes
  -- a topic somebody else set meanwhile. The update also locks each edited
  -- question until this save commits, so a second save of it waits for this one.
  update public.questions q
     set topic_id = case when e ? 'topic_id' then (e ->> 'topic_id')::uuid else q.topic_id end
    from jsonb_array_elements(_edit) e
   where q.id = (e ->> 'id')::uuid and q.file_id = _file_id;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(_edit) then
    raise exception 'A question in this bank was changed elsewhere, or cannot be changed by you.'
      using errcode = '42501';
  end if;
  touched := touched || array(select (e ->> 'id')::uuid from jsonb_array_elements(_edit) e);

  -- Each edited question's boxes, numbered by their place in its list.
  select coalesce(jsonb_agg(x.b || jsonb_build_object('question_id', e ->> 'id', 'box_no', x.ord)), '[]')
    into listed
    from jsonb_array_elements(_edit) e,
         jsonb_array_elements(e -> 'boxes') with ordinality as x(b, ord);

  -- A box the list neither keeps nor removes was added since this screen read the bank.
  if exists (
    select 1 from jsonb_to_recordset(_edit) as e(id uuid)
      join public.question_boxes b on b.question_id = e.id
     where not exists (
       select 1 from jsonb_to_recordset(listed) as l(question_id uuid, id uuid)
        where l.question_id = b.question_id and l.id = b.id)
  ) then
    raise exception 'A question in this bank was changed elsewhere, or cannot be changed by you.'
      using errcode = '42501';
  end if;

  -- A kept box stays on its page, as the column grants say.
  if exists (
    select 1 from jsonb_to_recordset(listed) as l(question_id uuid, id uuid, page integer)
      join public.question_boxes b on b.id = l.id and b.question_id = l.question_id
     where l.page <> b.page
  ) then
    raise exception 'A saved box keeps its page: remove it and add it again.'
      using errcode = '23514';
  end if;

  update public.question_boxes b
     set box_no = l.box_no,
         x0 = coalesce(l.x0, b.x0), y0 = coalesce(l.y0, b.y0),
         x1 = coalesce(l.x1, b.x1), y1 = coalesce(l.y1, b.y1),
         pos = coalesce(l.pos, b.pos)
    from jsonb_to_recordset(listed)
         as l(question_id uuid, box_no smallint, id uuid, x0 real, y0 real, x1 real, y1 real, pos smallint)
   where l.id is not null and b.id = l.id and b.question_id = l.question_id;
  get diagnostics n = row_count;
  if n <> (select count(*) from jsonb_to_recordset(listed) as l(id uuid) where l.id is not null) then
    raise exception 'A question in this bank was changed elsewhere, or cannot be changed by you.'
      using errcode = '42501';
  end if;

  insert into public.question_boxes (question_id, file_id, box_no, page, x0, y0, x1, y1, pos)
  select l.question_id, _file_id, l.box_no, l.page, l.x0, l.y0, l.x1, l.y1, l.pos
    from jsonb_to_recordset(listed)
         as l(question_id uuid, box_no smallint, id uuid, page integer,
              x0 real, y0 real, x1 real, y1 real, pos smallint)
   where l.id is null;

  -- A question that lost a box closes the gap, or goes if it has none left.
  update public.question_boxes b
     set box_no = r.n
    from (select id, row_number() over (partition by question_id order by box_no) as n
            from public.question_boxes where question_id = any(touched)) r
   where b.id = r.id and b.box_no <> r.n;
  delete from public.questions q
   where q.id = any(touched)
     and not exists (select 1 from public.question_boxes b where b.question_id = q.id);

  for a in select value from jsonb_array_elements(_add) loop
    if coalesce(jsonb_array_length(a -> 'boxes'), 0) = 0 then
      raise exception 'A question needs at least one box.' using errcode = '23514';
    end if;
    insert into public.questions (id, file_id, topic_id)
    values ((a ->> 'id')::uuid, _file_id, (a ->> 'topic_id')::uuid)
    returning id into qid;
    insert into public.question_boxes (question_id, file_id, box_no, page, x0, y0, x1, y1, pos)
    select qid, _file_id, x.ord, x.page, x.x0, x.y0, x.x1, x.y1, x.pos
      from rows from (jsonb_to_recordset(a -> 'boxes')
                      as (page integer, x0 real, y0 real, x1 real, y1 real, pos smallint))
           with ordinality as x(page, x0, y0, x1, y1, pos, ord);
  end loop;
end;
$$;

revoke all on function public.can_crop_file(uuid) from public, anon;
revoke all on function public.question_course_ids() from public, anon;
revoke all on function public.topic_fits(uuid, uuid) from public, anon;
revoke all on function public.save_crops(uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.can_crop_file(uuid) to authenticated;
grant execute on function public.question_course_ids() to authenticated;
grant execute on function public.topic_fits(uuid, uuid) to authenticated;
grant execute on function public.save_crops(uuid, jsonb, jsonb, uuid[]) to authenticated;

-- The Questions page's list of banks. security_invoker: the caller's RLS on
-- question_boxes and files applies. A question counts once however many boxes
-- it has, and a page counts if any box is on it.
create or replace view public.question_sources with (security_invoker = true) as
  select f.course_id, f.id as file_id, f.name as file_name, f.folder_id, f.eff_teacher_only,
         count(distinct b.question_id) as questions, count(distinct b.page) as pages,
         min(b.page) as first_page
  from public.question_boxes b
  join public.files f on f.id = b.file_id
  group by f.id;

revoke all on table public.question_sources from anon, authenticated;
grant select on table public.question_sources to authenticated;
