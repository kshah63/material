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
