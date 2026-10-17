# Worksheet maker

Plan, 2026-10-17, revised the same day after review. Nothing is built yet.
The owner has approved the goal, and this plan is for review before any code
is written. The review's findings, and the few this plan does not take, are
listed at the end.

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
   Short questions go two to a page. Where the source is vector, the crop
   stays vector-sharp.
4. **Into Pencil.** The teacher drags the PDF into the child's Space and
   chooses "one page per board".

Roles, per course:

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
   page, or two per page for short ones. Vector stays vector.
6. Delivery is by hand. Pencil has no boards API, so the teacher drags the PDF
   in with "one page per board".
7. Plan first. Nothing is built yet.
8. **Teachers download worksheets.** Goal (3) has the teacher get the PDF.
   What follows from it:
   - Today teachers can view banks but not download them (commit a76d16e,
     `app/actions/files.ts:158-160`). Worksheets relax that for crops.
   - A vector crop carries its whole source page, hidden but extractable
     (§6.3). A teacher who picks one question from each page of a bank
     therefore exports every page of it. For banks, a76d16e's restriction no
     longer protects anything. That matters only if the hidden content
     includes answers, which is §2.3 question 2.
   - Scanned crops carry only their own box (§6.3), so they export nothing
     else.
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
- **One box per question, until the sample banks say otherwise.** Two layouts
  break it: a question that runs over a page or column break, and a shared
  stimulus ("Use the table below for questions 5–7", or a figure printed above
  the number). §9.2 step 1 measures how often these happen. This is decided
  before PR 1, because it changes the schema:
  - if it is more than a few percent of questions, a question holds up to
    three boxes (a `question_boxes` child table), and compose stacks them in
    order. A shared stimulus then becomes the first box of each question that
    uses it;
  - otherwise one box stays, the measured rate is written here, and such a
    question is cropped as two questions or left out.
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

1. **Is any bank used by more than one course, or kept for next year?**
   Decide this before PR 1. Crops belong to one file, a file belongs to one
   course, and the portal cannot share or copy a file across courses. So
   without an answer, the same bank is uploaded and cropped again for each
   sibling class at one level, and again for next year's course once this one
   is archived (`courses.archived_at`).
   *Recommendation, if yes: keep each level's banks in one bank-holding course*
   (for example "Gr 5 question banks"), enrol the teachers of the sibling
   courses there as teachers, and the people who crop as in_charge. That needs
   no schema change. Worksheets are then
   made from that course, and the file name carries that course's code
   (§6.5). A re-upload is still a new file whose crops start again (§8.3).
2. **Do any banks print answers on question pages?** A vector crop hides the
   rest of its source page but does not remove it. In testing, `pdftotext`
   printed every question on the source page. Hidden questions are harmless.
   Hidden answers are not. This is decided on the sample banks (§9.2 step 1):
   - **No sample prints answers on question pages:** crops stay vector, as
     decided.
   - **Any sample does:** crops become pictures rendered at 300 dpi, for every
     bank. *Recommendation: every bank*, because a decision made on three or
     four samples would otherwise have to hold for every future bank. The
     owner may prefer to rasterise only the banks that print answers.

   Either way, rollout step 6 tells in-charges that a bank with answers on its
   pages goes in as a separate, answers-free file. That instruction is a habit
   nothing enforces, which is why raster crops stay the rule once the samples
   show the risk is real. Rasterising is one switch in
   compose, using the raster path that already exists (§6.3). Whatever Pencil
   does with an imported PDF (§9.2 step 1), the downloaded file is still the
   teacher's, and it can be emailed or sent on WhatsApp to a parent. So
   Pencil's behaviour cannot settle this question.
3. **The topic list.**
   *Recommendation: one list per course*, in your order, because students run
   from K1 to Uni (`lib/options.ts` `GRADES`) and one centre-wide list is
   either too coarse or shows a Gr 2 picker A-level topics. With bank-holding
   courses (question 1) that is one list per level. Send the lists before the
   build. They go in with a one-off snippet in `DEPLOYMENT.md` (§3.4), never
   with the migration, so re-running the migration cannot bring a deleted
   topic back. Until someone asks for a screen, changes are made in the SQL
   editor. Until a course has topics, its topic pickers stay hidden.
4. **Deleting a crop.**
   *Recommendation: in-charges and admins delete crops outright, with no
   Trash.* A crop is only a box on a page:
   - the PDF itself is untouched;
   - redrawing a box takes seconds;
   - nothing else points at a crop, because worksheets are not saved.

   The rule "nobody hard-deletes" still holds for files and folders.
5. **Banks locked by a publisher.** Some PDFs open without a password but are
   locked against printing or copying. That lock usually states a publisher's
   terms. Compose opens such files (pdf.js always does, and so does the pdf-lib
   fork this plan uses, §6.4) and writes their crops out unlocked. Tested on a
   bank locked against printing, copying
   and changes (AES-256): the worksheet came out unencrypted, with its text
   intact. Whether the centre may do that is a licensing question, not a
   technical one.
   *Recommendation: crop only banks the centre owns or is licensed to adapt.*
   If the answer is no, a locked bank is refused at the crop screen and at
   compose with "bank.pdf is locked by its publisher against copying or
   printing. It can't be used for worksheets." pdf.js reports the lock
   (`getPermissions()` returns the allowed set, and the test bank's was
   empty). A PDF that needs a password just to open is refused either way.

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
-- Topics: one list per course, in the owner's order. Rows are added in the SQL
-- editor (DEPLOYMENT.md), never by this migration, so re-running it never
-- touches them.
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
  -- offset included: what pdf.js convertToPdfPoint returns, what pdf-lib
  -- embedPages takes. y grows upwards.
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
  - add the topic snippet, run once per course from the owner's list:

    ```sql
    insert into public.question_topics (course_id, name, position) values
      ('<course id>', '<topic>', 1), ('<course id>', '<topic>', 2);
    ```
- `README.md`:
  - add two rows to the permission matrix: *Crop questions*
    (in_charge, admin) and *Pick questions, download a worksheet* (teacher,
    in_charge, admin);
  - change "Nobody can hard-delete" to say that it covers files and folders.

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

- **Empty, managers:** "Nothing cropped yet. Open a bank PDF and choose *Crop
  questions* from its menu. Crops of a bank in Trash come back when it is
  restored."
- **Empty, teachers:** "Nothing cropped yet. Ask your course in-charge to crop
  a bank."

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
  - "This file isn't a readable PDF." (pdf.js `InvalidPDFException`);
  - if the owner says no to locked banks (§2.3 question 5): "bank.pdf is
    locked by its publisher against copying or printing. It can't be used for
    worksheets."
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

**Opening the modal** calls `preparePicks(courseId, ids)` once. In one action
it:

- reads the picked rows by id, under RLS, with their file names and folders;
- signs every bank those rows need with one `createSignedUrls(paths, 60)`
  call, after selecting the `files` rows under the caller's session, the same
  rule as `getViewUrl`;
- returns the rows, the URLs, and the ids it could not find.

The browser starts every bank's download as soon as the URLs arrive, skipping
banks already open in the tab. Picks that no longer exist (a deleted crop, or
a bank in Trash) are dropped from the picks with the line "2 picked questions
are no longer available and were removed."

**`components/questions/WorksheetModal.tsx`** is a `Modal` 560 px wide. It
contains:

- the picks in bank order (bank by folder path and name, then page, then
  position), each with a small crop, its meta line ("Fractions.pdf · p. 4 ·
  Fractions") and remove ×;
- **Label:** *Lesson* | *Homework*, default Homework;
- *Download PDF* (primary).

**While composing**, the button shows a spinner and progress text such as
"Fetching bank.pdf (2 of 3)…" and then "Building 12 pages…".

**When it is done:**

- the browser downloads the file (§6.5);
- a toast says "Downloaded … · 2.1 MB";
- over 25 MB, the file still downloads, and the modal adds the warning "Over
  25 MB. Pencil may refuse it; if it does, make two smaller worksheets." The
  threshold is Pencil Files' limit until §9.2 step 1 measures the drag-in
  limit.

**On failure**, no PDF is made, and the error names the bank, e.g. "bank.pdf
could not be read: …".

### 4.5 Shared code

Client-only code is loaded with `await import()` inside client handlers, as
the Next docs say for client-only libraries (`02-guides/lazy-loading.md`).

**`lib/worksheet/source.ts`** opens banks in the browser.

- `openBank(fileId, url)` fetches the whole file (`fetch(url).arrayBuffer()`)
  and opens it with pdf.js. One `PDFDocumentProxy` per bank per tab.
- pdf.js transfers the bytes it is given to its worker, which leaves the
  caller's copy empty. The tab keeps no second copy: compose asks the proxy
  for the bytes (`getData()`) only for banks with vector crops, and drops them
  after.
- The tab keeps up to 100 MB of banks open, each counted at its file size
  (the worker's copy). The least recently used bank is closed with
  `destroy()` first. The bank on screen is never closed, so a single bank over
  the budget still opens.
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
and reading order (`pos`). Compose uses its page-kind function too, so a page
is "scanned" by one rule everywhere.

**`lib/worksheet/compose.ts`** builds the output PDF (§6), using pdf.js and
`@cantoo/pdf-lib`.

**`lib/worksheet/ai.ts`** (server only) reads `ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL` and `ANTHROPIC_EFFORT`. `aiConfig()` returns the
configuration, or null when it is not set up (§5.2). The page view and the
route both ask it, so "is AI on" is written once.

**`components/questions/CropThumb.tsx`** renders one crop from an open bank,
for the modal.

### 4.6 Everything touched

**New files:**

- the two pages and the route (§4.2, §4.3, §5.2);
- `app/actions/questions.ts`;
- `components/questions/{QuestionsView,PageView,WorksheetModal,CropThumb}.tsx`;
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
  - new dependencies: `pdfjs-dist` 6.4.299, `@cantoo/pdf-lib` 2.11.1, and
    later `@anthropic-ai/sdk` and `zod`;
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
2. **Digital:** otherwise, at least 100 visible characters. A text item counts
   as visible only if the rendered page has ink inside its bounding box. pdf.js
   reports no render mode per text item (a `TextItem` has `str`, `dir`,
   `transform`, `width`, `height`, `fontName` and `hasEOL`), so this ink test is
   what rejects invisible text drawn in render mode 3.
3. **Neither** (text turned into outlines): no text-layer proposals and no AI.
   The in-charge draws the boxes.

**Proposals.** These rules were tested on single-column pages, two-column
pages, sub-parts, an offset CropBox, `/Rotate 90` and label variants.

1. **Coordinates.** Map every point through `viewport.convertToViewportPoint`
   and `convertToPdfPoint`. That one path handles `/Rotate` and CropBox
   offsets.
2. **Columns.** Look for an empty vertical band in the middle 30–70% of the
   width. Accept it as a gutter only if both sides carry question numbers.
3. **Lines.** Group text items by vertical centre, within half a glyph height.
4. **Labels.** A label is the line's first token, matching, case-insensitive,
   either:
   - `^(?:Q(?:uestion)?\s*)?(\d{1,3})(?:[.):](?!\d)|$)`, or
   - `^(?:Q(?:uestion)?\s*)?(\d{1,3})[.):]\s+\S` (number and text merged).

   These accept "1.", "1)", "Q2", "q2", "Question 3:" and "12. Express …", and
   reject "(a)", "2.5", "3:15", "A1" and "1/2".
5. **A label must:**
   - sit within 6 pt of the column's leftmost label;
   - have a gap above it taller than one line, or be first in its column;
   - belong to the longest run of consecutive numbers in its column.
6. **Box.**
   - **Top:** the label line's top minus 4 pt.
   - **Bottom:** the last *inked* row above the next label. For the last
     question it is the last inked row above the footer band, which is the
     outer 6% of the page height. A row is inked if any pixel has R+G+B below
     600 on the rendered page.
   - **Sides:** shrink to the ink within the column, plus 4 pt.
   - Ink, not text, sets the bottom, so diagrams and answer lines under the
     last line stay inside the box.
7. Sub-parts (a)–(h) and (i)–(viii) never split a question.
8. **Reading order.** When a page is saved, its crops get `pos` in reading
   order on the displayed page: columns left to right, then top to bottom.
   Displayed coordinates, not PDF ones, so a `/Rotate` page reads the way it
   looks.

**Where it is known to miss:**

- sections that restart their numbering on one page (only one run is kept);
- labels like "A1", numbers drawn inside circles, or whole questions numbered
  (a), (b) … (§2.2);
- broken fonts that extract digits as garbage;
- unequal columns, or a diagram that crosses the gutter;
- a shared figure printed above a question number, which the top rule puts in
  the previous question's box (§2.2);
- content drawn sideways with no `/Rotate`.

Each miss means fewer proposals, or none, and the person draws the rest. The
thresholds were tuned on made-up pages, so check them against real banks first
(§9.2).

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
- **Tested** with `@cantoo/pdf-lib`: two pages with the Homework template as
  background and a vector crop on top came out 594.96 × 841.92 pt, with the
  template's Inter Type 3 fonts carried through.

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
- **Rotation.** pdf-lib ignores a source page's `/Rotate`, so the crop is
  drawn with `rotate: degrees(-r)`. With W×H as the displayed size, the
  anchor for r = 0, 90, 180 and 270 is (x, top−H), (x, top), (x+W, top) and
  (x+W, top−H). This was tested on a `/Rotate 90` page.

### 6.3 Three ways a crop is drawn

1. **Vector (digital pages, the default).** One `embedPages(pages, boxes)`
   call per source document, holding every vector crop from it. The box is
   the stored PDF-space box.
   - The crop becomes a clipped Form XObject. Vector text and drawings stay
     vector, and fonts carry through.
   - One call per source shares fonts and images.
   - **Always pass the box.** pdf-lib's default box ignores a non-zero
     MediaBox origin.
   - The page is clipped, not cleaned: the rest of the source page travels
     hidden (§2.3 question 2).
2. **Scanned pages: the box's own pixels.** pdf.js renders the box at the
   scan's own density (the image's pixel width ÷ its width on the page,
   capped at 300 dpi), the canvas is cut to the box, re-encoded as JPEG at
   quality 0.9 and embedded with `embedJpg`.
   - One generation of loss, and no visible change.
   - Only the box goes into the worksheet, so the rest of the scanned page
     never leaves the bank. The owner asked for vector-sharp crops where the
     source is vector; a scan was never vector.
   - Tested on a 203 ppi scan: three crops came to 284 KB, each image holding
     only its box (1453×564, 1453×592, 1453×592 px), against 364 KB for
     `embedPages`, which carried the whole page image.
   - A page is "scanned" by the same function as §5.1.
3. **Raster at 300 dpi (PNG), for what pdf-lib would draw wrongly.** A crop
   takes this path when its source document has optional content that is off
   by default (pdf.js `getOptionalContentConfig()`), or its page has any
   annotation other than a link (`getAnnotations()`). Why:
   - The new document has no `/OCProperties`, so a hidden layer becomes
     visible. In the review's test, a teacher edition with an "Answers" layer
     off by default showed only "QUESTION 1" in pdf.js and poppler, and
     "ANSWER 42" in the worksheet.
   - `PDFPageEmbedder` copies only a page's `Contents` and `Resources`
     (`src/core/embedders/PDFPageEmbedder.ts`), so stamps, FreeText and
     filled form fields are dropped.
   - pdf.js honours the default layer state and draws annotations, so its
     render is what the in-charge saw while cropping and what the teacher saw
     while picking.

   If §2.3 question 2 makes raster crops the rule, every crop from a digital
   page takes this path too.

**Memory.** Sources are processed one at a time. pdf-lib loads a source only
for its vector crops, from `getData()` (§4.5), and needs about 2.2× the file
size. Scanned banks, the big ones, never go through pdf-lib.

### 6.4 Where it runs, and why

The PDF is built **in the teacher's browser**.

- **Speed:** building took 7–73 ms in testing. Loading a 54 MB, 200-page scan
  into pdf-lib took 36 ms (and with §6.3 a scan no longer needs to be loaded
  into pdf-lib at all).
- **What a server version would cost:**
  - Vercel caps every function request and response at **4.5 MB**, and a
    worksheet cut from scans can be larger;
  - getting around that means writing the worksheet to Storage. That needs
    a new storage policy so teachers can write, and it leaves PDF blobs that
    the purge never removes.

**What it costs in the browser, decided:** every bank is downloaded whole,
before its first page shows, both to browse it and to compose from it. pdf-lib
cannot load part of a file, and a signed URL changes every time, so the
browser cache never helps. A bank stays open for the tab (§4.5).

- A 54 MB scan takes about 9 s at 50 Mbps and about 45 s on 10 Mbps home
  Wi-Fi, in every tab and for every teacher who opens it.
- **The decision:** accept this for v1. Most banks are expected to be a few
  MB, the size shows while it loads, and §9.2 step 1 measures the real banks.
- **The pass bar** (§9.2 step 1): the first page of the largest real scanned
  bank shows in under 10 s on an iPad on home Wi-Fi. At 10 Mbps a bank over
  about 12 MB cannot meet it, so the sample banks' sizes already predict the
  answer.
- **If it fails, the fallback** is a small preview image per crop, rendered
  at save time on the in-charge's machine, which already has the page
  rendered, and stored in Storage. Teachers would then pick from the previews
  and download a bank only to compose from it. That needs the Storage write, the
  new policy and purge handling this plan otherwise avoids.
- **Worth trying before that fallback:** pdf.js can read only the byte ranges
  a page needs when it is given the URL instead of the bytes (with
  `disableAutoFetch` and `disableStream`). Whether Supabase's signed URLs
  answer range requests from the app's origin, and how that fits a URL that
  expires after 60 seconds, has not been tried.

Move composing to a route only if real scanned banks are routinely over about
50 MB, or teachers are on weak connections.

**Library:** `@cantoo/pdf-lib` 2.11.1 (MIT), a maintained fork of `pdf-lib`.
The original has not been maintained since 2021.

- The original also refuses encrypted files outright. The fork opens
  owner-password banks with `load(bytes, { password: "" })`, which only
  matters if §2.3 question 5 says yes.
- The same compose test produced the same output with the fork as with the
  original (372 KB against 371 KB, with the same saving from sharing).
- pdf.js already opens such files, so the page view needs no special case.

### 6.5 File name

The pattern is `MathVision {Label} {course code, else course name}
{YYYY-MM-DD HHmm}.pdf`, using the teacher's local date and time. For example:
"MathVision Homework IM2T 2026-10-17 1430.pdf".

- The time keeps two worksheets made the same day, for different children,
  from getting the same name, which is how a worksheet reaches the wrong
  child. No child's name goes in it.
- With a bank-holding course (§2.3 question 1), the code is that course's.
- Characters other than letters, digits, spaces, hyphens and brackets are
  dropped.
- The PDF's Title is the same name, without `.pdf`.

## 7. Getting it into Pencil

Pencil has no boards API or files API, so the portal pushes nothing. The
teacher:

1. downloads the worksheet (§4.4);
2. opens the child's Space for that course;
3. drags the PDF onto the canvas, or uses Upload → PDF;
4. chooses **one page per board**.

Each page becomes its own board, and each page is the template's own page
with the crop on top, so the new boards match the template's boards. Pencil's
PDF import takes up to 1,000 pages. What Pencil does with the file after the
import is checked in §9.2 step 1.

## 8. Volume, limits, security, failure modes

### 8.1 Volume

The owner has not given volumes. The design handles the following:

- **Banks:**
  - digital banks are typically a few MB;
  - the scanned test bank was 200 pages and 54 MB;
  - on the Supabase Free plan no upload can exceed 50 MB, and on Pro the
    global limit can be raised to 500 GB. The bucket sets no limit of its own
    (`file_size_limit` is null in `20260611000005_storage.sql`), so the
    project's global limit applies. §9.2 step 1 checks the plan. On Free, an
    in-charge splits a bigger scan before uploading it, by chapter or
    section, and each part is its own bank.
- **Crops:** many per page, about 4 to 12. A 100-page bank holds roughly 400
  to 1,200 questions, and a course a few thousand. The reads measured in §3.5
  take 5–11 ms locally at 5,000 crops in a course. That is a floor, repeated
  on Supabase before anyone relies on it.
- **Storage egress.** Every bank opened downloads the whole bank, in every
  tab. Egress per month is roughly bank opens × average bank size. For
  example, 10 teachers each opening 3 banks a working day, 22 days a month:
  about 6.6 GB at 10 MB a bank, and about 33 GB at 50 MB. Compare that with
  the plan's included egress (Supabase dashboard → Usage) once step 1 knows the
  real sizes.
- **Worksheet:** usually 5 to 20 questions from 1 to 4 banks.
- **Rendering a page** took 58–81 ms at 144 dpi.

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
  Vector crops carry the hidden rest of their page (§2.3 question 2). Scanned
  crops carry only their box.

### 8.3 Failure modes

| What happens | Result |
|---|---|
| Big scanned bank | Slow first open. The size is shown, and the bank stays open for the tab. §6.4 sets the pass bar and the fallback. |
| A scan stored as JBIG2, JPEG 2000 or CCITT (common from office scanners) | Without `wasmUrl` it renders **blank**, with only a console warning. The `postinstall` copy prevents this, and §9.2 checks it on a real scan. |
| CMYK images in a print-ready bank | Without `iccUrl`, pdf.js warns and shows them off-colour. The `postinstall` copies `iccs/` and §4.5 sets `iccUrl`. |
| An iPad or school Chromebook running an older browser | The modern pdf.js build crashes (`getOrInsertComputed`). Use the legacy build. |
| A PDF that needs a password to open | Refused, with a message. |
| A file that is not a readable PDF | "This file isn't a readable PDF." |
| A bank locked by its publisher | Depends on §2.3 question 5: cropped as normal, or refused by name. |
| A bank with a layer hidden by default, or with annotations | Those crops are rendered by pdf.js at 300 dpi (§6.3), so the worksheet shows what the screen showed. |
| A question split across columns or pages, or sharing a figure | One box per question, or up to three if §9.2 step 1 says so (§2.2). |
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
- **Trash:** questions are hidden from everyone, crops are refused, and
  `can_crop_file` is false. After restore, everything is back.
- **Student-visible bank:** teachers still read its crops,
  `question_sources` says so, and nobody can change them.
- **Purge:** a hard delete of a file, or of a folder, cascades to its
  questions.
- **View:** `question_sources` agrees with `questions` for every role.

**Manual checks:**

- the §5.1 rules on the test banks and on 20 real pages;
- `pdffonts` and `pdfimages -list` on a worksheet: vector crops keep their
  fonts, and each scanned crop is one image the size of its box at the scan's
  density;
- a crop from a bank with an answers layer hidden by default comes out
  without the answers;
- a worksheet page overlaid on the template PDF: identical by construction,
  so this checks only where the crops sit.

### 9.2 Rollout

0. **The owner:**
   - answers §2.3, question 1 before PR 1 (question 2 is settled by the
     sample banks in step 1);
   - sends 3 or 4 sample banks, including any publisher bank locked against
     copying or printing, and any teacher edition with answers in a layer;
   - sends the topic lists, per course.
1. **Checks before any code (about a day).** Each check names what its
   answer changes.
   - **The sample banks:**
     - size per file, which predicts the §6.4 pass bar;
     - image codecs (`pdfimages -list`);
     - encryption and its permissions (`pdfinfo` shows print and copy), for
       §2.3 question 5;
     - `/OCProperties` with groups off by default, and pages with `/Annots`
       (`pdfinfo` shows neither; pypdf's `reader.trailer["/Root"]` and each
       page's `"/Annots"` do), which tells how often §6.3's raster path runs;
     - label styles, sections that restart numbering, and column layouts,
       for §5.1;
     - whether answers share pages with questions, which decides §2.3
       question 2;
     - the share of questions that span a page or column break, or depend on
       a shared figure or table, which decides one box or up to three (§2.2)
       before PR 1;
     - how often two in-charges would crop one bank at once, which decides
       whether "crop once" needs a trigger (§2.2).
   - **Supabase:** the plan, and the project's global file-size limit. On
     Free, scans over 50 MB are split before upload (§8.1). Then apply the
     migration to a Supabase project with a seeded course of 5,000 crops and
     time §3.5's reads as a teacher.
   - **Pencil**, importing a sample worksheet with one page per board:
     1. *Does the import keep vector, or rasterise?* Kept: §6.3's vector
        path matters on boards. Rasterised: compose is unchanged, because the
        downloaded file still benefits, but on boards only pixels remain, so
        the hidden rest of a vector crop's page does not reach a board.
     2. *Signed in as a student in that Space, do the original PDF's bytes or
        its text layer reach the student's browser?* Check in devtools
        (Network, and the page's text). No: the hidden content stays in the
        teachers' files. Yes: everything behind a vector crop reaches every
        student in the Space, which is acceptable only if §2.3 question 2
        found no answers on question pages; otherwise raster crops.
     3. *Does a PDF dropped into a Space also land in Pencil Files, and can a
        student see it there?* Pencil's help centre calls Files a library
        that "you and members of your institution can access", and says files
        can be uploaded to it while working in a Space. Whether a plain
        drag-in lands there, and whether students count as members, is not
        stated. If students can see it, the outcome is the same as a yes to
        check 2.
     4. *Does the drag-in have a size limit of its own?* Lower than 25 MB:
        the modal warns at that size. Otherwise the warning stays at Pencil
        Files' 25 MB.
     5. *How are the imported boards named:* by file name, by the PDF's
        Title, or by number? By name or Title: §6.5's name is what teachers
        see on the boards, so it stays as it is. By number: nothing to do.
     6. *Does a Space have a board limit?* At 10–20 boards a week, a year in
        one persistent Space is hundreds of boards. If there is a limit,
        teachers remove old worksheet boards, and how often becomes a question
        for the owner.
   - **Browser:**
     - `fetch()` a `getViewUrl` URL from the app's origin (CORS has not been
       tried in this codebase);
     - the legacy pdf.js build and `@cantoo/pdf-lib` in a Next 16.2.9
       Turbopack production build;
     - on a real iPad on home Wi-Fi: the first page of the largest real
       scanned bank in under 10 s (§6.4, with the fallback if it fails), then
       a worksheet composed from it.
2. **PR 1, database:**
   - the migration, in the one-box or multi-box shape step 1 chose;
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
5. **AI:**
   - run the measurement in §5.2;
   - if a pair reached 98%, set `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and,
     if measured, `ANTHROPIC_EFFORT` in Vercel, for Production and Preview,
     then redeploy;
   - PR 4 adds the route and the button. If no pair reached 98%, there is no
     PR 4.
6. **The owner** moves banks into teacher-only folders (the crop screen
   refuses any other), and tells in-charges that a bank with answers on its
   pages goes in as a separate, answers-free file. In-charges start cropping.

### 9.3 Out of scope

- pushing anything into Pencil, or putting worksheets in Pencil Files;
- automatic marking;
- answer keys and worked solutions, unless the owner asks;
- saved worksheets, history, or a record of which child got what. Under
  current RLS a teacher cannot even read the course's student list.
- questions in several pieces, unless §9.2 step 1 says otherwise;
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
2026-10-17 in a session scratchpad that will not be kept. The repo paths they
become are: the shim, `supabase/tests/shim.sql` (printed in full in §3.6);
the probe, `supabase/tests/questions.sql` (its assertions are §9.1); the
template PDFs, `public/worksheet/template-{lesson,homework}.pdf`. Until those
are committed, the copies are at
`/tmp/claude-0/-home-user/b8ff5489-9a06-5194-9ebd-bb6175d94e88/scratchpad/`:
`wsrev2/sql/` (the migration as tested, the shim and the probe),
`out/mathvision-a4-{lesson,homework}.pdf` and `out/a4-{lesson,homework}.html`
(the template). Copy them into the repo before that session ends.

## Review notes

The review's findings were applied, with these exceptions and choices.

1. **Committing the shim, probe and template PDFs now** (the "ephemeral
   artefacts" finding) was not done: this commit carries only this document.
   The shim is printed in §3.6, the repo paths are named, and the Evidence
   note says where the files are until PR 1 and PR 3 commit them.
2. **"Plus a Worksheet variant" of the template** (the template finding) is
   not needed: the label is now Lesson or Homework only, matching the
   template's two boards.
3. **Condition (b) on vector crops.** One finding restated it as "the original
   PDF bytes never reach a student's browser"; another said to decide on
   answers alone. Both are applied: §2.3 question 2 is decided on whether
   banks print answers on question pages, and the student-browser check is a
   Pencil check in §9.2 whose outcome feeds that decision.
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
   keeps one: pdf.js holds the bytes and compose asks for them back with
   `getData()` (§4.5).
8. **Timeout.** Of the two suggested settings, 50 s with no retry was chosen
   (§5.2).
9. **Reordering picks.** Of "add Move to top, or drop reordering", dropping it
   was chosen (§2.2).
10. **Two findings about who may crop a student-visible bank** asked either to
    ask the owner or to decide with a recommendation. It is decided as a §2.2
    default with its costs, which the owner can overrule.
11. **The topic list** is recommended per course, so the migration carries
    `question_topics.course_id`. If the owner wants one centre-wide list, that
    column and `topic_fits` go before PR 1.
12. **Local timings.** After the restructure, the reads the screens make
    measured 5–11 ms rather than the review's ~350 ms per list page, which
    timed the earlier cross-bank list. They are still floors until measured on
    Supabase (§3.5).
13. **"Paid each time Suggest boxes is pressed."** One finding asked for that
    wording; another asked to keep a page's suggestions in the tab so a second
    press does not call again. With the second applied, the first is no longer
    true, so §5.2 says "about once" and names what does pay again: a reload,
    another tab, or a second in-charge.
