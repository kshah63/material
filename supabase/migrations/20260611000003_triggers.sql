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
