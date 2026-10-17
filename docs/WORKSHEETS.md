# Worksheet maker

Plan, 2026-10-17, revised the same day after review, again after the owner
answered its five open questions (§2.1, items 10–14), and again after a
review of that revision. Nothing is built yet. The owner has approved the
goal, and this plan is for review before any code is written. The reviews'
findings, and the few this plan does not take, are listed at the end.

## 1. What it is and who uses it

The owner, on the banks: *"for question banks they are usually in pdf format
and usually many questions per page"*. Some pages are digital, with text you
can select. Others are scanned. Many banks mix the two.

The worksheet maker turns those banks into worksheets a teacher can drop into
a child's Pencil Space. It works in four steps:

1. **Crop once.** An in-charge (or an admin) opens a bank PDF and draws a box
   around each question. Each box is saved as a question with its source file,
   page, box and an optional topic. Nobody crops the same question twice.
2. **Suggestions.** The tool proposes boxes. On digital pages it reads
   question numbers ("1.", "Q2") from the PDF's text. On scanned pages AI
   proposes them. A person confirms every box. Nothing unconfirmed is saved.
3. **Pick and print.** A teacher opens a bank page by page, clicks the
   questions they want, and downloads a branded A4 PDF. Each question sits at
   the top of its own page, and the rest of the page is blank for working.
   Short questions go two to a page. Every question is a 300 dpi picture of
   its own box, so nothing else on the bank's page goes with it.
4. **Into Pencil.** The teacher drags the PDF into the child's Space and
   chooses "one page per board".

Roles, per course. Banks live in one bank-holding course per level (§2.1
item 10), so for banks these are roles in that course:

- **in_charge and admin** crop, adjust, delete and tag questions. They can
  also do everything a teacher does.
- **teacher** opens the cropped banks, picks questions and downloads a
  worksheet.
- **student** gets nothing. Students never see questions, crops, topics or
  these screens. A worksheet reaches a child only through Pencil.

These rules are enforced by Postgres RLS. The screens only hide what a person
cannot use.

## 2. Decisions

### 2.1 Decided by the owner, 2026-10-17

1. The tool lives in the materials portal.
2. Banks are PDFs with many questions per page, and a mix of digital and
   scanned pages.
3. Questions are cropped once. Each one keeps its source file, page, box and
   an optional topic. Its course is the file's course.
4. Suggestions come from the text layer on digital pages and from AI on
   scanned pages. A person always confirms them.
5. The output is a branded A4 PDF (§6), with one question at the top of each
   page, or two per page for short ones. (This item also said "vector stays
   vector". Item 11 replaces that: every crop is a picture.)
6. Delivery is by hand. Pencil has no boards API, so the teacher drags the PDF
   in with "one page per board".
7. Plan first. Nothing is built yet.
8. **Teachers download worksheets.** Goal (3) has the teacher get the PDF.
   What follows from it:
   - Today teachers can view banks but not download them (commit a76d16e,
     `app/actions/files.ts:158-160`). Worksheets relax that for crops, and
     only for crops.
   - Every crop is a picture of its own box (item 11, §6.3), so a worksheet
     carries the questions picked and nothing else of the bank. a76d16e's
     restriction still holds for the rest of it.
9. **AI proposes boxes on scanned pages.** Goal (2) says so. What follows from
   it:
   - When an in-charge presses *Suggest boxes*, that page's image is sent to
     Anthropic.
   - It needs an Anthropic API key.
   - The model and its effort setting are chosen by the 20-page measurement in
     §5.2, which also gives the real cost per page. The estimate is about
     $0.001–0.05 a page before thinking tokens.
   - If no setting finds at least 98% of question numbers, AI ships switched
     off and scanned pages are drawn by hand.

The owner (Kartik) answered the plan's five open questions later on
2026-10-17. Each answer is quoted, and the plan is changed to match.

10. **Banks are kept for next year's course, in one bank-holding course per
    level.** *"Yes banks are used for next years course."* Crops belong to one
    file, a file belongs to one course, and the portal cannot share or copy a
    file across courses. A bank kept in a class's course would therefore be
    uploaded and cropped again for next year's course once this one is
    archived (`courses.archived_at`). Instead:
    - each level's banks live in one long-lived bank-holding course, for
      example "Gr 5 question banks", which is never archived;
    - its members are that year's teachers of the level, as teacher, and the
      people who crop, as in_charge. Its banks still sit in teacher-only
      folders (§2.2), so a student let in by mistake sees none of them;
    - crops stay with the file, so they carry over to next year by
      themselves. Nothing is uploaded or cropped again for a new year.

    **Each new year, that course's in_charge updates its teachers** on its
    People page: the year's new teachers of the level ask to join from
    Courses or are added on that page, and those who no longer teach the
    level are removed. An admin is needed only when the people who crop change, because
    only an admin can add or remove an in_charge. Nothing else changes, and no
    schema change is needed. Everyone sees the course in Courses, students
    included. A student's request to join is declined, and a student approved
    by mistake sees no bank (§2.2). Worksheets are made from that course, so
    their file name carries its code (§6.5). A re-upload is still a new file
    whose crops start again (§8.3).
11. **Every crop is a 300 dpi picture.** *"Mostly banks have answers
    separately."* Mostly is not always: some banks print answers on the pages
    their questions are on. A vector crop hides the rest of its source page
    but does not remove it (in testing, `pdftotext` printed every question on
    the source page), so a vector crop from such a page would carry its
    answers to anyone the worksheet reaches, a parent it is emailed to
    included. So every crop, from every bank, digital or scanned, is rendered
    by pdf.js at 300 dpi and re-encoded as JPEG (§6.3). This replaces "vector
    stays vector" (item 5) without waiting for the sample banks, and leaves
    one way to draw a crop instead of three (`renderRegion`, §4.5).

    *Rejected:* a per-bank "answers are separate" switch that gives that
    bank sharp vector crops. It is a promise about every page of a bank, made
    once by whoever uploads it and checked by nothing, and one wrong setting
    sends hidden answers out with every crop from that bank, with nothing on
    the page to show it. At 300 dpi a crop already prints as sharp as the
    page needs.
12. **One fixed topic list per course.** *"Yes one fixed topic list"*, and
    *"Per course is good"*. With item 10 that is one list per level, in its
    bank-holding course, because students run from K1 to Uni
    (`lib/options.ts` `GRADES`) and one centre-wide list would be either too
    coarse or show a Gr 2 picker A-level topics. The owner sends each list
    before the build. It goes in with a one-off snippet in `DEPLOYMENT.md`
    (§3.4), never with the migration, so re-running the migration cannot bring
    a deleted topic back. There is no topic screen; a change is made in the
    SQL editor. Until a course has topics, its topic pickers stay hidden.
13. **A crop is deleted outright, with no Trash.** *"Yes no need for trash."*
    In-charges and admins delete crops outright. A crop is only a box on a
    page:
    - the PDF itself is untouched;
    - redrawing a box takes seconds;
    - nothing else points at a crop, because worksheets are not saved.

    The rule "nobody hard-deletes" still holds for files and folders (§3.4).
14. **Any bank may be cropped, including one a publisher has locked.** *"No
    let us crop any banks."* Some PDFs open without a password but are locked
    against printing or copying, and that lock usually states a publisher's
    terms. The plan recommended cropping only banks the centre owns or is
    licensed to adapt, and refusing locked ones. **The owner has decided
    otherwise: a locked bank is cropped like any other.** pdf.js opens it and
    draws its crops (§6.3), nothing reads a PDF's permissions, and the
    worksheet comes out unlocked. In testing, a bank locked against printing,
    copying and changes (AES-256) gave an unencrypted worksheet holding only
    its crops. A PDF that needs a password just to open is still refused,
    because it cannot be read without one (§4.3).

    This decision is about licensing only. Who sees crops is still §2.2's
    rule that only teacher-only banks can be cropped, which it does not
    change.

### 2.2 Defaults this plan takes (say if any is wrong)

- **Worksheets are not saved.** A teacher's picks are kept in the browser
  tab's `sessionStorage`, per course, as question ids. They survive a reload
  and a visit to the Viewer, and go when the tab closes. The downloaded PDF is
  the record. If saved worksheets are wanted later, use `worksheets` and
  `worksheet_items(question_id … on delete set null)`. That design was
  prototyped, but it is not part of this plan.
- **No numbers are stored or added.** A crop shows the bank's own printed
  number ("7.") because it is inside the box. The worksheet adds none, which
  avoids a page that reads "1. 7.". The order of crops on a page comes from
  where they sit (§3.4, `pos`), not from a number someone has to read
  correctly.
- **"(a)", "(b)" … are sub-parts, never the start of a question.** The owner
  listed "(a)" among question numbers, but in maths banks it almost always
  labels part of a numbered question, and treating it as a start would split
  every multi-part question. A bank that numbers whole questions (a), (b) …
  gets no text-layer proposals, and the in-charge draws its boxes.
- **A question holds up to four boxes.** This was decided by measurement,
  as this plan said it would be: if more than a few percent of questions
  needed a second box, a question would hold several. In ten of the centre's
  banks, 80 of 495 questions need one, which is 16% (§9.2.1):
  - 65 depend on something printed once above their number. Most are a
    problem set's instruction ("Find dy/dx for the following", then sixteen
    bare functions in a table). The rest sit under a figure or table "above";
  - 15 run over a page break. A past paper's free-response question runs
    over as many as four pages, which is where the limit of four comes from.

  So a question is an ordered list of boxes (a `question_boxes` child table,
  `box_no` 1–4), and compose stacks them in order. A shared stimulus is
  cropped once and becomes the first box of every question that uses it.
  A question longer than four boxes is cropped as two questions. §3.4, §4.3
  and §6.2 are still drawn for one box; PR 1 redraws them.
- **Layout is automatic.** Two short questions in a row share a page (§6.2).
  There is no layout control. One-per-page-always is added only if someone
  asks.
- **Label is Lesson or Homework, matching the template's two boards.** The
  default is Homework, because one question per page with room for working is
  homework-shaped.
- **Picks print in bank order:** bank, page, position on the page. There is no
  reordering in v1, only removing a pick.
- **A worksheet over 25 MB still downloads,** with a warning (§4.4).
- **Crop once is a screen hint, not a database rule.** A suggestion that
  overlaps a saved crop is never shown. A hand-drawn box over a saved crop, or
  two in-charges on the same page, can still make a duplicate, and it is
  deleted by hand. If the sample check in §9.2 shows heavy concurrent cropping,
  a before-insert trigger refusing an overlap on the same file and page is the
  fix.
- **Only teacher-only banks can be cropped.** `can_crop_file` requires the
  file's `eff_teacher_only` (§3.4), so the database refuses to crop a bank
  students can open, and the crop screen says "Students can see this file.
  Make it teacher-only before cropping." Two costs:
  - a file that students are meant to see must be made teacher-only before
    its questions can be cropped;
  - if a cropped bank later becomes visible to students (moved, or its
    folder's flag cleared), its crops cannot be added to, changed or deleted
    until it is teacher-only again. The Questions page marks such a bank
    (§4.2), so the change does not go unnoticed.

  The rule is one clause in the one function, and it turns the worst outcome,
  students opening a whole bank, from a folder habit into a refusal.

### 2.3 Open questions for the owner

None. The five this plan asked were answered on 2026-10-17, and are §2.1,
items 10–14.

## 3. Data model

### 3.1 What is new

- **`question_topics`**, the topic list: a course, a name and a position.
- **`questions`**, one row per confirmed box.
- **`question_sources`**, a read-only view: one row per bank with crops, for
  the Questions page.
- **`can_crop_file(file_id)`**, the only place the "who may crop" rule is
  written.
- **`topic_fits(topic_id, file_id)`**, which keeps a crop's topic inside its
  file's course.
- **`save_page_crops(…)`**, the one write path: it saves one page of one file
  in one transaction, as the caller.

There is no worksheet table. Nothing is stored in the Storage bucket, and the
purge needs no change.

### 3.2 Visibility comes from the source file

- **Who can read a question:** an admin, or a teacher or in-charge of its
  file's course, and only while the file is live. The policy is an `EXISTS` on
  `files`, which runs `files_select` as the caller, so the file's own rule
  decides everything else. No teacher-only, `eff_teacher_only` or
  `deleted_at` column is copied onto questions. The teacher-only triggers,
  `recompute_subtree` and `restore_batch` are not touched.
- **There is no `course_id` on questions.** The course is the file's course.
  That removes the composite foreign key, a unique index on `files` and a test
  that only existed to keep two copies of one fact in step. Nothing in the app
  changes a file's course (`registerFile` sets it once, `moveFile` changes
  only the folder, both in `app/actions/files.ts`).
- **Who can write a question:** the person passes `can_crop_file(file_id)`:
  they are an admin or the course's in_charge, the file is live, and students
  cannot see it (§2.2). The same function serves the insert, update and delete
  policies and the AI route (§5.2).
- **A topic must belong to the file's course** (`topic_fits`), on insert and
  on update.
- **Column grants:**
  - `created_by` always comes from `auth.uid()`;
  - a saved crop may change its box, its position and its topic;
  - a saved crop may never change its file or page.
- **Writes go through `save_page_crops`.** It is `security invoker`, so RLS
  and the column grants still decide every row. If any edit or removal names a
  crop that is not on that page, or that the caller may not change, it raises
  an error and nothing at all is written.

### 3.3 Trash, the 30-day purge, and the bank's bytes

- **A bank goes to Trash.** Teachers stop seeing its questions at once, and
  so does everyone else, because the select policy requires a live file. New
  crops on that file are refused.
- **The bank is restored.** Its questions come back unchanged, because
  nothing about them was changed.
- **The bank is purged after 30 days.** The service role deletes the `files`
  row, and its questions go with it (`on delete cascade`).
- **Why cascade is required.** With the default `NO ACTION`, the purge's row
  delete would fail on the first bank that has crops. Both purge copies return
  500 on the first failure (`app/api/cron/purge/route.ts:49-55`,
  `supabase/functions/purge/index.ts`), so all later purging would stop. With
  cascade, neither purge copy changes.
- **A crop is deleted.** Its row goes at once. There is no Trash for crops
  (§2.1 item 13).
- **A topic is deleted.** Its questions' `topic_id` becomes null. A course
  deleted takes its topics with it.
- **The bank's bytes are assumed never to change.** A crop is a page and a box
  on a file id. Uploads always use a fresh object name
  (`hooks/useUploader.ts:139-140`), so a re-upload is a new file. But nothing
  enforces that: the storage policy `course_materials_update` lets an
  in_charge or admin overwrite objects under their course's path, and the TUS
  upload sends `x-upsert: true` (`lib/upload/resumable.ts:75`). A crafted
  upload to an existing file's path would replace the bank in place, and
  every crop would then point at different content. §9.4 item 4 closes this.

### 3.4 Migration: `supabase/migrations/20261017000009_questions.sql`

The migration must sort after `20260612000008_country.sql`. If it is written
on a later day, use that day's date and keep the suffix `000009`.

It can be run twice, like the existing files, because `DEPLOYMENT.md` §2
pastes SQL by hand. Append it to `supabase/schema.sql` under
`-- >>> 20261017000009_questions.sql`.

```sql
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
```

Make these hand edits in the same PR:

- `lib/types.ts`: add `Question`, `QuestionTopic` and `QuestionSource`.
- `DEPLOYMENT.md` §2:
  - add `question_topics` and `questions` to the "Verify" table list, plus a
    line saying "already deployed? run just this file";
  - add the topic snippet, run once per bank-holding course from the
    owner's list (§2.1 item 12):

    ```sql
    insert into public.question_topics (course_id, name, position) values
      ('<course id>', '<topic>', 1), ('<course id>', '<topic>', 2);
    ```
- `README.md`:
  - add two rows to the permission matrix: *Crop questions*
    (in_charge, admin) and *Pick questions, download a worksheet* (teacher,
    in_charge, admin);
  - change "Nobody can hard-delete" to say that it covers files and folders,
    and that a crop is deleted outright (§2.1 item 13).

### 3.5 How the app reads it

- **The Questions page** reads `question_sources` for the course, one row per
  bank with crops. It has no `LIMIT`; it is bounded by the course's files.
  Folder names for the labels come from the existing `listAllFolders`.
- **The page view** reads every crop of one file with `listFileQuestions`.
  - Supabase's API returns at most the project's max rows (1,000 by default)
    per request, and a 200-page bank can hold well over 1,000 crops.
  - So it asks for `count: 'exact'` and pages with `.range()` until it holds
    that many rows, ordered by `page, pos, id`. `id` is unique, so the order is
    total and no row repeats or goes missing between pages.
  - It also reads the course's topics.
- **The worksheet modal** reads the picked rows by id, and signs their banks,
  in one call (§4.4).

Measured on a scratch Postgres 16, as a teacher, with 5,000 crops in one
course among 30,000:

| Read | Time |
|---|---|
| `question_sources` for the course (41 banks) | 11 ms |
| One bank's crops, ordered (125 rows) | 5 ms |
| 20 picks by id | 5 ms |
| Saving one page with 12 new crops (as in-charge) | 5 ms |
| `question_sources` for a course of 25,200 crops (12 banks), among 201,600 | 34–60 ms |
| One 2,100-crop bank, ordered, per range request of 1,000 (3 requests) | 4–8 ms |

The last two rows were seeded separately, as a level's bank-holding course
after some years (§8.1): 8 courses, each of 12 banks of 300 pages with 7 crops
a page.

The policies call `is_admin()` once per query, as `(select public.is_admin())`.
These are floors, not production numbers: the shim's `auth.uid()` is simpler
than Supabase's, and the hardware is different. §9.2 step 1 repeats them on
Supabase with a seeded course.

### 3.6 Verified

The migration above was tested on a scratch Postgres 16 database:

- all 8 existing migrations applied first, then this file applied **twice**;
- the shim below for Supabase's roles, `auth.uid()` and storage tables;
- six people: an admin, an in-charge, a teacher and a student in course A, and
  an in-charge and a teacher in course B;
- course A has `bank.pdf` in a teacher-only folder and `open.pdf`, which
  students can see.

Results:

- **Who sees what.**

  | Person | Questions (A has 2, B has 1) | Topics |
  |---|---|---|
  | admin | 3 | 2 |
  | in_charge A | 2 | 1 |
  | teacher A | 2 | 1 |
  | student A | 0 | 0 |
  | in_charge B | 1 | 1 |
  | teacher B | 1 | 1 |

  `question_sources` shows the same counts. anon gets "permission denied" on
  all three.
- **Refused:**
  - a teacher or a student inserting a crop, directly or through
    `save_page_crops`;
  - in_charge B cropping a course-A file;
  - in_charge A cropping `open.pdf`, which students can see;
  - a topic from another course, on insert and on update;
  - forging `created_by`;
  - changing `file_id` or `page`;
  - NaN (in any corner), inverted or page-0 boxes;
  - a teacher, or in_charge B, updating or deleting a crop (0 rows).
- **`save_page_crops` is all or nothing.** Each of these raised an error and
  left the page exactly as it was: one good new crop together with an edit of
  a crop on another page; one good new crop with the removal of another
  course's crop; one good and one inverted new crop. A valid save of an edit
  and a removal wrote both.
- **Trash and purge:**
  - After the bank went to Trash through the real `soft_delete_file`,
    everyone lost its 2 questions, `can_crop_file` was false, and inserting a
    crop was refused. After `restore_batch`, all of them came back.
  - Hard deletes of the file, and of its folder, cascaded to the questions.
- **A cropped bank made visible to students** (its folder's teacher-only flag
  cleared by the in-charge): teachers still saw its 2 crops,
  `question_sources` reported `eff_teacher_only = false`, `can_crop_file` was
  false, and deleting a crop removed 0 rows.

The owner's answers (§2.1, items 10–14) changed only comments in the
migration. It was re-run after them, with the same results.

The shim, which PR 1 commits as `supabase/tests/shim.sql`:

```sql
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
```

§9.1 turns the proof script into `supabase/tests/questions.sql`, a test file
that stays in the repo.

## 4. Screens, file by file

The screens follow the existing ones:

- **Pages** follow `app/(app)/courses/[courseId]/trash/page.tsx`: await
  `params`, `requireProfile`, `getCourse` or `notFound()`, `getCourseRole`,
  `capabilitiesFor`, redirect if the role is not allowed, and
  `export const dynamic = "force-dynamic"`.
- **Server actions** go in `app/actions/*.ts` and return
  `{ ok: true as const, … } | { ok: false as const, error }`.
- **On the client**, a local `run` helper shows a toast and then calls
  `router.refresh()`.
- **Styling** uses inline CSS variables and the `.btn`, `.card` and `.field`
  classes.
- **Known options** use a native `<select className="field">` whose first row
  is the "no answer" row, or a two- or three-option strip like the
  AdminConsole tabs.
- **Reads from the client are one call per screen event.** The Next docs say
  Server Functions are designed for mutations and that the client dispatches
  them one at a time, and suggest doing parallel work inside a single Server
  Function (`01-app/01-getting-started/07-mutating-data.md:206`). So no screen
  makes one action call per bank or per row.

### 4.1 Entry points

- **`components/browser/Rows.tsx`**: in `FileItemRow`'s menu, add *Crop
  questions* straight after *Open*. Only managers see that menu.
- **`components/browser/Browser.tsx`**:
  - pass `onCrop={() => router.push(`/courses/${courseId}/questions/${file.id}`)}`;
  - split the header link group, so that *Questions* shows when
    `caps.canSeeTeacherOnly`, while *People* and *Trash* stay
    `caps.canManage`.
- **`components/icons/index.tsx`**: add one `CropIcon`, built on `Base` and
  used in both places.

### 4.2 Questions: the cropped banks

**Route:** `app/(app)/courses/[courseId]/questions/page.tsx`.
`!caps.canSeeTeacherOnly` redirects to the course, so students never reach
it. The route loads `question_sources` and `listAllFolders` for the course,
then renders `components/questions/QuestionsView.tsx`.

**Shell:** copied from TrashView.

- A back link with ArrowLeftIcon and the course name.
- An h1, "Questions", at size 30.
- The subtitle "Cropped from this course's banks. Open one and pick questions
  for a worksheet."
- The page is about 820 px wide.

**Rows.** One per bank with crops, sorted by folder path and name:

- the label is the folder path and name, "Banks / Gr 5 / Fractions.pdf", so
  two banks with the same name in different folders cannot be confused
  (names are only de-duplicated per folder, `hooks/useUploader.ts:83-95`);
- a count line, "132 questions on 18 pages";
- a bank students can see gets a warning line, "Students can see this file.",
  and for managers "Make it teacher-only to change its crops.";
- clicking a row opens the page view (§4.3) at the bank's first page with
  questions.

The picks bar (§4.4) shows here too while there are picks.

**States.**

- **Empty, managers:** "Nothing cropped in this course. Banks kept for next
  year are cropped in the level's question-bank course: open a bank PDF there
  and choose *Crop questions* from its menu. Crops of a bank in Trash come
  back when it is restored."
- **Empty, teachers:** "Nothing cropped in this course. Question banks are
  kept in each level's question-bank course, in your course list."

**Why there is no list of every crop.** The first draft listed crops as
thumbnails across all banks, 50 a page, with source and topic filters. Every
thumbnail needs its whole bank downloaded, so one topic-filtered page could
mean hundreds of MB, and teachers who look for "Q5–Q12 on p. 14" from the
paper copy would page through thousands of rows. The page view below shows a
whole bank page with its boxes and costs one bank download. A list across
banks becomes useful once topics are in use across several banks; it is filed
as an issue (§9.3) with the cost rules it needs.

### 4.3 The page view: crop and pick

**Route:** `app/(app)/courses/[courseId]/questions/[fileId]/page.tsx`.
`!caps.canSeeTeacherOnly` redirects to the course. The route loads:

- the file, with `getFile(fileId)` under the session. If the file is missing,
  in Trash or in another course, the route returns `notFound()`.
- its questions (§3.5) and the course's topics;
- `?page=` as the page to open first;
- for managers, `can_crop_file(fileId)` and the file's `eff_teacher_only`;
- `aiEnabled`, which is true when `aiConfig()` (§4.5) returns a
  configuration.

It renders one client component, `components/questions/PageView.tsx`.

**Layout.**

- The screen is a fixed full-screen surface (`fixed inset-0 z-50`), like the
  Viewer, so the 272 px sidebar does not shrink the page.
- **Header:**
  - a back link to Questions;
  - the file name;
  - a **page select** with previous and next buttons. Each row reads
    "p. 12 · 6 questions". Managers see every page; a page with unsaved
    changes reads "p. 12 · not saved". Teachers see only pages with
    questions. It is picked from a list, works at every width and renders no
    thumbnails;
  - **Topic**, a select whose first row is "Any topic". It narrows the page
    select to pages with that topic and dims crops with other topics. Hidden,
    like every topic picker, while the course has no topics;
  - for managers on a croppable bank: *Topic for new boxes* (first row "No
    topic") and *Save* (reads "Save 3" while this page has unsaved changes,
    disabled when there are none).
- **Body:** the page rendered at fit-width, with an SVG overlay for the
  boxes.
- **Picks bar** at the bottom, copied from `Browser.tsx:402-443`: "{n} picked
  · *Make worksheet* · ×".

**Picking (everyone).**

- A teacher clicks a saved crop to pick it, and again to unpick it. A picked
  crop gets a berry wash and a tick.
- A manager clicks a crop to select it (see below), and its toolbar has
  *Pick*. On a bank they cannot crop, a manager's click picks, as a
  teacher's does.
- A teacher's page ends with the line "A crop cut off? Tell your course
  in-charge which bank and page."

**Cropping (managers, on a bank `can_crop_file` allows).**

- **Saved crops** have a solid indigo outline and their topic. Click one to
  select it.
  - A selected crop shows edge and corner handles, a Topic select, *Pick* and
    *Delete*.
  - Drag an edge or corner to resize it. Drag inside it to move it.
- **Drafts** have a solid berry outline.
  - Drag on empty page to draw one. Drags smaller than 10 pt are ignored.
  - New drafts take the *Topic for new boxes*.
- **Suggestions** (§5) have a dashed outline.
  - Click one to accept it.
  - An amber "?" marks one to check: its box disagrees with the model's
    (IoU below 0.5), or it continues from the previous page.
  - *Accept all (n)* accepts only the suggestions without "?". Each "?" one
    needs its own click, so the doubtful boxes are the ones a person looks at.
  - A suggestion that overlaps a saved crop (IoU > 0.5) is never shown. This
    is the screen's hint toward "crop once" (§2.2).
- Delete or Backspace removes the selected box. Esc deselects.
- **Saving, one page at a time.**
  - A page is saved when the in-charge leaves it (next, previous, the page
    select or the back link) and when they press *Save*.
  - The save is one call to `save_page_crops`, one transaction. The action
    then reads the page's crops back, and the screen replaces that page's
    boxes with them.
  - **If a save fails, nothing was written.** The page's drafts stay on
    screen, the page select marks it "not saved", and a line on the page reads
    "Not saved: {reason}. *Try again*". The in-charge can keep working on other
    pages. When the reason is that someone else changed a crop on this page,
    trying again cannot work, so the line offers *Reload page* instead, which
    shows what is saved and drops this page's drafts.
  - Leaving the screen with unsaved pages triggers the browser's leave
    warning. A crashed or evicted tab loses at most the page in hand, because
    every page left behind was saved.

**AI (scanned pages only).** A *Suggest boxes* button shows on a page that
§5.1 calls scanned, when `aiEnabled` is true and the page has no AI result in
this tab yet.

- While it runs, that page shows a spinner and "Reading the page…". The
  request belongs to its page: the in-charge can move to other pages, and the
  boxes appear when they come back.
- The result is kept in the tab, per file and page, so coming back to the
  page shows it again without a new call, and the button does not return.

**States, in words.**

- **Loading:** a spinner and "Preparing…". When `files.size_bytes` is over
  10 MB it reads "Downloading bank.pdf · 48 MB…" instead.
- **Error:** a card titled "Can't open this file", with the reason:
  - "Not found or not permitted." (from `getViewUrl`);
  - "The download failed. Try again.";
  - "This PDF needs a password to open. Upload an unlocked copy.";
  - "This file isn't a readable PDF." (pdf.js `InvalidPDFException`).

  A bank locked by its publisher against printing or copying is not an
  error: it opens like any other (§2.1 item 14).
- **A bank students can see** (managers): the crop tools are off and a banner
  reads "Students can see this file. Make it teacher-only before cropping."
- **A page with no proposals** (managers): "No suggestions on this page. Drag
  to draw a box." On a scanned page with AI on, *Suggest boxes* sits beside it.
- **AI answers:**
  - boxes come back: they show as suggestions;
  - none come back: "No questions found on this page. Draw the boxes.";
  - the model ran out of room (`max_tokens`): "Too many questions to read at
    once. Draw the rest.";
  - any other answer (a non-200 status, a body that is not JSON, a timeout or
    a network failure): "Couldn't get suggestions. Draw the boxes."

**Server actions:** `app/actions/questions.ts` (`"use server"`).

- `savePage(courseId, fileId, page, { add, edit, remove })` calls
  `save_page_crops`, then reads that page's crops. It returns the rows or the
  error, and revalidates `/courses/${courseId}/questions`.
- `preparePicks(courseId, ids)` is for the modal (§4.4).
- Both use `createClient()`, so RLS decides who may do this, and neither adds
  a role check in TypeScript.

### 4.4 Make worksheet

**Picks** are question ids in `sessionStorage` under one key per course, read
and written inside `try`/`catch` so a blocked storage only means picks do not
survive a reload. They persist across pages, banks and a visit to the
Viewer.

**Opening the modal** first calls `preparePicks(courseId, ids)` once. In one
action it:

- reads the picked rows by id, under RLS, with their file names and folders;
- signs every bank those rows need with one `createSignedUrls(paths, 60)`
  call, after selecting the `files` rows under the caller's session, the same
  rule as `getViewUrl`;
- returns the rows, the URLs, and the ids it could not find.

The browser starts every bank's download as soon as the URLs arrive, skipping
banks already open in the tab. Picks that no longer exist (a deleted crop, or
a bank in Trash) are dropped from the picks with the line "2 picked questions
are no longer available and were removed."

Then the modal renders each pick once, to the 300 dpi JPEG that will print
(§6.3 steps 1–2), in bank order, with `page.cleanup()` after each page's last
pick (§4.5), and shows that JPEG, scaled by CSS, as the pick's thumbnail. What
the teacher checks is the picture that prints. *Download PDF* only places the
held JPEGs on the template pages and saves. Removing a pick drops its JPEG.

**`components/questions/WorksheetModal.tsx`** is a `Modal` 560 px wide. It
contains:

- the picks in bank order (bank by folder path and name, then page, then
  position), each with its picture, its meta line ("Fractions.pdf · p. 4 ·
  Fractions") and remove ×;
- **Label:** *Lesson* | *Homework*, default Homework;
- *Download PDF* (primary), enabled once every pick is drawn.

**While the modal opens**, it shows a spinner and progress text such as
"Fetching bank.pdf (2 of 3)…" and then "Drawing question 4 of 12…". Drawing
took 0.6–1.0 s for 16 questions from a digital bank and 9.5–12 s for 20
questions from 20 different pages of a 300 ppi colour scan, in Node, and is
slower on an iPad (§6.4).

**When *Download PDF* is done:**

- the browser downloads the file (§6.5);
- a toast says "Downloaded … · 2.1 MB";
- over 25 MB, the file still downloads, and the modal adds the warning "Over
  25 MB. Pencil may refuse it; if it does, make two smaller worksheets." The
  threshold is Pencil Files' limit until §9.2 step 1 measures the drag-in
  limit.

**On failure** to fetch or draw from a bank, no PDF is made, and the error
names the bank, e.g. "bank.pdf could not be read: …".

### 4.5 Shared code

Client-only code is loaded with `await import()` inside client handlers, as
the Next docs say for client-only libraries (`02-guides/lazy-loading.md`).

**`lib/worksheet/source.ts`** opens banks in the browser.

- `openBank(fileId, url)` fetches the whole file (`fetch(url).arrayBuffer()`)
  and opens it with pdf.js. One `PDFDocumentProxy` per bank per tab.
- pdf.js transfers the bytes it is given to its worker, which leaves the
  caller's copy empty. The tab keeps no second copy, and needs none: pdf.js
  is the only thing that reads a bank, for the page view, the AI render and
  the worksheet modal alike (§6.3).
- `renderRegion(page, box, scale, canvas)` is the only caller of
  `page.render`. The page view, the AI render and the modal all use it, with
  pdf.js's defaults: `intent: "display"` and the default `annotationMode`.
- The tab keeps up to 100 MB of banks open, each counted at its file size
  (the worker's copy). The least recently used bank is closed with
  `destroy()` first. The bank on screen, and every bank the worksheet modal
  needs while it is open, are never closed. A single bank over the budget
  still opens, and a worksheet from several big banks never loses one
  halfway, after its 60-second URL (§4.4) has expired. The budget applies
  again when the modal closes.
- Every caller that renders a page calls `page.cleanup()` when it is done
  with it: the page view when it leaves a page, the AI render after encoding,
  and the modal after the last pick on each page (picks are in bank order, so
  a page's picks are consecutive). Without it pdf.js keeps every decoded page
  for the life of the bank: 1.2 GB after 40 pages of a 300 ppi colour scan,
  against about 285 MB with it.
- pdf.js setup:
  - **build:** the legacy build, `pdfjs-dist/legacy/build/pdf.mjs`;
  - **worker:** `new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url)`, which Turbopack emits under `/_next/static`;
  - **assets:** `wasmUrl`, `cMapUrl`, `standardFontDataUrl` and `iccUrl` point
    under `/pdfjs/`. Without `iccUrl`, pdfjs-dist 6.4.299 warns "No CMYK ICC
    profile support due to missing `iccUrl` API option" and CMYK images, common
    in print-ready banks, show off-colour.

**`lib/worksheet/propose.ts`** holds the §5 logic as pure functions: what
kind of page it is, text-layer proposals, ink extents, snapping AI results,
and reading order (`pos`). Compose does not need the kind of page, because
it draws every crop the same way (§6.3).

**`lib/worksheet/compose.ts`** builds the output PDF (§6) in two steps:
`drawPick` renders one crop to its 300 dpi JPEG through `renderRegion` when
the modal opens (§4.4), and `save` places the held JPEGs on the template
pages with `pdf-lib`.

**`lib/worksheet/ai.ts`** (server only) reads `ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL` and `ANTHROPIC_EFFORT`. `aiConfig()` returns the
configuration, or null when it is not set up (§5.2). The page view and the
route both ask it, so "is AI on" is written once.

### 4.6 Everything touched

**New files:**

- the two pages and the route (§4.2, §4.3, §5.2);
- `app/actions/questions.ts`;
- `components/questions/{QuestionsView,PageView,WorksheetModal}.tsx`;
- the four `lib/worksheet` files;
- `public/worksheet/template-lesson.pdf` and `template-homework.pdf` (§6.1);
- `scripts/copy-pdfjs-assets.mjs`;
- the migration;
- `supabase/tests/{shim.sql,questions.sql,run.sh}`.

**Changed files:**

- `Rows.tsx`, `Browser.tsx`, `icons/index.tsx`;
- `lib/queries.ts`, which gains `getFile`, `listFileQuestions`,
  `listTopics` and `listQuestionSources`;
- `lib/types.ts`;
- `proxy.ts`: its matcher must also skip `pdfjs/` and `worksheet/`. Otherwise
  every `.wasm`, `.bcmap`, `.pfb`, `.icc` and template request costs a
  Supabase `getUser()` round trip.
- `package.json`:
  - new dependencies: `pdfjs-dist` 6.4.299, `pdf-lib` 1.17.1, and later
    `@anthropic-ai/sdk` and `zod`;
  - a `postinstall` that copies
    `node_modules/pdfjs-dist/{wasm,cmaps,standard_fonts,iccs}` into
    `public/pdfjs/`, so they always match the worker's version;
  - `pdfjs-dist` declares Node 22.13 or newer.
- `.gitignore` (`/public/pdfjs/`);
- `supabase/schema.sql`, `DEPLOYMENT.md`, `README.md` and `.env.example`.

`next.config.ts` stays empty.

## 5. Suggestions

Suggestions are never saved. They become drafts only when a person accepts
them, and rows only when their page is saved.

### 5.1 Digital pages: the text layer (free, in the browser, on page open)

**Kind of page.** This is decided per page, not per file, in this order:

1. **Scanned:** the largest image covers at least half the page (pdf.js
   `recordImages`, then `page.imageCoordinates`). This is checked first, so an
   OCR layer over a scan never counts as text. In testing, a partial OCR layer
   stretched a box down to the foot of the page.
2. **Digital:** otherwise, at least 20 visible characters. The bar was 100
   until a real page failed it: a page of graphs under one printed question
   has only its label line. A text item counts as visible only if the
   rendered page has ink inside its bounding box. pdf.js
   reports no render mode per text item (a `TextItem` has `str`, `dir`,
   `transform`, `width`, `height`, `fontName` and `hasEOL`), so this ink test is
   what rejects invisible text drawn in render mode 3.
3. **Neither** (text turned into outlines): no text-layer proposals and no AI.
   The in-charge draws the boxes.

**Proposals.** These rules were first written against made-up pages, then
rewritten against ten of the centre's own banks (§9.2.1). Five banks tuned
them and five more tested them. `docs/worksheets/textlayer/propose.mjs` is the
rules as run. The made-up pages still pass: two columns, a numbered list
inside a question, an offset CropBox, `/Rotate 90` and label variants.

1. **Coordinates.** Map every point through `viewport.convertToViewportPoint`
   and `convertToPdfPoint`. That one path handles `/Rotate` and CropBox
   offsets. A past-paper bank's pages are offset by 50 pt, so this is not
   academic.
2. **Lines.** Group body-size text items by vertical centre, within half a
   glyph height. Body size is the median height, weighted by characters.
   - Items under ¾ of body size never start a line. Word's maths sets every
     sub- and superscript, and both halves of every fraction, as items of
     their own. As lines of their own they shrink the gap above a label to
     nothing.
   - Each small item joins the nearest line beside it, and that line's top
     and bottom take it in. Left out, a fraction's numerator above the next
     label reads as the last ink of the question above.
3. **Labels.** A label is a line's first token, matching, case-insensitive,
   one of:
   - `^(?:Q(?:uestion)?|EX|Example)\s*(\d{1,3})(?:\s*[.):](?!\d)|$)`, a
     prefixed number;
   - `^(\d{1,3})[.):](?!\d)`, a bare number with its stop;
   - `^(?:(?:Q(?:uestion)?|EX|Example)\s*)?(\d{1,3})[.):]\s+\S`, the number
     and its text merged into one item.

   Later in a line, `^(\d{1,3})[.)]` is a label only as the next cell of a
   grid row (rule 4). These accept "1.", "1)", "Q2", "Question 3:", "EX 1:",
   "EX 7 :" and "12. Express …". They reject "(a)", "2.5", "3:15", "A1",
   "1/2", and a bare "78" at the start of a table's row. A bare number was
   once accepted, and a column of consecutive data values became a run of
   questions.
4. **Runs.** Labels chain into runs of consecutive numbers, and every run is
   kept. A bank page restarts its numbering for each section, up to four
   times on one page.
   - A label continues a run when it is the next number and either sits
     under the run's left edge, within 6 pt, or follows the run's last label
     on the same line. The second makes the run a **grid**: a problem set
     printed as a table, one question per cell.
   - When two runs could take a label, a label with a gap above it goes to
     the run whose labels all have one. Otherwise it goes to the latest run.
   - A run needs two labels, or a gap above its one label taller than body
     text. Measuring against body text matters, because a line that holds
     a big fraction is tall.
   - A run that lies wholly between two labels of another run is a list
     inside that question. It is dropped.
5. **Columns.** An empty vertical band in the middle 30–70% of the width is a
   gutter only if each side carries a run of two or more of its own. Read one
   side at a time, a grid's cells are odd and even numbers, which is no run,
   so a grid never splits.
6. **Nothing is proposed** on a cover, which is a page with a "Name:" line and
   a "School:" line. Covers carry a numbered contents list and numbered rules
   for students. Nothing is proposed either from an answers heading to the end
   of the file: "Answers", "Answer Key", "Mark Scheme", "Solutions", or a
   title ending "(Answers)". Not any line that ends in "answer", because
   "Justify your answer" wraps onto lines of its own.
7. **Box.**
   - **Top:** the label line's top minus 4 pt.
   - **Left:** the label minus 4 pt, or any ink within 30 pt left of it on its
     own line. That ink is a calculator icon, and it is part of the question.
   - **Right:** on a grid, the next cell's label. Otherwise, a label at least
     a quarter of the page to the right, inside this question's span. That is
     a second column, never a list indented inside the question. Otherwise,
     the column's edge.
   - **Bottom:** the last *inked* row above the next label below that starts
     inside the box's width, or above the footer band (the outer 6% of the
     page) or the answers heading. A row is inked if any pixel has R+G+B below
     600. Rows are scanned from the label's column rightwards, because the
     strip left of it holds the next question's icon, which stands taller than
     its line.
   - **Sides:** shrink to the ink, plus 4 pt.
   - Ink, not text, sets the bottom. Diagrams and answer lines stay inside
     the box, and the blank working space a lesson page leaves under an
     example stays out.
8. Sub-parts never split a question: a.–z., a)–h), (a)–(h) and (i)–(viii).
9. **Reading order.** When a page is saved, its crops get `pos` in reading
   order on the displayed page: columns left to right, then top to bottom.
   Displayed coordinates, not PDF ones, so a `/Rotate` page reads the way it
   looks.

**What it got on the sample banks (§9.2.1).** Every one of the 495
questions has a proposal starting at its number. Of the boxes:

- 10 take in a heading or a notes box that sits between two questions, such
  as "AP MCQ" or "Problem Set 3-1 Part 2". The in-charge drags the bottom edge
  up;
- 80 are only part of their question. They miss what is printed once above
  the number, or they stop at a page break. Those questions need more than
  one box (§2.2).

12 proposals are not questions. All 12 are numbered lists in lesson notes,
such as "Integrals are classified as improper for three reasons. 1. … 2. … 3.
…". 507 proposals are made in all.

**Where it is still known to miss.** None of these appeared in the sample
banks:

- labels like "A1", numbers drawn inside circles, or whole questions numbered
  (a), (b) … (§2.2);
- broken fonts that extract a label's digits as garbage. Word's maths font
  extracts as garbage in every sample bank, but never a label;
- a diagram that crosses a gutter;
- content drawn sideways with no `/Rotate`.

Each miss means fewer proposals, or none, and the person draws the rest.

### 5.2 Scanned pages: AI (on request, one page at a time)

**Route:** `app/(app)/courses/[courseId]/questions/[fileId]/suggest/route.ts`,
`POST`, with `export const maxDuration = 60`
(`01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`).

- It sits under `[fileId]/suggest/`, not beside `page.tsx`, because a route
  cannot share a segment with a page (`01-app/01-getting-started/15-route-handlers.md:39`).
- It sits outside `/api`, so the proxy's login redirect still applies.
  `PUBLIC_PATHS` lets every `/api*` path through (`lib/supabase/middleware.ts:4`).
- It is a route rather than a Server Action because Server Actions cap the
  request body at 1 MB by default (`05-config/01-next-config-js/serverActions.md`),
  and a real scan's JPEG can come close to that.

**The browser:**

1. renders the page to the largest size a high-resolution model takes
   without resizing: 2576 px on the long edge and 4784 image tokens, which
   is **1623×2296 for A4** (~196 dpi);
2. encodes it as JPEG (quality 85, about 330 KB in testing);
3. sends the raw bytes as `image/jpeg`, with `?page=&w=&h=`.

**The route, in order:**

1. `supabase.auth.getUser()`. With no user, it returns **401**.
2. `rpc('can_crop_file', { _file_id })`. If that is false, it returns **403**.
   This is the same rule as the insert policy, with no copy in TypeScript.
3. If `aiConfig()` is null, it returns **503** "Suggestions are not set up".
4. If the body is over 3 MB, it returns **413**. Vercel's cap on any function
   body is 4.5 MB.
5. It calls `client.messages.parse()` with:
   - `model` from `ANTHROPIC_MODEL`;
   - `max_tokens` 16000;
   - `output_config: { format: zodOutputFormat(schema) }`, plus `effort` from
     `ANTHROPIC_EFFORT` only when that is set;
   - the image block with `transformations: { oversized_image: "error" }`;
   - no `thinking` setting and no `tool_choice`. On current models, leaving
     `thinking` out means adaptive thinking runs, and on some models it cannot
     be turned off; effort is the control. Thinking is billed as output tokens
     and counts toward `max_tokens`;
   - an SDK `timeout` of 50,000 ms and `maxRetries: 0`. The SDK retries
     timeouts, so wall-clock time can reach timeout × (retries + 1). With no
     retry, the worst case is 50 s plus the session check and the body read,
     which stays under the 60 s `maxDuration`. A retry after a 50 s wait is
     unlikely to be faster; a failed press costs the in-charge one more press.

   This request, in this form (effort only when set, the timeout and retry
   count on the client, `usage.output_tokens` read back), was typechecked
   against `@anthropic-ai/sdk` 0.135.0 and `zod` 4.6.7 but never sent. The
   measurement below is its first real run.

   The schema has one entry per question:
   - `label`, the number as printed;
   - `label_box`, the printed number only, `{x1,y1,x2,y2}`;
   - `box`, the whole question;
   - `continues_from_previous_page`.

   The prompt asks for absolute **pixel** boxes, top to bottom, column by
   column. Anthropic's vision docs say that asking for 0–1000 coordinates
   works poorly.
6. It divides every box by the `w` and `h` it was sent and returns
   `{ questions }` with boxes **normalised to 0–1**.
   - If the model hit `max_tokens`, it returns 200 with `{ questions: [],
     truncated: true }`.
   - If the model refused or the answer failed the schema, it returns **502**.

The screen's words for each answer are in §4.3. Anything that is not a 200
with JSON, including Vercel's own 504, reads "Couldn't get suggestions. Draw
the boxes."

**The browser then lets the pixels set the geometry and uses the model only
to find the numbers:**

- It snaps each `label_box` centre to the nearest ink in that column.
- It builds each box with the same ink rule as §5.1, step 6.
- It uses the model's `box` only for the column's left and right edges, and
  as a check. If the IoU is below 0.5, the suggestion gets "?". Questions
  marked `continues_from_previous_page` also get "?".
- In a simulation with 1% position error, raw model boxes cut off part of 60%
  of questions. Boxes built from snapped labels cut off none (mean IoU 0.90).

**Cost.** List prices as of 2026-10-06, for about 5,300 input and 500–1,500
output tokens per page, **before thinking tokens**:

| Model tier | Per page | 200-page bank |
|---|---|---|
| Opus | $0.03–0.05 | $6–10 |
| Sonnet | $0.016–0.026 | $3–5 |
| Haiku | about $0.001 | about $0.20 |

Thinking tokens are billed as output, so these are floors. The measurement
below records the real output tokens and replaces this table.

A page is paid for **about once**. Its result is kept in the tab (§4.3), so a
second press does not call the API again. A reload, another tab or a second
in-charge opening the same page pays again. Prompt caching does not help,
because every image is different.

**Choosing the model and effort:** about $5 and half a day.

1. Take 20 scanned pages from the real banks and confirm their boxes by hand.
2. Run two model tiers, each at effort `low` and `medium`. A model that
   rejects `effort` (the API returns 400) is run with it unset.
3. Score, for each (model, effort) pair:
   - the share of question numbers found;
   - the share of accepted boxes that needed no edit;
   - the mean IoU;
   - `usage.output_tokens` per page, which includes thinking;
   - the slowest response, which must be well under the 50 s timeout.
4. Pick the cheapest pair that finds at least 98% of numbers. Set
   `ANTHROPIC_MODEL`, and `ANTHROPIC_EFFORT` if the pair has one, so
   production runs exactly what was measured. Restate the cost table from the
   measured tokens.
5. If no pair reaches 98%, ship without AI: leave the variables unset, and
   scanned pages are drawn by hand.

If the chosen model takes only smaller images, the `oversized_image` guard
fails on its first request, so boxes never shift in silence. The render
size then drops to 924×1307 for A4 (1568 px on the long edge, 1568 image
tokens). That size is one constant in `lib/worksheet/propose.ts`.

**Environment.** These are server-only, never `NEXT_PUBLIC_`.

- **`ANTHROPIC_API_KEY`**
- **`ANTHROPIC_MODEL`**: a Claude model id that accepts images, chosen by
  the measurement above. No id is written in code or docs.
- **`ANTHROPIC_EFFORT`** (optional): one of `low`, `medium`, `high`, `xhigh`
  or `max`, chosen by the measurement. Unset means the request sends no
  `effort`. Any other value makes `aiConfig()` return null, so a typo turns AI
  off visibly rather than sending something nobody measured.

Add all three, empty, to `.env.example` and to the `DEPLOYMENT.md` §5 table,
as optional entries.

### 5.3 When AI is not set up

`aiEnabled` is false, so *Suggest boxes* does not render. Scanned pages show
the same line as any page without proposals: "No suggestions on this page.
Drag to draw a box." Cropping never waits on AI.

## 6. Output

### 6.1 The branded A4 page: the template itself

Each worksheet page is the owner's own template page with the crops drawn on
top. Nothing of the template is redrawn.

- **Files:** `public/worksheet/template-lesson.pdf` (25,655 bytes) and
  `template-homework.pdf` (26,961 bytes), the PDFs the Pencil template's
  Lesson and Homework boards were made from. PR 3 commits them.
- **How:** compose embeds the chosen label's template once (`embedPdf`) and
  draws it as each page's background (`drawPage`), then draws the crops on
  top.
- **Page size comes from the template:** 594.96 × 841.92 pt, which is what
  Chrome wrote, not A4's nominal 595.28 × 841.89.
- **Exact by construction.** The frame (inset 10 mm, 0.3 mm `#D9DCE3`, radius
  1.5 mm), the label (9 pt `#B4B8C5`, letter-spacing 0.08 em), the footer
  (mark and wordmark at 45% opacity, 13.5 mm from the bottom) and the
  typeface all come from the template. Its text is Inter Regular, embedded as
  Type 3, which is what Chrome fell back to because Helvetica Neue, Helvetica
  and Arial were missing. Redrawing it in Helvetica would differ in typeface
  and width.
- **Compose draws no text,** so no font is embedded and no typed text can
  reach a page.
- **Tested** with `pdf-lib` 1.17.1: eight pages with the Homework template
  as background and 16 picture crops on top came out 594.96 × 841.92 pt, with
  the template's Inter Type 3 fonts carried through. Those are the
  worksheet's only fonts, and `pdftotext` on it printed only the template's
  words, "HOMEWORK" and "MathVision".

### 6.2 Placing crops

- **Content area:** from 15 mm to 195 mm across, and from 26 mm below the top
  to 24 mm above the bottom, which makes it 247 mm tall. Crops are placed
  top-left.
- **One question:** scale = min(1.25, 180 mm ÷ crop width, 0.55 × 247 mm ÷
  crop height). The rest of the page is blank for working.
- **Two short questions share a page:**
  - a question is *short* if its one-question height is 74 mm or less;
  - two short questions in a row share a page, and the second starts at the
    content area's vertical midpoint;
  - any other question gets a page of its own.
  - Picks keep bank order (§2.2).
- **Rotation.** Crop sizes here are the displayed size, after the source
  page's `/Rotate`. pdf.js renders the page as displayed, so the picture is
  already upright and is drawn with no rotation. Tested on a `/Rotate 90`
  page: the picture came out in the shape the page view shows.

### 6.3 Every crop is a picture of its box

Every crop, from every bank, digital or scanned, is drawn the same way
(§2.1 item 11), once, when the worksheet modal opens (§4.4):

1. **pdf.js renders the box alone,** at 300 dpi of the size it is printed on
   the worksheet: §6.2's scale × 300 ÷ 72. The box's corners come from the
   stored PDF-space box through `convertToViewportPoint`. The viewport's
   `offsetX` and `offsetY` put the box's top-left corner at the canvas
   origin, and the canvas is the box's size at that scale.
2. **The canvas is encoded as JPEG** at quality 0.9 (`canvas.toBlob`). The
   modal holds it, and *Download PDF* embeds it with `embedJpg`, which copies
   the bytes unchanged.
3. **One canvas serves every crop,** and is set to 0 × 0 once the last pick
   is drawn, because Safari is slow to free canvas memory.

What this keeps out, and what it keeps:

- Only the box's pixels reach the worksheet. No text, font, layer or image of
  the source page goes with them, so nothing hidden can be extracted from a
  crop. In testing, `pdftotext` on a worksheet printed only the template's
  words (§6.1).
- pdf.js draws the box as the page view drew it, so the worksheet shows what
  the in-charge cropped and the teacher picked. Every render goes through
  `renderRegion` with the display intent (§4.5), never `intent: "print"`,
  which turns on a layer that a teacher edition hides on screen but prints.
  In testing, a crop from a bank whose Answers layer is off for viewing and
  on for printing came out without the answers with the display intent, and
  with them with `intent: "print"`.

Two choices, measured in Node 22 with pdfjs-dist 6.4.299 on `@napi-rs/canvas`
1.0.11 (Skia, the graphics library Chrome uses), on the test banks that
`docs/worksheets/raster/make-banks.py` writes (four digital pages, and the same
pages as a noisy 200 ppi scan):

- **JPEG for every crop, not PNG.** PNG was a little smaller on clean digital
  crops (80 KB against 95 KB), but 2.4 times bigger on scans (581 KB against
  239 KB), and pdf-lib re-compresses a PNG in JavaScript: 16 crops from the
  digital bank took 4.4 s to compose against 0.6 s. Viewed pixel for pixel,
  the two looked the same on text.
- **Scans at 300 dpi too.** A 200 ppi scan is upsampled, which adds bytes but
  no detail: capped at the scan's own density, its crops were 111 KB against
  239 KB. That cap would have compose measure each scanned page's density.
  One rule for every page is simpler, and worksheets stay far under 25 MB
  (§8.1).

**Memory.** pdf-lib never reads a bank; it loads only the 26 KB template.
Beyond the picked banks, which stay open while the modal is (§4.5), the modal
holds one canvas, the decoded images of the page it is drawing from (released
by `page.cleanup()` after that page's last pick), the held JPEGs (about 4 MB
for 20 picks from a scan), and, on *Download PDF*, the saved file. 20 picks
from 20 pages of a 300 ppi colour scan peaked at about 310 MB in Node with
the cleanup and about 750 MB without it. The largest canvas is the largest
crop the content area allows, 180 × 136 mm at 300 dpi: 2126 × 1605 px, or
13 MB of pixels, about a fifth of the 4096 × 4096 that iOS Safari allows one
canvas.

### 6.4 Where it runs, and why

The PDF is built **in the teacher's browser**.

- **Speed:** 16 questions from a digital bank took 0.6–1.0 s, template and
  save included. From scans, a crop costs about 0.5 s when it is the first
  pick on its page, because pdf.js decodes the whole page image to draw any
  part of it, and about 0.1 s after that. 20 picks from 20 pages of a
  300 ppi colour scan took 9.5–12 s, and 20 from 5 pages took 4–5 s (Node,
  4-core container, §6.3). An iPad is slower, so the modal counts the
  questions as it draws them (§4.4), and §9.2 step 1 times a worksheet on
  one.
- **What a server version would cost:**
  - Vercel caps every function request and response at **4.5 MB**, and 20
    questions from a scan come to about 5 MB (§8.1);
  - getting around that means writing the worksheet to Storage. That needs
    a new storage policy so teachers can write, and it leaves PDF blobs that
    the purge never removes;
  - every crop is rendered, so the function would need a native canvas
    (`@napi-rs/canvas`, as in the measurement) and would download each
    picked bank itself, with 9.5–12 s of rendering for 20 scanned picks
    inside the 60 s `maxDuration`.

**What it costs in the browser, decided:** every bank is downloaded whole,
before its first page shows, both to browse it and to compose from it. pdf.js
is given the bytes (§4.5), and a signed URL changes every time, so the
browser cache never helps. A bank stays open for the tab (§4.5).

- A 54 MB scan takes about 9 s at 50 Mbps and about 45 s on 10 Mbps home
  Wi-Fi, in every tab and for every teacher who opens it.
- **The decision:** accept this for v1, and the size shows while it loads.
  The centre's own banks measured 0.2–2.9 MB, about 2 s at 10 Mbps
  (§9.2.1).
- **The pass bar** (§9.2 step 1): the first page of the largest real scanned
  bank shows in under 10 s on an iPad on home Wi-Fi. At 10 Mbps a bank over
  about 12 MB cannot meet it, so the sample banks' sizes already predict the
  answer. The textbook banks in the centre's Drive are 15–82 MB, so they
  fail on download time alone if they are cropped as they are (§9.2.1).
- **If it fails, the fallback** stores each crop's own picture: the 300 dpi
  JPEG of §6.3, which depends only on the crop's box (§6.2). The in-charge's
  machine renders it once when the page is saved, and stores it at
  `courses/{course}/{file}/{question}.jpg`. Teachers then pick from these
  pictures and compose from them, and never download a bank. It needs:
  - `image/jpeg` added to the bucket's allowed types, which today are
    `application/pdf` only (`20260611000005_storage.sql`);
  - a signing action that selects the `questions` rows under RLS (the
    `getViewUrl` pattern);
  - deleting a crop's picture with the crop and with the purge. Clients
    have no delete policy on this bucket, so that is a new policy or a
    service-role step;
  - Storage for every crop: at 95–239 KB each, a level's 25,200 crops
    (§8.1) are about 2.4–6 GB.

  The in-charge's write is already allowed by `course_materials_insert`.
- **Worth trying before that fallback:** pdf.js can read only the byte ranges
  a page needs when it is given the URL instead of the bytes (with
  `disableAutoFetch` and `disableStream`). Whether Supabase's signed URLs
  answer range requests from the app's origin, and how that fits a URL that
  expires after 60 seconds, has not been tried. pdf.js is the only reader of
  a bank (§6.3), so this would serve the modal as well as the page view.

Big banks and weak connections are what the fallback above is for: it takes
the bank download out of the teacher's browser for picking as well as for
composing, where a server compose would take it out of composing only. So
this plan builds no server compose (§9.3).

**Library:** `pdf-lib` 1.17.1 (MIT). It only embeds the template and the
JPEGs the modal made, never a bank, so its lack of releases since 2021 costs
nothing here. The maintained fork `@cantoo/pdf-lib` adds SVG and HTML parsers
this plan does not use. Tested: the same worksheet as the fork, 1,547 KB
against 1,548 KB. pdf.js is the only thing that opens a bank, and it opens
one locked by its publisher (§2.1 item 14), so neither the page view nor
compose has a special case for locked banks.

### 6.5 File name

The pattern is `MathVision {Label} {course code, else course name}
{YYYY-MM-DD HHmm}.pdf`, using the teacher's local date and time. For example:
"MathVision Homework IM2T 2026-10-17 1430.pdf".

- The time keeps two worksheets made the same day, for different children,
  from getting the same name, which is how a worksheet reaches the wrong
  child. No child's name goes in it.
- Worksheets are made in a level's bank-holding course (§2.1 item 10), so
  the code is that course's.
- Characters other than letters, digits, spaces, hyphens and brackets are
  dropped.
- The PDF's Title is the same name, without `.pdf`.

## 7. Getting it into Pencil

Pencil has no boards API or files API, so the portal pushes nothing. The
teacher:

1. downloads the worksheet (§4.4);
2. opens the child's Space for the class the worksheet is for, not the
   bank-holding course it was made in, which has no students (§2.1 item 10);
3. drags the PDF onto the canvas, or uses Upload → PDF;
4. chooses **one page per board**.

Each page becomes its own board, and each page is the template's own page
with the crop on top, so the new boards match the template's boards. Pencil's
PDF import takes up to 1,000 pages. Pencil's own size limit for a drag-in,
how it names the boards, and whether a Space has a board limit are checked in
§9.2 step 1.

## 8. Volume, limits, security, failure modes

### 8.1 Volume

The owner has not given volumes. The design handles the following:

- **Banks:**
  - the centre's own banks are 0.2–2.9 MB, 7–25 pages each, with 11–84
    questions (§9.2.1). Its textbook banks are 15–82 MB;
  - the largest scanned bank tried (for download time, §6.4) was 200 pages
    and 54 MB. A 300 ppi colour scan measured 0.87 MB a page, so a 200-page
    bank is about 170 MB;
  - on the Supabase Free plan no upload can exceed 50 MB, and on Pro the
    global limit can be raised to 500 GB. The bucket sets no limit of its own
    (`file_size_limit` is null in `20260611000005_storage.sql`), so the
    project's global limit applies. §9.2 step 1 checks the plan. On Free, an
    in-charge splits a bigger scan before uploading it, by chapter or
    section, and each part is its own bank.
- **Crops:** many per page, about 4 to 12. A 300-page bank holds about 1,200
  to 3,600 questions. A level's bank-holding course keeps every bank of the
  level for good (§2.1 item 10), so it holds tens of thousands: 12 banks of
  300 pages at 7 a page is 25,200. The reads measured in §3.5 take 34–60 ms
  for the Questions page at that size, and 4–8 ms for each 1,000-row range of
  one bank's crops; a 2,100-crop bank takes 3 ranges. Those are floors,
  repeated on Supabase before anyone relies on them.
- **Storage egress.** Every bank opened downloads the whole bank, in every
  tab. Egress per month is roughly bank opens × average bank size. For
  example, 10 teachers each opening 3 banks a working day, 22 days a month:
  about 6.6 GB at 10 MB a bank, and about 33 GB at 50 MB. Compare that with
  the plan's included egress (Supabase dashboard → Usage) once step 1 knows the
  real sizes.
- **Worksheet:** usually 5 to 20 questions from 1 to 4 banks. Every question
  is a picture (§6.3): about 95 KB from a digital page and 239 KB from the
  4-page, 200 ppi test scan of §6.3, so 20 questions are about 2 MB, or 5 MB
  from scans. A 300 ppi colour scan's crops averaged 198 KB, and its largest
  510 KB. The largest crop the page allows was 219 KB from a digital page and
  586 KB from the grey scan, so even 40 of those stay under 25 MB.
- **The tab, while the modal is open,** holds every picked bank (§4.5): with
  1 to 4 banks, up to 4 × the largest bank.
- **Rendering a page** for the page view at 2048 px wide took 20–86 ms from a
  digital page and about 0.5 s (up to 1.4 s) from a 300 ppi colour scan, most
  of it spent decoding the scan.

### 8.2 Security

- **Bank bytes:**
  - They reach the browser only through `getViewUrl` and `preparePicks`,
    which select the `files` rows under RLS and sign 60-second URLs. The
    browser fetches each file immediately; the URL's token is checked when the
    transfer starts.
  - There is no new bucket, no new storage policy and no write to Storage.
- **Rows:** RLS and column grants (§3). Every write goes through
  `save_page_crops`, which runs as the caller. No new role check is written in
  TypeScript; there are three already. The capability flags only hide links.
- **AI route:**
  - It is behind the login redirect and checks the session and
    `can_crop_file` itself.
  - The key is server-only. The body is capped. Nothing is stored.
  - The page image goes to Anthropic (§2.1 item 9).
- **Worksheet:** it is built in the teacher's browser and never uploaded.
  Every crop is a picture of its box alone (§6.3), so the file carries
  nothing of a bank beyond the questions picked, wherever it is sent. It is
  never locked, whatever lock the bank had (§2.1 item 14).

### 8.3 Failure modes

| What happens | Result |
|---|---|
| Big scanned bank | Slow first open. The size is shown, and the bank stays open for the tab. §6.4 sets the pass bar and the fallback. |
| A scan stored as JBIG2, JPEG 2000 or CCITT (common from office scanners) | Without `wasmUrl` it renders **blank**, with only a console warning. The `postinstall` copy prevents this, and §9.2 checks it on a real scan. |
| CMYK images in a print-ready bank | Without `iccUrl`, pdf.js warns and shows them off-colour. The `postinstall` copies `iccs/` and §4.5 sets `iccUrl`. |
| An iPad or school Chromebook running an older browser | The modern pdf.js build crashes (`getOrInsertComputed`). Use the legacy build. |
| A PDF that needs a password to open | Refused, with a message. |
| A file that is not a readable PDF | "This file isn't a readable PDF." |
| A bank locked by its publisher against printing or copying | Opened and cropped like any other. Its worksheet is not locked (§2.1 item 14). |
| A question split across columns or pages, or sharing a figure | Up to four boxes per question, measured on the sample banks (§2.2, §9.2.1). |
| A sideways page with no `/Rotate` | Shown sideways. Fix the PDF before cropping. A re-upload is a new file, so crops do not carry over. |
| Two in-charges crop the same page at once | Duplicates are possible; delete one (§2.2). If one changes or removes a crop the other just removed, that save is refused whole, and *Reload page* shows what is saved (§4.3). |
| A page save fails | Nothing is written. The drafts stay on screen with *Try again*. |
| The tab crashes or is evicted | Only the page in hand is lost; every page left behind was saved. |
| A bank students can see | It cannot be cropped. Once cropped, its crops are locked until it is teacher-only again, and the Questions page marks it. |
| A worksheet over 25 MB | It downloads, with a warning (§4.4). |
| A bank is purged | Its crops go with it, and the purge is unaffected (§3.3). |
| A picked question's bank went to Trash, or the crop was deleted | The modal drops it from the picks and says how many were removed. |
| A bank's bytes are replaced in Storage under the same name | Every crop points at different content. §9.4 item 4. |

## 9. Tests, rollout, out of scope

### 9.1 Checks this repo can run

There is no CI and no JS test runner. Each PR pastes the output of these
commands.

**Static checks:**

- `npm run lint`;
- `npx tsc --noEmit`;
- `npm run build`, with dummy `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

**SQL tests (new): `bash supabase/tests/run.sh`.** It needs `psql` and a
local Postgres 16. It:

1. creates a scratch database;
2. applies `supabase/tests/shim.sql` (§3.6);
3. applies every migration in order, and the new one a second time;
4. runs `supabase/tests/questions.sql`, which fails on the first broken
   `assert`;
5. drops the database.

**What it asserts:**

- **Can read questions:** an admin, and a teacher or in-charge of the
  file's course.
- **Sees 0:** a student, an in-charge of another course, a teacher of
  another course, and anon (permission denied). The same for topics.
- **Refused inserts:**
  - a teacher or a student, directly and through `save_page_crops`;
  - another course's in-charge;
  - a file students can see;
  - a topic from another course;
  - a forged `created_by`;
  - a NaN, inverted or page-0 box.
- **Refused updates:** to `file_id` or `page`, and to another course's topic.
- **0 rows:** updates and deletes by a teacher, or by another course's
  in-charge.
- **All or nothing:** a `save_page_crops` call with one bad edit, removal or
  box writes nothing.
- **Allowed:** an in-charge's `save_page_crops` that edits one crop and
  removes another writes both, and the removed row is gone, with no Trash
  (§2.1 item 13).
- **Trash:** questions are hidden from everyone, crops are refused, and
  `can_crop_file` is false. After restore, everything is back.
- **Student-visible bank:** teachers still read its crops,
  `question_sources` says so, and nobody can change them.
- **Purge:** a hard delete of a file, or of a folder, cascades to its
  questions.
- **View:** `question_sources` agrees with `questions` for every role.

**Manual checks:**

- the §5.1 rules on the test banks and on 20 real pages;
- `pdftotext`, `pdffonts` and `pdfimages -list` on a worksheet: the only
  text and fonts are the template's, and each crop is one JPEG at 300 dpi of
  its printed size;
- a crop from a test bank whose Answers layer is off for viewing and on for
  printing (`layered.pdf` from `docs/worksheets/raster/make-banks.py`) comes
  out without the answers;
- a worksheet page overlaid on the template PDF: identical by construction,
  so this checks only where the crops sit.

### 9.2 Rollout

0. **The owner**, who answered the plan's questions on 2026-10-17 (§2.1,
   items 10–14):
   - sends sample banks. **Done 2026-10-17:** the centre's Drive folder of
     course material;
   - says whether the textbook banks are scans (§9.2.1);
   - sends the topic list for each level (§2.1 item 12).
1. **Checks before any code (about a day).** Each check names what its
   answer changes.
   - **The sample banks.** All done 2026-10-17 except the last item; the
     results are in §9.2.1:
     - size per file, which predicts the §6.4 pass bar;
     - image codecs (`pdfimages -list`);
     - label styles, sections that restart numbering, and column layouts,
       for §5.1;
     - the share of questions that span a page or column break, or depend on
       a shared figure or table. This decided before PR 1 between one box
       and several (§2.2): several;
     - how often two in-charges would crop one bank at once, which decides
       whether "crop once" needs a trigger (§2.2). Not measurable from files;
       the owner knows.
   - **Supabase:** the plan, and the project's global file-size limit. On
     Free, scans over 50 MB are split before upload (§8.1). Then apply the
     migration to a Supabase project with a seeded course of 25,000 crops
     and time §3.5's reads as a teacher.
   - **Pencil**, importing a sample worksheet with one page per board:
     1. *Does the drag-in have a size limit of its own?* Lower than 25 MB:
        the modal warns at that size. Otherwise the warning stays at Pencil
        Files' 25 MB.
     2. *How are the imported boards named:* by file name, by the PDF's
        Title, or by number? By name or Title: §6.5's name is what teachers
        see on the boards, so it stays as it is. By number: nothing to do.
     3. *Does a Space have a board limit?* At 10–20 boards a week, a year in
        one persistent Space is hundreds of boards. If there is a limit,
        teachers remove old worksheet boards, and how often becomes a question
        for the owner.
   - **Browser:**
     - `fetch()` a `getViewUrl` URL from the app's origin (CORS has not been
       tried in this codebase);
     - the legacy pdf.js build and `pdf-lib` in a Next 16.2.9 Turbopack
       production build;
     - on a real iPad on home Wi-Fi: the first page of the largest real
       scanned bank in under 10 s (§6.4, with the fallback if it fails), then
       a worksheet of 20 picks on 20 different pages of it, timed, which
       replaces §6.4's Node figures. Over 60 s: take §6.4's fallback, which
       takes rendering out of the teacher's browser;
     - on the iPad, flip through 40 pages of the largest real scan with
       Safari's Web Inspector open: memory stays flat (§4.5,
       `page.cleanup()`).
2. **PR 1, database:**
   - the migration, in the multi-box shape step 1 chose (§2.2): §3.4's
     tested draft is one box, and is redrawn with `question_boxes` first;
   - `supabase/tests/{shim.sql,questions.sql,run.sh}`, `schema.sql`, the
     types and the docs;
   - **apply it to Supabase** with the SQL editor (paste the file) or
     `supabase db push`, *before* anything that reads it merges. Vercel
     deploys the app only, never the database.
3. **PR 2, the page view:** cropping by hand, text-layer suggestions,
   saving per page and picking, plus the `proxy.ts` matcher and the pdf.js
   assets.
   - The unmerged branch `claude/awesome-bell-udvk0q` also edits `proxy.ts`.
     Whichever lands second merges the other first.
4. **PR 3, the Questions page and the worksheet:** the picks, the modal,
   compose and the two template PDFs.
5. **AI**, only if a scanned bank is going to be cropped. None of the
   centre's own banks has a scanned question page (§9.2.1). If the textbook
   banks are not scans either, this step and PR 4 are not needed:
   - run the measurement in §5.2;
   - if a pair reached 98%, set `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and,
     if measured, `ANTHROPIC_EFFORT` in Vercel, for Production and Preview,
     then redeploy;
   - PR 4 adds the route and the button. If no pair reached 98%, there is no
     PR 4.
6. **An admin** creates one bank-holding course per level (§2.1 item 10):
   - adds that year's teachers of the level as teacher, and the people who
     crop as in_charge;
   - runs the topic snippet (§3.4) for it with the owner's list;
   - uploads the banks into teacher-only folders there (the crop screen
     refuses any other). A bank already in a class's course is uploaded again,
     because a file cannot move between courses.

   In-charges start cropping. Each new year, each bank-holding course's
   in_charge updates its teachers, and nothing else (§2.1 item 10).

### 9.2.1 What the sample banks showed (2026-10-17)

The owner shared the centre's Drive folder of course material. Ten banks
from it were measured with `docs/worksheets/textlayer/propose.mjs`. The first
five tuned §5.1's rules. The second five were held out, run once untouched,
and then fixed where they failed. The banks themselves are not in the
repository.

| Bank | MB | Pages | Questions | Need an extra box: printed above / over a page |
|---|---|---|---|---|
| AP CAL Unit 10 Question Bank Section 1 | 0.18 | 7 | 32 | 22 / 2 |
| AP CAL Unit 3 Question Bank Section 1 | 0.22 | 8 | 42 | 8 / 0 |
| AP CAL Unit 2 Question Bank Section 3 | 0.79 | 14 | 82 | 34 / 0 |
| PCS Exponential and Logarithm Function Question Bank | 0.73 | 15 | 76 | 0 / 2 |
| Question Bank - Unit 7 (Past Year Paper only) | 0.39 | 22 | 17 | 0 / 4 |
| *held out:* AP CAL Unit 6 Question Bank Section 1 | 0.90 | 25 | 65 | 0 / 1 |
| AP CAL Unit 8 Question Bank Section 1 | 0.50 | 12 | 43 | 1 / 0 |
| AP CAL Unit 4 Question Bank Section 2 | 0.63 | 13 | 43 | 0 / 0 |
| PCS Polynomial Function Question Bank | 1.91 | 18 | 84 | 0 / 1 |
| Question Bank - Unit 8 and 9 (PYP only) | 0.82 | 21 | 11 | 0 / 5 |
| **Total** | | **155** | **495** | **65 / 15** |

About 110 of the 155 pages were checked by eye, with the proposals drawn on
them. On the rest, every number of each run is present exactly once.

- **Kind of page.** Every question page in all ten is digital. The banks are
  made in Word and exported on a Mac, or are past papers assembled in
  Acrobat. The only pages that are pictures are in the mark schemes (the "MS"
  files, 3.6–18 MB), whose worked solutions are handwritten on an iPad.
  Those are answers and are never cropped. Images are Flate or JPEG, with no
  JBIG2, JPEG 2000 or CCITT.
- **Answers.** The owner said answers mostly come separately. They do: in the
  MS file, as worked solutions. Every centre bank also ends with a short
  answer list under "Answers", where the suggestions stop (§5.1 rule 6). The
  in-charge crops from the bank, not from its MS.
- **Layouts the made-up pages did not have.** Each is now a rule in §5.1:
  - one page mixes lesson notes, worked examples ("EX 1:"), AP MCQ, AP FRQ
    and problem sets, and restarts the numbering for each, up to four times
    on a page;
  - a problem set is often a table, with two or three numbered cells to a
    row;
  - one-line questions follow each other with no gap between them;
  - Word's maths sets every fraction as separate small text items, and its
    font extracts as garbage. Labels are never affected;
  - a calculator icon is printed left of the number;
  - a cover carries a numbered contents list and numbered rules for
    students;
  - a past paper's pages are offset by 50 pt.
- **How well the rules did.** Held out, the rules as tuned on the first five
  banks were right for 244 of 246 questions. They missed a page that is all
  graphs (the 100-character bar), and one box was cut short by an indented
  list. They also proposed one answer section as questions, because its
  heading was a title ending "(Answers)", and they cut the calculator icon off
  about 20 boxes. Four general fixes took them to all 246, and changed
  nothing on the first five. Final figures on all ten are in §5.1: 495 of
  495, 10 boxes to trim, and 12 false proposals.
- **Questions needing more than one box: 80 of 495 (16%).** This decides
  §2.2 for several boxes.
  - Printed above, 65: 60 are a problem set's instruction, printed once
    over a table of bare expressions. It always sits directly under the
    problem set's heading and above its first number, so PR 2 can propose it
    as the first box of every question in that run. The other 5 sit under a
    figure or table "above".
  - Over a page, 15: 9 of the past papers' 28 free-response questions, which
    run over as many as four pages, and 6 long examples or pages of graphs
    that run onto the next page.
- **Compose** (§6.4), in Node at 300 dpi from these banks, with the proposed
  boxes: 20 picks took 1.4 s (1.2 MB) from AP CAL Unit 2 and 2.2 s (2.8 MB)
  from PCS Exponential. 16 past-paper picks took 1.7 s (5.6 MB).
- **Not measured:**
  - **the textbook banks**, such as "Question Bank - Unit 5 and 6 (Textbook
    only)" and "Question Bank - Unit 1_Textbook". They are 15–82 MB, over the
    Drive connector's 10 MB download limit, so none was opened. Drive's own
    text of one reads like a text layer (two-column exercises, "1. Voters.
    …"), but Drive also reads scans, so whether they are scans is unknown.
    The answer decides three things:
    - whether the AI is needed at all (§9.2 step 5);
    - the §6.4 pass bar, which any bank over about 12 MB fails on download
      alone at 10 Mbps (82 MB is 66 s);
    - on Supabase Free, whether the 53–82 MB ones must be split, since they
      are over the 50 MB upload limit (§8.1).
  - how often two in-charges crop one bank at once;
  - the Supabase, Pencil and iPad checks of step 1, which need the owner's
    project, accounts and devices.

### 9.3 Out of scope

- pushing anything into Pencil, or putting worksheets in Pencil Files;
- automatic marking;
- answer keys and worked solutions, unless the owner asks;
- saved worksheets, history, or a record of which child got what. Under
  current RLS a teacher cannot even read the course's student list.
- questions of more than four boxes (§2.2);
- worksheet numbering, a layout control and reordering picks;
- a page-rotation override;
- OCR without AI (`tesseract.js` stays in reserve);
- AI on digital pages, suggesting a whole bank in one run, or batch pricing;
- a rail of page thumbnails;
- a page cache, or building worksheets on the server;
- editing topics in the app;
- **a list of every crop across banks** (file as an issue). When it is built:
  render crops only once the list is narrowed to one bank, or on demand per
  row, and show the meta line otherwise; keep one `PDFDocumentProxy` per
  bank, closed when evicted; sign every bank a list page needs in one call;
  re-run the exact count only when a filter changes; and test a topic filter
  spanning 10 or more banks on an iPad;
- any student access.

### 9.4 Noticed, not part of this work (file as issues)

1. **A file can sit in another course's folder.** `files_insert` and
   `files_update` check only `files.course_id`
   (`20260611000004_rls.sql:85-92`), and `moveFile` does not check the
   folder's course (`app/actions/files.ts:113-126`). Such a file takes the
   other course's teacher-only setting.
2. **`/api/cron/purge` is open to anyone when `CRON_SECRET` is unset.** It
   checks `if (secret && …)`.
3. **One bad row stops the purge.** It stops at the first file it cannot
   delete, so that file blocks every later purge.
4. **A stored PDF can be replaced in place.** The storage policy
   `course_materials_update` (`20260611000005_storage.sql`) and the TUS
   upload's `x-upsert: true` (`lib/upload/resumable.ts:75`) let an in_charge
   or admin overwrite an existing object. Object names are always fresh UUIDs
   (`hooks/useUploader.ts:139-140`), so dropping the UPDATE policy and sending
   `x-upsert: false` loses nothing, and makes a file's bytes as immutable as
   its crops assume (§3.3).

---

*Evidence.* The research, the RLS probe and the compose tests ran on
2026-10-17. What they ran on is kept in `docs/worksheets/`, as drafts that
nothing applies or serves:

- `questions.migration.sql`: the migration as tested;
- `shim.sql`: the shim, printed in full in §3.6;
- `questions.test.sql`: the probe, whose assertions are §9.1;
- `run.sh`: applies every migration plus the draft twice, then runs the probe
  (`PGPASSWORD=postgres PGHOST=localhost PGUSER=postgres bash docs/worksheets/run.sh`);
- `template-{lesson,homework}.pdf`, with the HTML each was printed from;
- `textlayer/propose.mjs`: §5.1's suggestions as measured on the sample
  banks (§9.2.1). It draws each page's proposals onto a PNG and prints them as
  JSON, with each box also in PDF space, as `compose.mjs` takes it;
- `raster/`: `make-banks.py`, which writes the test banks (digital, the 4-page
  200 ppi grey scan, rotated, locked, the layered bank of §6.3, and a 40-page
  300 ppi colour scan); `compose.mjs`, the all-raster compose measured in
  §6.3, §6.4 and §8.1, which renders through one `renderRegion`, takes a
  `--spread` pick mode (one pick per page) and calls `page.cleanup()` after
  each page's last pick; and `flip.mjs`, the page view's flip through a bank,
  with and without `page.cleanup()` (§4.5, §8.1). Each file's header says how
  to run it.

PR 1 moves the migration into `supabase/migrations/` under a fresh version,
and the shim, probe and runner to `supabase/tests/{shim.sql,questions.sql,run.sh}`.
PR 3 moves `template-{lesson,homework}.pdf` to `public/worksheet/` (§6.1, §9.2
step 4). `raster/` and `textlayer/` are evidence only and move nowhere; PR 2
writes §5.1 for the browser.

## Review notes

The review's findings were applied, with these exceptions and choices.

1. **Committing the shim, probe and template PDFs at their repo paths now**
   (the "ephemeral artefacts" finding) was not done: they are kept as drafts
   in `docs/worksheets/`, which nothing applies or serves. The shim is
   printed in §3.6, the repo paths are named, and the Evidence note says
   where the files are until PR 1 and PR 3 move them.
2. **"Plus a Worksheet variant" of the template** (the template finding) is
   not needed: the label is now Lesson or Homework only, matching the
   template's two boards.
3. **Condition (b) on vector crops.** One finding restated it as "the original
   PDF bytes never reach a student's browser"; another said to decide on
   answers alone. The owner's answer settled it on answers (§2.1 item 11):
   some banks print them on question pages, so there are no vector crops.
   That retired the Pencil checks about vector content (does the import keep
   vector, do the PDF's bytes reach a student, can students see it in Pencil
   Files), and the raster fallback for hidden layers and annotations, which
   existed only for vector crops. What remains is that every render uses the
   display intent (§6.3).
4. **The visible-text test.** The finding suggested that "ink inside a text
   item's box" also rejects OCR layers. It does not on its own: OCR text sits
   on top of the scan's inked glyphs. So image coverage is checked first
   (§5.1), and the ink test handles invisible text on pages without a big
   image.
5. **The question number.** One finding asked to show it, clamp it and make it
   editable; another to drop it. It is dropped (§2.2), which makes the first
   moot. Order on a page comes from `pos`, the reading order computed on the
   displayed page when it is saved, rather than from a column number plus
   `y1`, so a `/Rotate` page reads the way it looks.
6. **The cross-bank Questions list.** The smaller alternative a finding
   offered, picking on the page view, was taken, and the list is deferred
   (§4.2, §9.3). So the list-only fixes (on-demand thumbnails, a topic filter
   over 10+ banks on an iPad, signing a list page's banks in one call, and
   counting only when a filter changes) are recorded in the deferred list's
   §9.3 entry instead of being specified now. The page view and the modal
   each make one read call (§4.3, §4.4).
7. **Browser memory.** Instead of counting two copies of each bank, the tab
   keeps one, which pdf.js holds (§4.5). With every crop a picture, compose
   no longer needs the bytes back. Decoded pages are released with
   `page.cleanup()` (§4.5).
8. **Timeout.** Of the two suggested settings, 50 s with no retry was chosen
   (§5.2).
9. **Reordering picks.** Of "add Move to top, or drop reordering", dropping it
   was chosen (§2.2).
10. **Two findings about who may crop a student-visible bank** asked either to
    ask the owner or to decide with a recommendation. It is decided as a §2.2
    default with its costs, which the owner can overrule. The owner's "let us
    crop any banks" (§2.1 item 14) answered the question about publisher
    locks, and leaves this rule as it is.
11. **The topic list** is per course, as the owner decided (§2.1 item 12),
    so the migration keeps `question_topics.course_id` and `topic_fits`.
12. **Local timings.** After the restructure, the reads the screens make
    measured 5–11 ms at 5,000 crops in a course, and 34–60 ms for the
    Questions page at 25,200, rather than the review's ~350 ms per list page,
    which timed the earlier cross-bank list. They are still floors until
    measured on Supabase (§3.5).
13. **"Paid each time Suggest boxes is pressed."** One finding asked for that
    wording; another asked to keep a page's suggestions in the tab so a second
    press does not call again. With the second applied, the first is no longer
    true, so §5.2 says "about once" and names what does pay again: a reload,
    another tab, or a second in-charge.
14. **Overlapping findings in the second review.** Two on §7 step 2, and two
    on the bank budget in §4.5, were merged. Of the two seed sizes offered for
    the Supabase check, 20,000 and 25,000 crops, 25,000 was taken, because it
    is the size measured (§3.5).
15. **Hidden layers.** One finding asked to drop "a layer hidden by default
    still hidden" as untested; another to make it a rule about the render
    intent. Both are taken: the claim is now that every render uses the
    display intent (§4.5, §6.3), `make-banks.py` writes a bank whose Answers
    layer is off for viewing and on for printing, and §9.1 checks it.
16. **CropThumb.** One finding asked that it share compose's box render;
    another removed it, so that the modal shows the 300 dpi JPEG it will
    print (§4.4). The second was taken, which makes the first moot.
17. **Re-measured.** The figures the second review brought were re-run with
    the committed scripts and held, except two: a later pick on a scan page
    already decoded costs about 0.1 s, not 0.15–0.2 s, and 20 picks from 20
    pages took 9.5–12 s rather than 10–12 s (§6.4).
18. **The stored-picture fallback** (§6.4) also needs a delete path, because
    clients have no delete policy on the bucket, and Storage for every crop,
    about 2.4–6 GB for a level. The finding listed neither.
