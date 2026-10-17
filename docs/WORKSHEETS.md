# Worksheet maker

Plan, 2026-10-17, revised the same day after review, again after the owner
answered its five open questions (§2.1, items 10–14), and again after a
review of that revision. The owner then asked for it to be built small: each
crop's picture is made on demand, when a worksheet is drawn (§6.3), and there
is no AI step for now (§2.1 item 9). The database, PR 1, is built (§3); the
screens and the worksheet are not. The reviews' findings,
and the few this plan does not take, are listed at the end.

## 1. What it is and who uses it

The owner, on the banks: *"for question banks they are usually in pdf format
and usually many questions per page"*. Some pages are digital, with text you
can select. Others are scanned. Many banks mix the two.

The worksheet maker turns those banks into worksheets a teacher can drop into
a child's Pencil Space. It works in four steps:

1. **Crop once.** An in-charge (or an admin) opens a bank PDF and draws a box
   around each question. A question is saved with its source file, up to four
   boxes on any of its pages, and an optional topic. Nobody crops the same
   question twice.
2. **Suggestions.** The tool proposes boxes. On digital pages it reads
   question numbers ("1.", "Q2") from the PDF's text. Scanned pages are drawn
   by hand for now (§2.1 item 9). A person confirms every box. Nothing
   unconfirmed is saved.
3. **Pick and print.** A teacher opens a bank page by page, clicks the
   questions they want, and downloads a branded A4 PDF. Each question sits at
   the top of its own page, and the rest of the page is blank for working.
   Short questions go two to a page. Every question is a 300 dpi picture of
   its own box, so nothing else on the bank's page goes with it.
4. **Into Pencil.** The teacher drags the PDF into the child's Space and
   chooses "one page per board".

Roles, per course. Banks live in long-lived bank-holding courses (§2.1
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
   - *Changed later on 2026-10-17:* *"Okay give the teachers download
     access."* Pencil cannot be sent a file, so a PDF reaches a child's Space
     only from somebody's own computer, and teachers today give whole
     booklets or mark questions in them. `getViewUrl` now gives a course's
     teachers the Download button that a76d16e had kept for admins and
     in-charges, on every file they can open, teacher-only folders and mark
     schemes included. Students still only view. So a worksheet no longer
     relaxes anything for the teacher.
   - Every crop is still a picture of its own box (item 11, §6.3), so a
     worksheet carries the questions picked and nothing else of the bank.
     That protects whoever the worksheet reaches, not the teacher.
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
   - *Changed later on 2026-10-17:* the owner asked for it to be built small,
     so there is no AI step for now: no route, no AI column and no Anthropic
     settings. Scanned pages are drawn by hand (§5.3). None of the centre's
     own banks has a scanned question page (§9.2.1). §5.2 stays as the design
     if AI is wanted later.

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

    *Changed later on 2026-10-17:* there is one long-lived bank-holding course
    for each set of banks that courses share, rather than one per level: for
    example one for IM2 with Geometry/IM2, and one for IM3 with Algebra 2
    Trig. That is course setup, and changes nothing in the schema.
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
  avoids a page that reads "1. 7.". The order of questions comes from where
  their boxes sit: the first box's page and `pos`, then the second's (§3.4,
  §4.4), not from a number someone has to read correctly.
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
  `box_no` 1–4), and compose stacks them in order. A shared stimulus is drawn
  once and becomes box 1 of every question that uses it, copied into each
  (§3.1). A question's boxes can sit on different pages of its bank. A
  question longer than four boxes is cropped as two questions. §3.4, §4.3 and
  §6.2 are drawn for this shape.
- **Layout is automatic.** Two short questions in a row share a page (§6.2).
  There is no layout control. One-per-page-always is added only if someone
  asks.
- **Label is Lesson or Homework, matching the template's two boards.** The
  default is Homework, because one question per page with room for working is
  homework-shaped.
- **Picks print in bank order:** bank, then the first box's page and
  position, then the second's (§4.4). There is no reordering in v1, only
  removing a pick.
- **A worksheet over 25 MB still downloads,** with a warning (§4.4).
- **Crop once is a screen hint, not a database rule.** A suggestion that
  overlaps a saved crop is never shown, and a question whose only box another
  question also has is marked "cropped twice: delete one" (§4.3). A
  hand-drawn box over a saved crop, or two in-charges on the same page, can
  still make a duplicate, and it is deleted by hand. If the sample check in
  §9.2 shows heavy concurrent cropping, a before-insert trigger refusing an
  overlap on the same file and page is the fix.
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

Built in PR 1. The migration is
[`supabase/migrations/20261017000009_questions.sql`](../supabase/migrations/20261017000009_questions.sql),
and its tests are in `supabase/tests/` (§3.6, §9.1). This section says what
the migration does and why; it does not copy it, so the file is the only
version.

### 3.1 What is new

- **`question_topics`**, the topic list: a course, a name and a position. One
  fixed list per course (§2.1 item 12). Its rows come from the snippet in
  `DEPLOYMENT.md` step 8, never from the migration.
- **`questions`**, one row per question: its bank (`file_id`), an optional
  topic, who made it and when. A question has no page or box of its own.
- **`question_boxes`**, a question's boxes, one to four, printed in `box_no`
  order. Each has its page, its box in PDF space and its reading order on that
  page (`pos`). One question's boxes can sit on different pages of its bank
  (§2.2).
- **`question_sources`**, a read-only view: one row per bank with crops, for
  the Questions page.
- **`can_crop_file(file_id)`**, the only place the "who may crop" rule is
  written.
- **`topic_fits(topic_id, file_id)`**, which keeps a question's topic inside
  its bank's course.
- **`question_course_ids()`**, the courses whose questions the caller may
  read. It bounds the two read policies (§3.2).
- **`save_crops(file_id, add, edit, remove)`**, the one write path: the crop
  screen's changes to one bank, in one transaction, as the caller (§3.4).

There is no worksheet table and no AI column. Nothing is stored in the
Storage bucket, `getViewUrl` and downloads are unchanged, and the purge needs
no change.

**A shared stimulus is copied.** An instruction, table or figure printed once
above several questions is drawn once on the screen, and saved as box 1 of
every question that uses it, with the same numbers in each. Every question
owns its rows, so changing or deleting one question never changes another,
and there is no row shared between questions to count, lock or leave behind.
The screen knows a stimulus by its numbers: the same page and corners in two
or more questions (§4.3). Postgres writes `real` in its shortest round-trip
form, so copies sent as the same JSON numbers stay equal; PR 2 confirms that
through PostgREST.

### 3.2 Visibility comes from the source file

- **Who can read a question:** an admin, or a teacher or in-charge of its
  bank's course, and only while the bank is live. Students never.
  - The policy is an `EXISTS` on `files`: the file is live, and its course is
    in `question_course_ids()`. The `EXISTS` runs `files_select` as the
    caller, so the file's own rule decides everything else. No teacher-only,
    `eff_teacher_only` or `deleted_at` column is copied onto questions, and
    the teacher-only triggers, `recompute_subtree` and `restore_batch` are not
    touched.
  - `question_course_ids()` returns every course for an admin, and otherwise
    the courses the caller teaches or is in_charge of. It is asked once per
    query, as `(select …)`, so the planner reads only the caller's own
    courses' files, through `files_course_idx`. Without it every read ran
    `files_select` over every file there is: 150–200 ms for a teacher's read
    at 10,000 files (§3.5).
- **Who can read a box:** exactly who can read its question.
  `question_boxes` carries its question's `file_id`, kept equal by a composite
  foreign key (`question_id, file_id` → `questions (id, file_id)`), so its
  read policy is the same `EXISTS`, on its own `file_id`.
  - The policy is copied rather than called. A SQL function holding a subquery
    is not inlined and would run once per row, and reading boxes through
    `questions` re-ran the questions policy for every box, which was 12 times
    slower to list a course.
  - The SQL tests fail if the two policies ever differ in text, or if any role
    sees a box without its question or a question without a box (§3.6).
- **There is no `course_id` on questions or boxes.** The course is the file's
  course. The app never changes a file's course (`registerFile` sets it once,
  `moveFile` changes only the folder, both in `app/actions/files.ts`), but the
  database does not stop it: `files` keeps Supabase's table-wide UPDATE grant,
  and `files_update` asks only that the caller be in_charge of the new course.
  So someone in_charge of two courses, or an admin, can move a cropped bank
  with a direct API call. Its questions go with it, to the other course's
  teachers, and a topic from the old course then fails `topic_fits`, so every
  edit that sends it is refused until it is cleared. Nobody can do more than
  their role already allows; §9.4 item 6 narrows the grant.
- **Who can write:** the person passes `can_crop_file(file_id)`. They are an
  admin or the course's in_charge, the file is live, and students cannot see
  it (§2.2). The same function serves every insert, update and delete policy
  on questions and on boxes, and the page view asks it whether to show the
  crop tools.
- **A topic must belong to the file's course** (`topic_fits`), on insert and
  on update.
- **Column grants:**
  - a question is inserted with its `id`, `file_id` and `topic_id`, and
    afterwards only its topic changes. The `id` is made by the crop screen
    (§3.4). `created_by` always comes from its default, `auth.uid()`;
  - a box is inserted with every column but `id`. Afterwards it may change its
    `box_no`, corners and `pos`, never its question, file or page. A box that
    moves to another page is removed and added again.
- **The app writes only through `save_crops`.** It is `security invoker`, so
  RLS, the column grants and the foreign keys still decide every row. If
  anything in a call is refused, it raises an error and nothing at all is
  written.
- **"One to four boxes, numbered 1..n, and no question without a box" is a
  rule `save_crops` keeps, not the schema.** The column grants also let
  whoever may crop a bank write its two tables directly through the API: a
  question with no box, a question's only box deleted, boxes numbered 1, 2
  and 4, or a box 3 alone. Only someone who may crop that bank can do it,
  they could delete its crops through `save_crops` anyway, and the app never
  does it. So the readers do not rely on the rule: they order a question's
  boxes by `box_no` and take the first, never look for `box_no = 1`, and drop
  a question with no box (§3.5, §4.4). A `save_crops` edit of such a question
  numbers its boxes 1..n again, or deletes it if it lists none.

### 3.3 Trash, the 30-day purge, and the bank's bytes

- **A bank goes to Trash.** Teachers stop seeing its questions and boxes at
  once, and so does everyone else, admins included, because both read
  policies require a live file. `can_crop_file` is false, so every write is
  refused.
- **The bank is restored** (`restore_batch`). Its questions and boxes come
  back unchanged, because nothing about them was changed.
- **The bank is purged after 30 days.** The service role deletes the `files`
  row. Its questions go with it (`on delete cascade`), and their boxes go with
  them (the composite foreign key cascades too). A hard delete of the bank's
  folder or course does the same.
- **Why cascade is required.** With the default `NO ACTION`, the purge's row
  delete would fail on the first bank that has crops. Both purge copies return
  500 on the first failure (`app/api/cron/purge/route.ts:49-55`,
  `supabase/functions/purge/index.ts`), so all later purging would stop. With
  cascade, neither purge copy changes.
- **A question is deleted.** Its row and its boxes go at once. There is no
  Trash for questions (§2.1 item 13).
- **A topic is deleted.** Its questions' `topic_id` becomes null. A course
  deleted takes its topics with it.
- **The bank's bytes are assumed never to change.** A box is a page and a
  rectangle on a file id. Uploads always use a fresh object name
  (`hooks/useUploader.ts:139-140`), so a re-upload is a new file. But nothing
  enforces that: the storage policy `course_materials_update` lets an
  in_charge or admin overwrite objects under their course's path, and the TUS
  upload sends `x-upsert: true` (`lib/upload/resumable.ts:75`). A crafted
  upload to an existing file's path would replace the bank in place, and
  every box would then point at different content. §9.4 item 4 closes this.

### 3.4 Migration: `supabase/migrations/20261017000009_questions.sql`

It sorts after `20260612000008_country.sql`, and is appended to
`supabase/schema.sql` under `-- >>> 20261017000009_questions.sql`. It can be
run twice, because `DEPLOYMENT.md` §2 pastes SQL by hand: tables and indexes
use `if not exists`, every policy is dropped before it is created, and the
functions and the view use `create or replace`. It has no type and no
trigger.

**Tables.**

| Table | Columns | Rules |
|---|---|---|
| `question_topics` | `id`, `course_id` (cascade), `name`, `position` | unique `(course_id, name)` |
| `questions` | `id`, `file_id` (cascade), `topic_id` (set null), `created_by` (default `auth.uid()`, set null), `created_at` | unique `(id, file_id)`, which the boxes' foreign key points at |
| `question_boxes` | `id`, `question_id`, `file_id`, `box_no`, `page`, `x0`, `y0`, `x1`, `y1`, `pos` | below |

A box:

- `box_no` is 1–4, its place in print order. Four is the most a past paper's
  question runs over (§2.2). It is unique per question, and that unique is
  deferrable (checked at the end of each statement), so one statement can
  renumber a question's boxes.
- `page` is 1 or more.
- `x0, y0, x1, y1` are PDF user-space points on the source page, before its
  `/Rotate`, CropBox offset included: what pdf.js `convertToPdfPoint` returns,
  and what `convertToViewportPoint` takes to render the box. y grows upwards.
  The check `x1 > x0 and y1 > y0`, all within ±14,400 (the largest page a PDF
  allows), also refuses NaN, because Postgres orders NaN above every number.
- `pos` is the reading order on its page (columns left to right, then top to
  bottom), set by the crop screen every time the page is saved.
- The same box twice in one question is refused, because it would print
  twice (unique `(question_id, page, x0, y0, x1, y1)`). The same box in two
  questions is allowed: it is how a stimulus is shared.
- `(question_id, file_id)` references `questions (id, file_id)`, on delete
  cascade, so a box is always on its question's file.

Indexes: `questions (file_id)`, `questions (topic_id)` and
`question_boxes (file_id, page, pos)`, plus the unique
`question_boxes (question_id, box_no)`, which serves every lookup of one
question's boxes. `created_by` has no index, like every other column here
that records who made a row (on `courses`, `folders`, `files` and
`enrollment_requests`): only deleting a profile reads it, which the app never
does, and the scan costs that delete about 5 ms at 75,000 questions.

**Policies.** All are `to authenticated`, and anon has no grant on any of the
four relations or the four functions.

| | Select | Insert | Update | Delete |
|---|---|---|---|---|
| `question_topics` | admin, or teacher or in_charge of the course | — | — | — |
| `questions` | live file, course in `question_course_ids()` | `can_crop_file` and `topic_fits` | `can_crop_file`, then `can_crop_file` and `topic_fits` | `can_crop_file` |
| `question_boxes` | the same, on the box's `file_id` | `can_crop_file` | `can_crop_file` | `can_crop_file` |

No policy or security-invoker function calls `auth.uid()` bare. `is_admin`,
`course_role` and `question_course_ids` are `security definer`, which the rule
exempts, and `question_course_ids` uses `(select auth.uid())` anyway. The only
bare call is `created_by`'s default.

**`save_crops(_file_id, _add, _edit, _remove)`.** One call is one transaction
on one bank, run as the caller. The screen calls it from `savePage` when the
in-charge leaves a page or presses *Save* (§4.3). It takes no page, because a
page's changes can reach boxes on other pages: a question that runs over a
page break, or a stimulus on the page before.

- **`_add`**, new questions: `[{id, topic_id, boxes: [{page, x0, y0, x1, y1,
  pos}, …]}]`.
  - `id` is made by the screen with `crypto.randomUUID()` and is required. A
    missing id is refused, and so is one already used, so a save retried after
    its reply was lost writes nothing twice.
  - A box's `box_no` is its place in the list, box 1 first. No boxes, or no
    `boxes` key, is refused, and so is a fifth box.
- **`_edit`**, saved questions: `[{id, topic_id, boxes: […]}]`. `boxes` is the
  question's whole new list, in print order:
  - `{id}` keeps a box as it is, at that place;
  - `{id, x0, y0, x1, y1, pos}` keeps it at that place with new corners or
    reading order. Fields left out are kept, so the screen sends corners only
    for the boxes it moved. A kept box stays on its page: a `page` other than
    its own is refused, and a box that moves page is removed and added again;
  - an entry with no `id` is a new box, and needs its `page`;
  - `topic_id` is written only when the entry has the key, and null means no
    topic. The screen sends it only for a question whose topic it changed, so
    a page save cannot undo a topic another in-charge set meanwhile.
- **`_remove`**, box ids. A question left with no box is deleted.

The function, in order:

1. Deletes the `_remove` boxes in this bank. The count must equal the number
   of ids, so an id listed twice, of another bank, already gone, or hidden
   from the caller is refused. It notes which questions lost boxes.
2. Updates every `_edit` question in this bank, writing its topic if sent.
   The count must match, which refuses a question of another bank, or one
   listed twice. The update also locks each edited question until the save
   commits, so a second save that edits it waits for this one.
3. Refuses if an edited question holds a box its list neither keeps nor
   removes: somebody added it since this screen read the bank.
4. Refuses a kept box sent with a page other than its own. Then moves the
   kept boxes to their place in the list, with their new corners and `pos`.
   The count must match, which refuses a box listed twice, or listed under
   another question.
5. Inserts the edited questions' new boxes.
6. Renumbers each question that lost a box, so its boxes run 1..n again, and
   deletes any question left with none.
7. Inserts each `_add` question, then its boxes.

Every check raises, so a refused call writes nothing. What the screen gets
back, by SQLSTATE (§4.3 says what it shows):

| SQLSTATE | Why |
|---|---|
| `42501` | Changed elsewhere, or not the caller's to change: steps 1–4, or a policy. |
| `23505` | A new question's id already used, which is a retried save; or the same box twice in one question. |
| `23514` | No box, a fifth box, an inverted, NaN or page-0 box, or a kept box sent with another page. |
| `23502` | A missing id, page or `pos`. |
| `22P02` | Something that is not a uuid or a number. |
| `40P01` | A deadlock with another save of this bank (below). This save wrote nothing. |

Two saves of one question: the second waits for the first to commit. If the
first changed which boxes the question has, the second is then refused at
step 3 or step 4 (§3.6). Otherwise both apply: a topic, corners or `pos` that
both send is last-writer-wins, and a topic only one of them sends is kept.

A save that only removes a question's boxes takes no lock on the question
until step 6, so two saves that overlap on two questions can deadlock. In the
case tried (§3.6), T2 removed question A's only box and edited B, while T1
edited A, then B: T1 held A and waited for B, and T2 held B and, deleting the
emptied A, waited for T1. Postgres aborted T1 with `40P01`. Nothing is lost,
because the aborted save wrote nothing, and the screen offers *Try again*
(§4.3).

Hand edits in the same PR:

- `lib/types.ts`: `QuestionTopic`, `Question`, `QuestionBox` and
  `QuestionSource`. No reader or action yet: PR 2 adds the first.
- `DEPLOYMENT.md`: the three tables in §2's Verify list; "already deployed?
  paste just this file", with why `supabase db push` is only for a project
  whose migration history is complete (§9.2 step 2); and step 8, the topic
  snippet, run once per bank-holding course from the owner's list (§2.1 item
  12). It finds the course by its code, can be run again, and lists the
  topics it wrote, so an empty result means the code matched no course.
- `README.md`: "Nobody can hard-delete" now covers files and folders, and
  says a question and its boxes are deleted outright. The permission matrix
  gains *Crop questions from a teacher-only bank* (in_charge, admin) in PR 2
  and *Pick questions, download a worksheet* (teacher, in_charge, admin) in
  PR 3, when there is a screen for each.

### 3.5 How the app reads it

- **The page view** (§4.3) reads one bank with `listBank(fileId)` in
  `lib/queries.ts`: one server action making two flat reads in `Promise.all`:
  1. `question_boxes`: `id, question_id, box_no, page, x0, y0, x1, y1, pos`,
     `.eq('file_id', id)`, ordered by `page`, `pos`, `id`;
  2. `questions`: `id, topic_id`, `.eq('file_id', id)`, ordered by `id`.

  - Supabase's API returns at most the project's max rows (1,000 by default)
    per request, so each read asks for `count: 'exact'` and pages with
    `.range()` until it has read that many rows. Both orders end in `id`, so
    the ranges neither repeat nor miss a row while nothing changes. A save
    that lands between two ranges rewrites `pos` and can move a box across
    the boundary, so one box is read twice and another missed. `listBank`
    keeps one row per id, and an edit built on a list that missed a box is
    refused at step 3.
  - Neither table is embedded in the other. An embed costs 27–100 ms per
    range, because the inner table's policy runs once per row.
  - Topics come from `listTopics`, the file from `getFile`, and for managers
    `rpc('can_crop_file')` and the file's `eff_teacher_only`.
  - The two reads are separate snapshots, so the screen shows a question only
    when it read both its row and at least one of its boxes. A question saved
    between the two reads shows after the next read. An incomplete box list
    behind a shown question cannot corrupt anything: an edit built on it is
    refused at step 3.
  - A question's boxes are ordered by `box_no`, and the first is where it
    starts, whatever its number (§3.2).
- **The Questions page** reads `question_sources` for the course, one row per
  bank with crops:
  - `questions` counts each question once, however many boxes it has;
    `pages` counts a page if any box is on it;
  - `first_page` is where a click on the row opens the page view;
  - it has no `LIMIT`, because it is bounded by the course's files. Folder
    names for the labels come from the existing `listAllFolders`.
- **The worksheet modal** reads the picks with `preparePicks(courseId, ids)`,
  in one select under the session:

  ```ts
  supabase
    .from("questions")
    .select("id, file_id, topic_id, files(name, folder_id, storage_path), " +
            "question_boxes(box_no, page, x0, y0, x1, y1, pos)")
    .in("id", ids)
    .order("box_no", { referencedTable: "question_boxes" });
  ```

  PostgREST follows the composite foreign key from `question_boxes` to
  `questions`, the only path between them. The file name and the boxes' pages
  make each question's source line (§6.2). A row whose `question_boxes` comes
  back empty is dropped like a missing one (§3.2). It then signs the banks
  (§4.4).

Measured on a scratch Postgres 16 with Supabase's own `auth.uid()`, seeded as
a level's bank-holding course after some years (§8.1), among many other
courses: 201,600 questions and 234,066 boxes (16% with a second box), 12 banks
of 2,100 questions in the teacher's course, and 10,000 ordinary files in 200
other courses. The teacher is in 4 courses.

| Read or write | Teacher | Admin |
|---|---|---|
| One bank's boxes, per 1,000-row range (3 for a 2,100-question bank) | 5–7 ms | 60–80 ms |
| That read's exact count | 3–4 ms | |
| One bank's questions, per range | 5–6 ms | |
| `question_sources` for the course | 46–50 ms | 95–135 ms |
| 20 picks with their boxes and file names | 3–4 ms | |
| Saving 12 new questions, two of them under one stimulus (in-charge) | 18–26 ms | |
| Saving 18 boxes re-ordered and 1 removed (in-charge) | 16–17 ms | |

- With the draft's read policy, which checked the course inside the `EXISTS`
  rather than against the course list, the same data took 150–200 ms per
  teacher read, and 230–260 ms for `question_sources`.
- An admin's reads are slower because `files_select` calls `is_admin()` bare
  and `course_role()` up to three times per row (§9.4 item 5).
- These are floors from a shared 4-core machine. §9.2 step 1 repeats them on
  Supabase.

### 3.6 Verified

`supabase/tests/run.sh` (§9.1):

1. creates a uniquely named scratch database;
2. applies `supabase/tests/shim.sql`, which stands in for Supabase's roles,
   `auth.uid()` and storage tables;
3. applies every migration in order, and this one a second time;
4. runs `supabase/tests/questions.sql`. Every check is an `assert` under
   `ON_ERROR_STOP`, so the first failure stops the run with a non-zero exit.
   `run.sh` sets `plpgsql.check_asserts=on`, so a caller's or the server's
   setting cannot turn the asserts into no-ops;
5. drops the database, however the run ended.

The fixtures are six people (an admin; an in-charge, a teacher and a student
in course A; an in-charge and a teacher in course B) and four files: in
course A, `bank.pdf` and `bank2.pdf` in a teacher-only folder and `open.pdf`,
which students can see; in course B, `bankB.pdf`. After the first saves:

| Person | Questions | Boxes | Topics |
|---|---|---|---|
| admin | 5 | 7 | 2 |
| in_charge A | 4 | 6 | 1 |
| teacher A | 4 | 6 | 1 |
| student A | 0 | 0 | 0 |
| in_charge B | 1 | 1 | 1 |
| teacher B | 1 | 1 | 1 |

`question_sources` agrees with the tables for every role, and anon is refused
all four relations and all four functions. §9.1 lists what each section of
the suite asserts.

The suite also passed:

- with Supabase's own `auth.uid()` body in place of the shim's simpler one;
- on a fresh database set up from `supabase/schema.sql` alone;
- against 28 deliberate breakages of the migration, such as a dropped Trash
  clause, a dropped count check, a wider grant, a fifth box, an edit that
  always writes the topic, or a kept box allowed to change page. It failed on
  27. The 28th, a bare `auth.uid()` inside `question_course_ids`, is allowed
  by the repo's rule, because that function is `security definer`.

By hand, not in the suite: two sessions saving one question at once. In both
cases tried (one added a box while the other moved one; one added a box while
the other deleted the question), the second save waited for the first to
commit and was then refused at step 3, and the first save's boxes were
intact. A third case, two saves overlapping on two questions with a third
session ordering their waits, deadlocked, and Postgres aborted one with
`40P01` (§3.4).

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
- the bank's questions and boxes (`listBank`, §3.5) and the course's topics;
- `?page=` as the page to open first;
- for managers, `can_crop_file(fileId)` and the file's `eff_teacher_only`.

It renders one client component, `components/questions/PageView.tsx`.

**Layout.**

- The screen is a fixed full-screen surface (`fixed inset-0 z-50`), like the
  Viewer, so the 272 px sidebar does not shrink the page.
- **Header:**
  - a back link to Questions;
  - the file name;
  - a **page select** with previous and next buttons. Each row reads
    "p. 12 · 6 questions", counting each question with a box on that page
    once. Managers see every page; a page with unsaved changes reads
    "p. 12 · not saved". Teachers see only pages with a box on them. It is
    picked from a list, works at every width and renders no thumbnails;
  - **Topic**, a select whose first row is "Any topic". It narrows the page
    select to pages with that topic and dims boxes of other topics. Hidden,
    like every topic picker, while the course has no topics;
  - for managers on a croppable bank: *Topic for new questions* (first row
    "No topic") and *Save* (reads "Save 3" while there are unsaved changes,
    disabled when there are none).
- **Body:** the page rendered at fit-width, with an SVG overlay for the
  boxes.
- **Picks bar** at the bottom, copied from `Browser.tsx:402-443`: "{n} picked
  · *Make worksheet* · ×".

**What the screen draws.** From the two reads of §3.5, the client builds:

- each question's boxes, in `box_no` order;
- one rectangle for each distinct page and corners, with the questions that
  use it;
- **a shared stimulus**: a rectangle used by two or more questions. It is
  drawn faint, and for managers marked "above 3 questions". It is not a
  teacher's pick target;
- **a duplicate**: a question with no box of its own, because its only box is
  also another question's. Managers see it marked "cropped twice: delete one",
  which is the screen's crop-once hint (§2.2).

A box on a page past the bank's last page (`pdf.numPages`) is ignored, and a
question with no other box is not shown. The database cannot know a PDF's
page count, so it allows any page from 1; only a crafted call saves such a
box.

**Picking (everyone).**

- A teacher picks a question by clicking a box only that question uses, and
  unpicks it with a second click. A picked question's own boxes get a berry
  wash and a tick, on every page they are on.
- A manager's click selects the question instead (see below), and its
  toolbar has *Pick*. On a bank they cannot crop, a manager's click picks, as
  a teacher's does.
- A teacher's page ends with the line "A crop cut off? Tell your course
  in-charge which bank and page."

**Cropping (managers, on a bank `can_crop_file` allows).**

- **Saved questions** have a solid indigo outline and their topic. Click a box
  to select its question. Every box of the selected question is outlined, and
  one on another page shows as "continues on p. 13" (or "starts on p. 11").
  - The toolbar has a Topic select, *Add a box*, *Pick* and *Delete
    question*.
  - The selected box shows edge and corner handles. Drag an edge or corner to
    resize it, or drag inside it to move it. Moving or resizing a stimulus
    moves every copy.
  - Delete or Backspace removes the selected box from its question. A
    stimulus's Delete removes it from every question under it. A question
    whose last box goes is deleted.
- **Drafts** have a solid berry outline.
  - Drag on empty page to draw a new question. Drags smaller than 10 pt are
    ignored. New questions take the *Topic for new questions*.
  - *Add a box*, then a drag on this page or any other, adds a box at the end
    of the selected question. That is how a question continues onto the next
    page.
  - *Stimulus* on a draft makes it a stimulus: a box printed once above
    several questions. While it is selected, each question drawn gets it as
    box 1, and a saved question gets it with *Put the stimulus above*. A
    stimulus no question uses yet stays a draft, kept across pages, and is
    never saved alone.
  - A question holds four boxes at most (§2.2). On a question that already
    has four, *Add a box* and *Put the stimulus above* are disabled, with the
    line "Four boxes at most: crop the rest as another question."
- **Suggestions** (§5.1) have a dashed outline.
  - Click one to accept it as a draft. *Accept all (n)* accepts every
    suggestion on the page.
  - A suggestion that overlaps a saved box (IoU > 0.5) is never shown. This
    is the screen's other hint toward "crop once" (§2.2).
- Esc deselects.

PR 2 may settle these gestures differently. What each change saves is fixed
by the database, and is this:

| On the screen | In the call |
|---|---|
| A new question on page P | `_add` with one box on P |
| New questions under a stimulus S | each in `_add` with `[S, its own box]`, S's numbers the same in each; S may be on the page before |
| A stimulus put above saved questions | each in `_edit` with `[S with no id, {id} of each of its boxes]` |
| A question continued onto page P+1 | `_edit` with `[{id} of each box, the new box on P+1]` |
| A stimulus moved or resized | `_edit` for every question holding a copy, all with the same numbers |
| A question's topic changed | `_edit` with its `topic_id` (null for none) and `{id}` of each box |
| Reading order on the page saved | every question with a box on that page sends `{id, pos}` for those boxes, and no `topic_id` unless its topic changed too; copies of one stimulus get the same `pos` |
| A box deleted | `_remove` its id; for a stimulus, every copy's id. Each question closes the gap |
| A question deleted | `_remove` every box of it, on every page, and `_edit {id, boxes: []}`, so a box somebody added meanwhile refuses the save instead of surviving alone |

A question's boxes print in the order they were added, a stimulus first. A
box on an earlier page than box 1 is allowed.

**Saving.**

- The screen saves when the in-charge leaves a page (next, previous, the page
  select or the back link) and when they press *Save*.
- The save is one call to `save_crops` for the bank, one transaction, with
  every change since the last save, on any page: a box added on p. 13 to a
  question on p. 12 goes with it. The action then reads the whole bank back
  (§3.5), and the screen replaces its boxes with what was saved. The centre's
  banks hold 11–84 questions; a 2,100-question bank is 3 range requests per
  table.
- **If a save fails, nothing was written.** The drafts stay on screen, the
  page select marks the page "not saved", and a line on the page says why:
  - `42501` or `23505`: "Changed elsewhere, or you can't change it." Trying
    again cannot work, so the line offers *Reload page*, which shows what is
    saved and drops the unsaved changes. `23505` is also a save retried after
    it had committed, and the reload shows it saved;
  - `23514`, `23502` or `22P02`: the database's message, and the drafts stay.
    The screen should never send these;
  - a network failure: "Not saved. *Try again*." That is safe, because new
    questions carry the ids the screen made: a save that did commit is refused
    the second time rather than written twice;
  - `40P01`, a deadlock with another in-charge's save of this bank (§3.4):
    "Not saved. *Try again*." That is safe too, because the aborted save wrote
    nothing. The retry then saves, or is refused like any change made
    elsewhere.
- Leaving the screen with unsaved changes triggers the browser's leave
  warning. A crashed or evicted tab loses only what was not yet saved, at most
  the page in hand and any box drawn on it for another page.

**No AI for now** (§2.1 item 9). Scanned pages are drawn by hand, as §5.3
says.

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
  to draw a box."

**Server actions:** `app/actions/questions.ts` (`"use server"`).

- `savePage(courseId, fileId, { add, edit, remove })` calls `save_crops`,
  then `listBank(fileId)`. It returns the bank's rows, or the error with its
  SQLSTATE, and revalidates `/courses/${courseId}/questions`.
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

- reads the picked questions by id, under RLS, with their boxes, file names
  and folders, in the one select of §3.5;
- signs every bank those rows need with one `createSignedUrls(paths, 60)`
  call, after selecting the `files` rows under the caller's session, the same
  rule as `getViewUrl`;
- returns the rows, the URLs, and the ids it could not find.

The browser starts every bank's download as soon as the URLs arrive, skipping
banks already open in the tab. Picks that no longer exist (a deleted
question, one with no box left, or a bank in Trash) are dropped from the picks
with the line "2 picked questions are no longer available and were removed."
A pick with a box on a page past its bank's last page (`pdf.numPages`, known
once the bank is open) is dropped the same way, rather than failing the
worksheet (§4.3).

Then the modal renders every box of every pick once, to the 300 dpi JPEG that
will print (§6.3 steps 1–2), with `page.cleanup()` after the last box it draws
from each page (§4.5). It shows a pick's JPEGs, stacked and scaled by CSS, as
the pick's thumbnail, so what the teacher checks is the picture that prints.
*Download PDF* only places the held JPEGs on the template pages and saves.
Removing a pick drops its JPEGs.

**`components/questions/WorksheetModal.tsx`** is a `Modal` 560 px wide. It
contains:

- the picks in bank order: bank (by folder path, then name), then the
  questions' boxes compared one by one in `box_no` order, by page and then
  `pos`, then id. Questions under one stimulus share their first box, so
  they are ordered by their second;
- each pick with its picture, its source line and topic ("Fractions.pdf ·
  p. 4 · Fractions") and remove ×. The source line is what the worksheet
  prints under the question (§6.2): the bank's file name and the pages its
  boxes are on, in box order, as "p. 4", "pp. 4–5", or "pp. 4, 9" when they
  are not adjacent;
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
  is the only thing that reads a bank, for the page view and the worksheet
  modal alike (§6.3).
- `renderRegion(page, box, scale, canvas)` is the only caller of
  `page.render`. The page view and the modal both use it, with pdf.js's
  defaults: `intent: "display"` and the default `annotationMode`.
- The tab keeps up to 100 MB of banks open, each counted at its file size
  (the worker's copy). The least recently used bank is closed with
  `destroy()` first. The bank on screen, and every bank the worksheet modal
  needs while it is open, are never closed. A single bank over the budget
  still opens, and a worksheet from several big banks never loses one
  halfway, after its 60-second URL (§4.4) has expired. The budget applies
  again when the modal closes.
- Every caller that renders a page calls `page.cleanup()` when it is done
  with it: the page view when it leaves a page, and the modal after the last
  box it draws from each page. The modal draws boxes in bank and page order,
  not in the order they print, so each page is decoded once. Without it
  pdf.js keeps every decoded page
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
kind of page it is, text-layer proposals, ink extents and reading order
(`pos`). Compose does not need the kind of page, because
it draws every crop the same way (§6.3).

**`lib/worksheet/compose.ts`** builds the output PDF (§6) in two steps:
`drawBox` renders one box to its 300 dpi JPEG through `renderRegion` when the
modal opens (§4.4), and `save` stacks each question's JPEGs, with its source
line under them, on the template pages with `pdf-lib` (§6.2).

There is no `lib/worksheet/ai.ts` for now (§2.1 item 9). §5.2 describes it,
for if AI is built later.

### 4.6 Everything touched

**New files:**

- the two pages (§4.2, §4.3);
- `app/actions/questions.ts`;
- `components/questions/{QuestionsView,PageView,WorksheetModal}.tsx`;
- the three `lib/worksheet` files (`source`, `propose`, `compose`);
- `public/worksheet/template-lesson.pdf` and `template-homework.pdf` (§6.1);
- `scripts/copy-pdfjs-assets.mjs`;
- the migration and `supabase/tests/{shim.sql,questions.sql,run.sh}`
  (built, PR 1).

**Changed files:**

- `Rows.tsx`, `Browser.tsx`, `icons/index.tsx`;
- `lib/queries.ts`, which gains `getFile`, `listBank`, `listTopics` and
  `listQuestionSources`;
- `lib/types.ts` (built, PR 1);
- `proxy.ts`: its matcher must also skip `pdfjs/` and `worksheet/`. Otherwise
  every `.wasm`, `.bcmap`, `.pfb`, `.icc` and template request costs a
  Supabase `getUser()` round trip.
- `package.json`:
  - new dependencies: `pdfjs-dist` 6.4.299 and `pdf-lib` 1.17.1;
  - a `postinstall` that copies
    `node_modules/pdfjs-dist/{wasm,cmaps,standard_fonts,iccs}` into
    `public/pdfjs/`, so they always match the worker's version;
  - `pdfjs-dist` declares Node 22.13 or newer.
- `.gitignore` (`/public/pdfjs/`);
- `supabase/schema.sql`, `DEPLOYMENT.md` and `README.md` (built, PR 1).

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

**Not built for now** (§2.1 item 9). This is the design if AI is wanted
later. Nothing in PRs 1–3 depends on it, and until then §5.3 is what happens.

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
| Largest | $0.03–0.05 | $6–10 |
| Middle | $0.016–0.026 | $3–5 |
| Smallest | about $0.001 | about $0.20 |

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

This is how it ships, for now (§2.1 item 9). There is no *Suggest boxes*
button. Scanned pages show the same line as any page without proposals: "No
suggestions on this page. Drag to draw a box." Cropping never waits on AI.

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
- **Compose draws one line of text per question,** its source line, under
  its last box (§6.2): the bank's file name and the pages its boxes are on,
  such as "Fractions.pdf · pp. 4–5". It lets a teacher find the question in
  the bank's mark scheme. It comes from the `files` row and the boxes, so it
  needs no stored column, and nothing typed for the worksheet reaches a page.
  - pdf-lib's standard fonts encode WinAnsi only, so a file name with a
    character outside it would throw. PR 3 either replaces such characters or
    embeds a font with `fontkit`.
- **Tested** with `pdf-lib` 1.17.1: eight pages with the Homework template
  as background and 16 picture crops on top came out 594.96 × 841.92 pt, with
  the template's Inter Type 3 fonts carried through. Those were the
  worksheet's only fonts, and `pdftotext` on it printed only the template's
  words, "HOMEWORK" and "MathVision". That test predates the source line. PR
  3 repeats it, and it must then print the template's words and one source
  line per question, and nothing else.

### 6.2 Placing crops

- **Content area:** from 15 mm to 195 mm across, and from 26 mm below the top
  to 24 mm above the bottom, which makes it 247 mm tall. Questions are placed
  top-left.
- **A question is its boxes stacked,** in `box_no` order, one under another,
  left-aligned and at one scale, with no gap: a proposed box already carries
  4 pt of margin round its ink (§5.1 rule 7). Its source
  line (§6.1) follows 2 mm under the last box, at 8 pt in the template's
  label grey, `#B4B8C5`, and is never scaled.
- **One question:** scale = min(1.25, 180 mm ÷ its widest box, 0.55 × 247 mm
  ÷ its stacked height), where the stacked height is the sum of its boxes'
  heights. The rest of the page is blank for working.
- **Two short questions share a page:**
  - a question is *short* if its printed height at that scale, boxes and
    source line together, is 74 mm or less;
  - two short questions in a row share a page, and the second starts at the
    content area's vertical midpoint;
  - any other question gets a page of its own.
  - Picks keep bank order (§2.2).
- **Not settled: a question over several pages.** The rule above suits the
  common case, a stimulus over a one-box question. A past paper's question
  over four full pages would print at about a seventh of its size, so PR 3
  decides how such a question flows (for example one page per box) and
  prints one before relying on it.
- **Rotation.** Crop sizes here are the displayed size, after the source
  page's `/Rotate`. pdf.js renders the page as displayed, so the picture is
  already upright and is drawn with no rotation. Tested on a `/Rotate 90`
  page: the picture came out in the shape the page view shows.

### 6.3 Every crop is a picture of its box

Every crop, from every bank, digital or scanned, is drawn the same way
(§2.1 item 11), once, when the worksheet modal opens (§4.4):

1. **pdf.js renders each box alone,** at 300 dpi of the size it is printed on
   the worksheet: §6.2's scale × 300 ÷ 72. The box's corners come from the
   stored PDF-space box through `convertToViewportPoint`. The viewport's
   `offsetX` and `offsetY` put the box's top-left corner at the canvas
   origin, and the canvas is the box's size at that scale.
2. **The canvas is encoded as JPEG** at quality 0.9 (`canvas.toBlob`). The
   modal holds it, and *Download PDF* embeds it with `embedJpg`, which copies
   the bytes unchanged.
3. **One canvas serves every box,** and is set to 0 × 0 once the last box is
   drawn, because Safari is slow to free canvas memory.

What this keeps out, and what it keeps:

- Only the boxes' pixels reach the worksheet. No text, font, layer or image
  of the source page goes with them, so nothing hidden can be extracted from
  a crop. In testing, before the source line, `pdftotext` on a worksheet
  printed only the template's words; with it, it must print those and the
  source lines, and nothing else (§6.1).
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
  300 pages at 7 a page is 25,200. With 16% of questions holding a second
  box, the reads measured in §3.5 take a teacher 46–50 ms for the Questions
  page at that size, and 5–7 ms for each 1,000-row range of one bank's boxes;
  a 2,100-question bank takes 3 ranges. Those are floors, repeated on
  Supabase before anyone relies on them.
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
- **Rows:** RLS, column grants and the composite foreign key (§3). The app
  writes only through `save_crops`, which runs as the caller. The grants also
  let whoever may crop a bank write its rows directly, so the readers do not
  rely on what `save_crops` keeps (§3.2). No new role check is written in
  TypeScript; there are three already. The capability flags only hide links.
- **AI:** none for now (§2.1 item 9), so no page image leaves the browser. If
  the route of §5.2 is built later, it is behind the login redirect, checks
  the session and `can_crop_file` itself, keeps its key server-only, caps the
  body and stores nothing.
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
| Two in-charges crop the same page at once | Duplicates are possible; delete one (§2.2). If both change which boxes one question has, the second save waits for the first and is then refused whole, and *Reload page* shows what is saved. A topic, corners or `pos` that both send is last-writer-wins; a topic only one of them changed is kept. Saves that overlap on two questions can deadlock instead: one fails with `40P01`, having written nothing, and the screen offers *Try again* (§3.4, §4.3). |
| A save fails | Nothing is written. The drafts stay on screen, with *Try again* or *Reload page* (§4.3). |
| A save's reply is lost and it is tried again | The new questions' ids are already used, so the retry is refused and nothing is written twice (§3.4). |
| The tab crashes or is evicted | Only what was not yet saved is lost: at most the page in hand. |
| A bank students can see | It cannot be cropped. Once cropped, its crops are locked until it is teacher-only again, and the Questions page marks it. |
| A worksheet over 25 MB | It downloads, with a warning (§4.4). |
| A bank is purged | Its crops go with it, and the purge is unaffected (§3.3). |
| A picked question's bank went to Trash, or the crop was deleted | The modal drops it from the picks and says how many were removed. |
| A bank's bytes are replaced in Storage under the same name | Every crop points at different content. §9.4 item 4. |
| A box saved on a page past the bank's end (only by a crafted call) | The page view ignores it, and the modal drops its pick as removed (§4.3, §4.4). |

## 9. Tests, rollout, out of scope

### 9.1 Checks this repo can run

There is no CI and no JS test runner. Each PR pastes the output of these
commands.

**Static checks:**

- `npm run lint`;
- `npx tsc --noEmit`;
- `npm run build`, with dummy `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.

**SQL tests: `PGHOST=localhost PGUSER=postgres bash supabase/tests/run.sh`.**
It needs `psql` and a local Postgres 16. It:

1. creates a uniquely named scratch database;
2. applies `supabase/tests/shim.sql` (§3.6);
3. applies every migration in order, and `20261017000009_questions.sql` a
   second time;
4. runs `supabase/tests/questions.sql`, which stops at the first failed
   `assert`, so the script exits non-zero. Asserts are forced on
   (`plpgsql.check_asserts=on`), whatever the caller or the server set;
5. drops the database, however the run ended.

**What it asserts,** section by section. After every successful save, it
also checks that no question is left without a box and that every question's
boxes run 1..n.

1. **A multi-box save:** one question with one box, and two questions sharing
   a stimulus, copied as box 1 of each. `created_by` comes from its default
   and the topic is stored.
2. **Who sees what:** the counts of questions, boxes, banks in
   `question_sources` and topics, per role (§3.6), and each role's
   `question_course_ids()`. Anon is refused all four relations, and has no
   execute grant on any of the four functions.
3. **A question continued onto page 2:** its box 1, listed by id alone, keeps
   its corners, and its bank then reads 3 questions on 2 pages.
4. **Allowed:** a box on an earlier page than box 1; an edit that sends no
   `topic_id`, which keeps the topic; a stimulus put in front of a saved
   question, which renumbers its boxes; a kept box moved, sent with its own
   page; the topic cleared by a null; an admin cropping in a course they are
   not a member of.
5. **A shared stimulus:** moved in both copies, which stay equal, also
   through text; deleted from one question; deleted from both.
6. **Deleting:** a question over two pages, and a question whose last box is
   removed. Both go outright.
7. **27 refused saves**, each refused for its stated reason and each followed
   by a check that every row of both tables is unchanged. Among them: a fifth
   box, on a saved or a new question; a question with no box; the same box
   twice; an edit that leaves out, borrows or repeats a box, or keeps one it
   removes; one question edited twice; edits and removals in another bank of
   this course or another course; a removal listed twice or not there;
   another course's topic, new or saved; inverted, NaN, page-0 and pageless
   boxes; a kept box turned inside out, or sent with another page; a new box
   with no `pos`.
8. **Refused by who is asking:** `can_crop_file` per role and on the
   student-visible `open.pdf`, even for an admin; saves by a teacher, a
   student and another course's in-charge; direct inserts, updates and
   deletes by them (refused, or 0 rows); the column grants (a box changing
   question, file or page, a question changing file, a forged or rewritten
   `created_by`); the composite foreign key; a NaN box inserted directly.
9. **The bank made visible to students:** teachers still read its boxes and
   `question_sources` says so; students still read none; nobody can add,
   change or delete them.
10. **Trash and restore,** through the real `soft_delete_file` and
    `restore_batch`: hidden from everyone, admin included; `can_crop_file`
    false for every role; every write refused; all back after restore.
11. **Hard deletes:** of the file, its folder or the course cascade to
    questions and boxes; a deleted topic leaves its questions with none.
12. **`question_sources`** (questions, pages and `first_page`) agrees with the
    tables for every role.
13. **A box's policy is its question's:** every role sees exactly the boxes of
    the questions it sees, normally, with the bank in Trash, and with it
    visible to students.
14. **A save retried after its reply was lost** is refused and writes nothing;
    a new question with no id is refused.
15. **The catalogue:** the exact table and column grants anon and
    authenticated hold on the four relations, so a wider grant fails even
    where a missing policy would still block it; no policy on the three
    tables, and none of
    `can_crop_file`, `topic_fits` or `save_crops`, calls `auth.uid()` outside
    `(select auth.uid())`; `questions_select` and `question_boxes_select` are
    the same text, apart from the table name.

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
2. **PR 1, database. Built:**
   - the migration, in the multi-box shape step 1 chose (§2.2, §3.4);
   - `supabase/tests/{shim.sql,questions.sql,run.sh}`, `schema.sql`, the
     types and the docs;
   - **apply it to Supabase** by pasting the file into the SQL editor,
     *before* anything that reads it merges. Vercel deploys the app only,
     never the database. Not `supabase db push`, unless `supabase migration
     list` shows every earlier migration applied on the remote: on a project
     set up by pasting, a push replays them all, and `20260612000006` then
     approves every pending signup. `DEPLOYMENT.md` §2 says how to repair the
     history first.
3. **PR 2, the page view:** cropping by hand, text-layer suggestions,
   saving with `save_crops` and picking, plus the `proxy.ts` matcher and the
   pdf.js assets.
   - The unmerged branch `claude/awesome-bell-udvk0q` also edits `proxy.ts`.
     Whichever lands second merges the other first.
4. **PR 3, the Questions page and the worksheet:** the picks, the modal,
   compose and the two template PDFs.
5. **AI: not for now** (§2.1 item 9). If it is wanted later, only for a
   scanned bank that is going to be cropped. None of the centre's own banks
   has a scanned question page (§9.2.1). If the textbook banks are not scans
   either, this step and PR 4 are not needed:
   - run the measurement in §5.2;
   - if a pair reached 98%, set `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and,
     if measured, `ANTHROPIC_EFFORT` in Vercel, for Production and Preview,
     then redeploy;
   - PR 4 adds the route and the button. If no pair reached 98%, there is no
     PR 4.
6. **An admin** creates the bank-holding courses (§2.1 item 10):
   - adds that year's teachers of the level as teacher, and the people who
     crop as in_charge;
   - runs the topic snippet (`DEPLOYMENT.md` step 8) for it with the owner's
     list;
   - uploads the banks into teacher-only folders there (the crop screen
     refuses any other). A bank already in a class's course is uploaded again,
     because the app cannot move a file between courses (§3.2).

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
5. **An admin's reads of files are slow on a big project.** `files_select`
   (`20260611000004_rls.sql`) calls `is_admin()` bare and `course_role()` up
   to three times per row, so an admin's read of one bank's boxes took
   60–80 ms per range at 10,000 files, against a teacher's 5–7 ms (§3.5).
   Rewriting that one policy as `(select public.is_admin()) or case
   public.course_role(course_id) …` is its own change, with its own tests.
6. **`files` keeps its table-wide UPDATE grant,** and so does `folders`. No
   migration narrows Supabase's default grant, `files_update`
   (`20260611000004_rls.sql:89-92`) checks only that the caller is in_charge
   of the new `course_id`, and `trg_file_eff` fires only on `update of
   teacher_only, folder_id`. So an in_charge can set `eff_teacher_only =
   false` on a file in a teacher-only folder: students see it until the
   folder is next recomputed, and its crops lock, because `can_crop_file`
   reads that column. Someone in_charge of two courses, or an admin, can
   change a cropped bank's `course_id`, and its questions go to the other
   course's teachers (§3.2). Neither lets a role do more than it could
   already: an in_charge may clear `teacher_only` anyway. The fix is a
   migration with its own tests: `revoke update on public.files from anon,
   authenticated; grant update (name, folder_id, teacher_only, deleted_at,
   deleted_by, delete_batch_id) on public.files to authenticated;`, the
   columns `app/actions/files.ts`, `soft_delete_file` and `restore_batch`
   write. The triggers and `recompute_subtree` still set `eff_teacher_only`,
   because column privileges check only the statement's SET list. Then the
   same for `folders`.

---

*Evidence.* The research, the RLS probe and the compose tests ran on
2026-10-17. What they ran on is kept in `docs/worksheets/`, as files that
nothing applies or serves:

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

The one-box drafts that used to sit here (`questions.migration.sql`,
`questions.test.sql`, `shim.sql` and `run.sh`) were removed in PR 1, which
superseded them: the shim is now `supabase/tests/shim.sql`, unchanged, and
the migration, its tests and their runner were redrawn for several boxes as
`supabase/migrations/20261017000009_questions.sql`,
`supabase/tests/questions.sql` and `supabase/tests/run.sh`. The drafts are in
the history at 9cbe177. PR 3 moves `template-{lesson,homework}.pdf` to `public/worksheet/` (§6.1, §9.2
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
