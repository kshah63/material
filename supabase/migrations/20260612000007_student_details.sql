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
