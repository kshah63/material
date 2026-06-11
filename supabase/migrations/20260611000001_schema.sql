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
