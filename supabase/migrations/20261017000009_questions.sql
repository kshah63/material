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

-- A question: up to four boxes on one bank, printed one under another.
create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  -- The course is the file's course; the purge's hard delete takes questions with it.
  file_id    uuid not null references public.files(id) on delete cascade,
  topic_id   uuid references public.question_topics(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- What question_boxes points at, so that a box's file is always its question's.
  constraint questions_id_file_key unique (id, file_id)
);
create index if not exists questions_file_idx  on public.questions (file_id);
create index if not exists questions_topic_idx on public.questions (topic_id);

-- A question's boxes, on any pages of its file, printed in box_no order. Four
-- at most: a past paper's question runs over at most four pages. A stimulus
-- printed once above several questions is box 1 of each, copied: every
-- question owns its rows, so changing one question never changes another.
create table if not exists public.question_boxes (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  -- The question's file, kept right by the foreign key below, so that a box's
  -- policies read files directly, as a question's do. Through questions instead,
  -- every box row re-ran the questions policy: 12 times slower to list a course.
  file_id     uuid not null,
  box_no      smallint not null check (box_no between 1 and 4),
  page        integer not null check (page >= 1),
  -- PDF user-space points on the source page, before its /Rotate, CropBox
  -- offset included: what pdf.js convertToPdfPoint returns, and what
  -- convertToViewportPoint takes to render the box. y grows upwards.
  x0 real not null, y0 real not null, x1 real not null, y1 real not null,
  -- Reading order on its page (columns left to right, then top to bottom),
  -- set by the crop screen every time the page is saved.
  pos         smallint not null default 0,
  constraint question_boxes_question_fkey foreign key (question_id, file_id)
    references public.questions (id, file_id) on delete cascade,
  constraint question_boxes_box_check check (
    x1 > x0 and y1 > y0
    and x0 >= -14400 and y0 >= -14400 and x1 <= 14400 and y1 <= 14400),
  -- Deferrable, so that one statement can renumber a question's boxes.
  constraint question_boxes_box_no_key unique (question_id, box_no) deferrable initially immediate,
  -- The same box twice in one question would print twice.
  constraint question_boxes_once_key unique (question_id, page, x0, y0, x1, y1)
);
create index if not exists question_boxes_file_page_idx on public.question_boxes (file_id, page, pos);

-- Who may crop this file: admin, or in_charge of its course; the file is live
-- and students cannot see it. The one place the rule is written: the write
-- policies below and the page view both ask it.
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

-- A question's topic, if any, belongs to its file's course.
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

-- The courses whose questions the caller may read: every course for an admin,
-- otherwise those they teach or are in_charge of; students never. Asked once per
-- query, so the read policies below look only at the caller's own courses' files
-- instead of running files_select over every file there is.
create or replace function public.question_course_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.is_admin() then (select coalesce(array_agg(c.id), '{}') from public.courses c)
    else (select coalesce(array_agg(m.course_id), '{}') from public.course_memberships m
          where m.user_id = (select auth.uid()) and m.role in ('teacher','in_charge'))
  end;
$$;

alter table public.question_topics enable row level security;
alter table public.questions       enable row level security;
alter table public.question_boxes  enable row level security;

drop policy if exists question_topics_select on public.question_topics;
create policy question_topics_select on public.question_topics for select
  to authenticated using (
    (select public.is_admin()) or public.course_role(course_id) in ('teacher','in_charge')
  );

-- Teachers, in_charge and admins of the file's course; students never. The
-- EXISTS runs files_select as the caller, so the file's own rule decides the rest.
-- The course list keeps it to the caller's own courses' files: without it every
-- read ran files_select over every file there is (200 ms at 10,000 files).
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions for select
  to authenticated using (
    exists (
      select 1 from public.files f
      where f.id = questions.file_id and f.deleted_at is null
        and f.course_id = any ((select public.question_course_ids())::uuid[])
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

-- A question is deleted outright, with no Trash: the bank itself is untouched.
drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions for delete
  to authenticated
  using (public.can_crop_file(file_id));

-- A box's policies are its question's, on the same file. questions_select is
-- copied rather than called, so the planner can still check files once per
-- query; the test suite fails if the two ever disagree.
drop policy if exists question_boxes_select on public.question_boxes;
create policy question_boxes_select on public.question_boxes for select
  to authenticated using (
    exists (
      select 1 from public.files f
      where f.id = question_boxes.file_id and f.deleted_at is null
        and f.course_id = any ((select public.question_course_ids())::uuid[])
    )
  );

drop policy if exists question_boxes_insert on public.question_boxes;
create policy question_boxes_insert on public.question_boxes for insert
  to authenticated
  with check (public.can_crop_file(file_id));

drop policy if exists question_boxes_update on public.question_boxes;
create policy question_boxes_update on public.question_boxes for update
  to authenticated
  using (public.can_crop_file(file_id))
  with check (public.can_crop_file(file_id));

drop policy if exists question_boxes_delete on public.question_boxes;
create policy question_boxes_delete on public.question_boxes for delete
  to authenticated
  using (public.can_crop_file(file_id));

-- Column privileges: created_by comes from its default; a saved question can
-- change its topic, never its file; a saved box can change its place, box and
-- reading order, never its question, file or page.
revoke all on table public.question_topics from anon, authenticated;
grant select on table public.question_topics to authenticated;
revoke all on table public.questions from anon, authenticated;
grant select, delete on table public.questions to authenticated;
grant insert (id, file_id, topic_id) on table public.questions to authenticated;
grant update (topic_id) on table public.questions to authenticated;
revoke all on table public.question_boxes from anon, authenticated;
grant select, delete on table public.question_boxes to authenticated;
grant insert (question_id, file_id, box_no, page, x0, y0, x1, y1, pos) on table public.question_boxes to authenticated;
grant update (box_no, x0, y0, x1, y1, pos) on table public.question_boxes to authenticated;

-- Save the crop screen's changes to one bank in one transaction, as the caller
-- (RLS decides). The screen calls it once per page; a page's changes can reach
-- a question's boxes on other pages.
--   _add:    new questions, [{id, topic_id, boxes: [{page,x0,y0,x1,y1,pos}, ...]}], box 1
--            first; the id is made by the screen, so a retried save is refused
--   _edit:   saved questions, [{id, topic_id, boxes: [...]}]. topic_id is written only
--            when sent (null clears it). boxes is the whole question in print order:
--            {id} keeps a box where it is, {id,x0,y0,x1,y1,pos} keeps it with a new box
--            and reading order on its own page, and a box with no id is new
--   _remove: saved boxes; a question left with none is deleted
-- Every id must name something in this bank that the caller may change, and an
-- edited question must list or remove every box it has; otherwise nothing at
-- all is written.
create or replace function public.save_crops(
  _file_id uuid,
  _add     jsonb  default '[]'::jsonb,
  _edit    jsonb  default '[]'::jsonb,
  _remove  uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  n       integer;
  touched uuid[];
  listed  jsonb;
  a       jsonb;
  qid     uuid;
begin
  -- Removals first, so an edited question drops a box by removing it.
  with d as (
    delete from public.question_boxes b
     where b.id = any(_remove) and b.file_id = _file_id
    returning b.question_id
  )
  select count(*), coalesce(array_agg(distinct d.question_id), '{}') into n, touched from d;
  if n <> cardinality(_remove) then
    raise exception 'A question in this bank was changed elsewhere, or cannot be changed by you.'
      using errcode = '42501';
  end if;

  -- A topic is written only when the edit sends one, so a page save never undoes
  -- a topic somebody else set meanwhile. The update also locks each edited
  -- question until this save commits, so a second save of it waits for this one.
  update public.questions q
     set topic_id = case when e ? 'topic_id' then (e ->> 'topic_id')::uuid else q.topic_id end
    from jsonb_array_elements(_edit) e
   where q.id = (e ->> 'id')::uuid and q.file_id = _file_id;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(_edit) then
    raise exception 'A question in this bank was changed elsewhere, or cannot be changed by you.'
      using errcode = '42501';
  end if;
  touched := touched || array(select (e ->> 'id')::uuid from jsonb_array_elements(_edit) e);

  -- Each edited question's boxes, numbered by their place in its list.
  select coalesce(jsonb_agg(x.b || jsonb_build_object('question_id', e ->> 'id', 'box_no', x.ord)), '[]')
    into listed
    from jsonb_array_elements(_edit) e,
         jsonb_array_elements(e -> 'boxes') with ordinality as x(b, ord);

  -- A box the list neither keeps nor removes was added since this screen read the bank.
  if exists (
    select 1 from jsonb_to_recordset(_edit) as e(id uuid)
      join public.question_boxes b on b.question_id = e.id
     where not exists (
       select 1 from jsonb_to_recordset(listed) as l(question_id uuid, id uuid)
        where l.question_id = b.question_id and l.id = b.id)
  ) then
    raise exception 'A question in this bank was changed elsewhere, or cannot be changed by you.'
      using errcode = '42501';
  end if;

  -- A kept box stays on its page, as the column grants say.
  if exists (
    select 1 from jsonb_to_recordset(listed) as l(question_id uuid, id uuid, page integer)
      join public.question_boxes b on b.id = l.id and b.question_id = l.question_id
     where l.page <> b.page
  ) then
    raise exception 'A saved box keeps its page: remove it and add it again.'
      using errcode = '23514';
  end if;

  update public.question_boxes b
     set box_no = l.box_no,
         x0 = coalesce(l.x0, b.x0), y0 = coalesce(l.y0, b.y0),
         x1 = coalesce(l.x1, b.x1), y1 = coalesce(l.y1, b.y1),
         pos = coalesce(l.pos, b.pos)
    from jsonb_to_recordset(listed)
         as l(question_id uuid, box_no smallint, id uuid, x0 real, y0 real, x1 real, y1 real, pos smallint)
   where l.id is not null and b.id = l.id and b.question_id = l.question_id;
  get diagnostics n = row_count;
  if n <> (select count(*) from jsonb_to_recordset(listed) as l(id uuid) where l.id is not null) then
    raise exception 'A question in this bank was changed elsewhere, or cannot be changed by you.'
      using errcode = '42501';
  end if;

  insert into public.question_boxes (question_id, file_id, box_no, page, x0, y0, x1, y1, pos)
  select l.question_id, _file_id, l.box_no, l.page, l.x0, l.y0, l.x1, l.y1, l.pos
    from jsonb_to_recordset(listed)
         as l(question_id uuid, box_no smallint, id uuid, page integer,
              x0 real, y0 real, x1 real, y1 real, pos smallint)
   where l.id is null;

  -- A question that lost a box closes the gap, or goes if it has none left.
  update public.question_boxes b
     set box_no = r.n
    from (select id, row_number() over (partition by question_id order by box_no) as n
            from public.question_boxes where question_id = any(touched)) r
   where b.id = r.id and b.box_no <> r.n;
  delete from public.questions q
   where q.id = any(touched)
     and not exists (select 1 from public.question_boxes b where b.question_id = q.id);

  for a in select value from jsonb_array_elements(_add) loop
    if coalesce(jsonb_array_length(a -> 'boxes'), 0) = 0 then
      raise exception 'A question needs at least one box.' using errcode = '23514';
    end if;
    insert into public.questions (id, file_id, topic_id)
    values ((a ->> 'id')::uuid, _file_id, (a ->> 'topic_id')::uuid)
    returning id into qid;
    insert into public.question_boxes (question_id, file_id, box_no, page, x0, y0, x1, y1, pos)
    select qid, _file_id, x.ord, x.page, x.x0, x.y0, x.x1, x.y1, x.pos
      from rows from (jsonb_to_recordset(a -> 'boxes')
                      as (page integer, x0 real, y0 real, x1 real, y1 real, pos smallint))
           with ordinality as x(page, x0, y0, x1, y1, pos, ord);
  end loop;
end;
$$;

revoke all on function public.can_crop_file(uuid) from public, anon;
revoke all on function public.question_course_ids() from public, anon;
revoke all on function public.topic_fits(uuid, uuid) from public, anon;
revoke all on function public.save_crops(uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.can_crop_file(uuid) to authenticated;
grant execute on function public.question_course_ids() to authenticated;
grant execute on function public.topic_fits(uuid, uuid) to authenticated;
grant execute on function public.save_crops(uuid, jsonb, jsonb, uuid[]) to authenticated;

-- The Questions page's list of banks. security_invoker: the caller's RLS on
-- question_boxes and files applies. A question counts once however many boxes
-- it has, and a page counts if any box is on it.
create or replace view public.question_sources with (security_invoker = true) as
  select f.course_id, f.id as file_id, f.name as file_name, f.folder_id, f.eff_teacher_only,
         count(distinct b.question_id) as questions, count(distinct b.page) as pages,
         min(b.page) as first_page
  from public.question_boxes b
  join public.files f on f.id = b.file_id
  group by f.id;

revoke all on table public.question_sources from anon, authenticated;
grant select on table public.question_sources to authenticated;
