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
