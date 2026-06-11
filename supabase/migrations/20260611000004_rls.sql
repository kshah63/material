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
