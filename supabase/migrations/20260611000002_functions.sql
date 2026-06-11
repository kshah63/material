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
