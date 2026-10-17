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

create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  -- The course is the file's course; the purge's hard delete takes crops with it.
  file_id    uuid not null references public.files(id) on delete cascade,
  page       integer not null check (page >= 1),
  -- PDF user-space points on the source page, before its /Rotate, CropBox
  -- offset included: what pdf.js convertToPdfPoint returns, and what
  -- convertToViewportPoint takes to render the box. y grows upwards.
  x0 real not null, y0 real not null, x1 real not null, y1 real not null,
  -- Reading order on its page (columns left to right, then top to bottom),
  -- set by the crop screen every time the page is saved.
  pos        smallint not null default 0,
  topic_id   uuid references public.question_topics(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint questions_box_check check (
    x1 > x0 and y1 > y0
    and x0 >= -14400 and y0 >= -14400 and x1 <= 14400 and y1 <= 14400)
);
create index if not exists questions_file_page_idx on public.questions (file_id, page, pos);
create index if not exists questions_topic_idx     on public.questions (topic_id);

-- Who may crop this file: admin, or in_charge of its course; the file is live
-- and students cannot see it. The one place the rule is written: the policies
-- below and the suggestion route both ask it.
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

-- A crop's topic, if any, belongs to its file's course.
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

alter table public.question_topics enable row level security;
alter table public.questions       enable row level security;

drop policy if exists question_topics_select on public.question_topics;
create policy question_topics_select on public.question_topics for select
  to authenticated using (
    (select public.is_admin()) or public.course_role(course_id) in ('teacher','in_charge')
  );

-- Teachers, in_charge and admins of the file's course; students never. The
-- EXISTS runs files_select as the caller, so the file's own rule decides the rest.
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions for select
  to authenticated using (
    exists (
      select 1 from public.files f
      where f.id = questions.file_id and f.deleted_at is null
        and ((select public.is_admin()) or public.course_role(f.course_id) in ('teacher','in_charge'))
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

-- A crop is deleted outright, with no Trash: the bank itself is untouched.
drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions for delete
  to authenticated
  using (public.can_crop_file(file_id));

-- Column privileges: created_by comes from its default; a saved crop can change
-- its box, position and topic, never its file or page.
revoke all on table public.question_topics from anon, authenticated;
grant select on table public.question_topics to authenticated;
revoke all on table public.questions from anon, authenticated;
grant select, delete on table public.questions to authenticated;
grant insert (file_id, page, x0, y0, x1, y1, pos, topic_id) on table public.questions to authenticated;
grant update (x0, y0, x1, y1, pos, topic_id) on table public.questions to authenticated;

-- Save one page of one file in one transaction, as the caller (RLS decides).
-- Every edit and removal must name a crop on this page that the caller may
-- change; otherwise nothing at all is written.
create or replace function public.save_page_crops(
  _file_id uuid,
  _page    integer,
  _add     jsonb default '[]'::jsonb,   -- [{x0,y0,x1,y1,pos,topic_id}]
  _edit    jsonb default '[]'::jsonb,   -- [{id,x0,y0,x1,y1,pos,topic_id}]
  _remove  uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare n integer;
begin
  insert into public.questions (file_id, page, x0, y0, x1, y1, pos, topic_id)
  select _file_id, _page, a.x0, a.y0, a.x1, a.y1, a.pos, a.topic_id
  from jsonb_to_recordset(_add) as a(x0 real, y0 real, x1 real, y1 real, pos smallint, topic_id uuid);

  update public.questions q
     set x0 = e.x0, y0 = e.y0, x1 = e.x1, y1 = e.y1, pos = e.pos, topic_id = e.topic_id
    from jsonb_to_recordset(_edit) as e(id uuid, x0 real, y0 real, x1 real, y1 real, pos smallint, topic_id uuid)
   where q.id = e.id and q.file_id = _file_id and q.page = _page;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(_edit) then
    raise exception 'A crop on this page was changed elsewhere, or cannot be changed by you.'
      using errcode = '42501';
  end if;

  delete from public.questions q
   where q.id = any(_remove) and q.file_id = _file_id and q.page = _page;
  get diagnostics n = row_count;
  if n <> coalesce(array_length(_remove, 1), 0) then
    raise exception 'A crop on this page was changed elsewhere, or cannot be changed by you.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.can_crop_file(uuid) from public, anon;
revoke all on function public.topic_fits(uuid, uuid) from public, anon;
revoke all on function public.save_page_crops(uuid, integer, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.can_crop_file(uuid) to authenticated;
grant execute on function public.topic_fits(uuid, uuid) to authenticated;
grant execute on function public.save_page_crops(uuid, integer, jsonb, jsonb, uuid[]) to authenticated;

-- The Questions page's list of banks. security_invoker: the caller's RLS on
-- questions and files applies.
create or replace view public.question_sources with (security_invoker = true) as
  select f.course_id, q.file_id, f.name as file_name, f.folder_id, f.eff_teacher_only,
         count(*) as questions, count(distinct q.page) as pages
  from public.questions q
  join public.files f on f.id = q.file_id
  group by f.course_id, q.file_id, f.name, f.folder_id, f.eff_teacher_only;

revoke all on table public.question_sources from anon, authenticated;
grant select on table public.question_sources to authenticated;
