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
