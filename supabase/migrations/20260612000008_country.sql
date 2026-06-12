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
