# Worksheet maker

Plan, 2026-10-17, revised the same day after review, again after the owner
answered its five open questions (§2.1, items 10–14), and again after a review
of that revision. On 2026-10-17 and 18 the owner settled how the tool is used
(§2.1, items 15–20) and asked for it to be built small, *"Yes build it in the
small way u suggested"*: a bank is cropped the first time a teacher needs it,
whole booklets stay the everyday homework, there is no AI step for now, and
each question on a worksheet carries a source line. Each crop's picture is
made when a worksheet is drawn (§6.3). The database, PR 1, is built (§3), and
so are the page view, PR 2 (§4.3), and the Questions page and the worksheet,
PR 3 (§4.2, §4.4, §6), each with its "as built" notes. The suggestions are
finder v2.2, measured on 219 of the centre's PDFs across five subjects (§5.1,
§9.2.1), and the crop screen offers every kind of box it makes (§4.3). What is
left is the owner's (§9.2). The reviews' findings, and the few this plan does
not take, are listed at the end.

## 1. What it is and who uses it

The owner, on the banks: *"for question banks they are usually in pdf format
and usually many questions per page"*. Some pages are digital, with text you
can select. Others are scanned. Many banks mix the two.

The worksheet maker turns those banks into worksheets a teacher can drop into
a child's Pencil Space. It works in four steps:

1. **Crop once.** An in-charge (or an admin) opens a bank PDF and draws a box
   around each question. A question is saved with its source file, up to four
   boxes on any of its pages, and an optional topic. Nobody crops the same
   question twice. A bank is cropped the first time a teacher needs
   questions from it, not ahead of time, and a finished paper is never
   cropped (§2.1 item 15).
2. **Suggestions.** The tool proposes boxes. On digital pages it reads
   question numbers ("1.", "Q2") from the PDF's text, and finds where a
   question runs on to the next page and what is printed once above several
   questions. Scanned pages are drawn by hand for now (§2.1 item 9). A person
   confirms every box. Nothing unconfirmed is saved.
3. **Pick and print.** A teacher opens a bank page by page, clicks the
   questions they want, and downloads a branded A4 PDF. Each question sits at
   the top of its own page, and the rest of the page is blank for working.
   Short questions go two to a page. Every question is a 300 dpi picture of
   its own box, so nothing else on the bank's page goes with it.
4. **Into Pencil.** The teacher drags the PDF into the child's Space and
   chooses "one page per board".

**Most days nothing is cropped.** Teachers mostly give a child a whole booklet
and mark the questions to do (§2.1 item 15). That needs only the Download
button teachers now have (§2.1 item 8):

- once a unit, in its first lesson, the teacher downloads the unit's booklet
  and imports it into the child's Pencil Space with one page per board, so
  page 12 of the booklet is board 12;
- in each lesson they teach on the page boards, circle the questions to do,
  say "page 12, Q3–9", and write the same in the report's Homework line,
  which is the record of what was set;
- the child does them on those boards, writing beside the page where it
  leaves no room (§9.2 step 7 checks this on an iPad);
- the next lesson the teacher marks on the boards, with the mark scheme open
  in the portal.

A finished paper goes the same way, whole and never cropped: basic tests,
Test Your Basics, mocks, summatives, semester papers, skip tests and speed
math. The Drive's IM2, IM3, Algebra 2 Trig and Geometry/IM2 folders hold
663–674 of them (the inventory's total and its per-course counts disagree,
§9.2.1), nearly all with their own mark scheme, in numbered series that
already serve as variations. The worksheet maker is for the
rest: a sheet of chosen or mixed questions, and a packed bank whose pages
leave no room for working.

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
   scanned pages. A person always confirms them. (Item 18 replaces the AI
   half: there is no AI step for now, and scanned pages are drawn by hand.)
5. The output is a branded A4 PDF (§6), with one question at the top of each
   page, or two per page for short ones. (This item also said "vector stays
   vector". Item 11 replaces that: every crop is a picture.)
6. Delivery is by hand. Pencil has no boards API, so the teacher drags the PDF
   in with "one page per board".
7. Plan first. Nothing is built yet. *Since:* PRs 1–3 were built once the
   owner had settled how the tool is used (items 15–20).
8. **Teachers download worksheets.** Goal (3) has the teacher get the PDF.
   What follows from it:
   - *Changed later on 2026-10-17:* *"Okay give the teachers download
     access."* Pencil cannot be sent a file, so a PDF reaches a child's Space
     only from somebody's own computer, and teachers today give whole
     booklets or mark questions in them. `getViewUrl` now gives a course's
     teachers the Download button that a76d16e had kept for admins and
     in-charges, on every file they can open, teacher-only folders and mark
     schemes included (d71febe, merged). Students still only view. So a
     worksheet no longer relaxes anything for the teacher.
   - *Settled after that:* a booklet, a finished paper or a worksheet goes
     into the child's Pencil Space with one page per board. *"Yes sure one
     page per board is good."* Page 12 of a booklet is then board 12, and the
     child's working for it stays beside it. A per-file "Ready to send" flag,
     proposed for this before teachers could download, is not needed.
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
     settings. Scanned pages are drawn by hand (§5.3, item 18). The first ten
     banks had no scanned question page, but the later samples do: two IM3
     U1 sets, the primary drill books, an AMO contest booklet and 27 image
     pages of the AP Statistics textbook bank (§9.2.1). §5.2 stays as the
     design if AI is wanted later.

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
    for each set of banks that courses share, rather than one per level: one
    for IM3 with Algebra 2 Trig, *"Yeah IM3 and algebra 2 trig share one
    qb"*, and one for IM2 with Geometry/IM2, *"Yes im2 shares a bank with
    geometry"*. Their booklets are the same files (IM3 U4 and Algebra 2 Trig
    U5 WORKSHEET A differ only in the cover, §9.2.1), so each is uploaded
    and cropped once. That is course setup, and changes nothing in the schema
    (item 17).
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

    Item 16 later settled the files whose answers are printed inside them:
    they are cropped, and sent, from a clean copy.
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

On 2026-10-17 and 18 the owner also settled how the tool is used. The code
follows each of these.

15. **Most work is whole booklets; the crop tool is for the rest.** *"Rn
    teachers either give full Booklets to kids or mark particular
    questions."* Asked what the work would be with no cropping at all (§1,
    "Most days nothing is cropped"), and whether a child has room to solve
    on a booklet's page, the owner kept the crop tool: *"Yeah bring cropping
    back. Unless there's real downsides to it"*. The downsides weighed were
    the in-charge's time (an estimated 6–17 minutes a booklet), a worksheet
    taking a teacher minutes where marking a booklet takes seconds, and a
    worksheet having no answer key of its own (§9.2.1). So, in the small way
    the owner then asked for, *"Yes build it in the small way u suggested"*:
    - the crop tool is for a sheet of chosen or mixed questions, and for
      packed banks that leave no room for working (Biology Book B, the AP
      Calculus problem sets, the IB Economics essay lists);
    - finished papers are sent whole and never cropped: basic tests, Test
      Your Basics, mocks, summatives, semester papers, skip tests and speed
      math. Cropping drops their header, marks and timing;
    - cropping is on demand: an in-charge crops a booklet the first time a
      teacher needs questions from it, not every bank ahead of time, and its
      crops carry over to next year (item 10);
    - delivery is as item 8 has it: the teacher downloads, then imports into
      the child's Pencil Space with one page per board (§7).
16. **A file with answers in it gets a clean copy first.** *"For banks with
    answers make clean copies first."* Before anything from such a file is
    sent or cropped, an in-charge removes its answer pages and uploads the
    result beside the original, for example as "… (student).pdf"; the answered
    original stays in the teacher-only folder for marking. That covers a bank
    whose answers are bound in behind its questions and a summative that
    prints its answers at the end (IM2 U4 SUMMATIVE 1). In the samples, most
    economics and maths Word-book files, and half the biology ones, carry
    their answers inside (§9.2.1). The finder proposes nothing on an answers
    page, and an answer-key file, every page answers, proposes nothing at all
    (§5.1). The crop screen says so on such a file (§4.3): "This file has
    answers on pp. 45–64. Upload a clean copy without the answer pages and
    crop that.", or for an answer key "This file looks like an answer key.
    Upload a clean copy without the answers and crop that." Boxes can still be
    drawn by hand on either.
17. **Shared banks have one bank-holding course each:** IM2 with
    Geometry/IM2, and IM3 with Algebra 2 Trig (item 10). *"Yes all teachers
    work the same way"*: Biology, Chemistry and Economics teachers give whole
    booklets and mark questions too, so nothing here is maths-only, and each
    subject's banks sit in bank-holding courses the same way.
18. **No AI for now** (item 9): scanned pages are drawn by hand (§5.3). §5.2
    stays as the design for later and is marked not built.
19. **Word files are not read.** Banks are uploaded as PDFs exported from
    Word itself, and the portal stays PDF-only: the uploader skips a `.docx`
    (`lib/upload/tree.ts`, `isPdf`). A `.docx` gives an exact question count
    but no geometry, and converting one in the app was measured to lose
    every equation (§9.2.1).
20. **Each question on a worksheet has a small source line under it** (§6.1),
    such as "U4 BOOKLET WORKSHEET 1 (L1-8) · p. 12". A worksheet has no
    answer key of its own, so the line is how a teacher finds the question in
    its bank's mark scheme. Built in PR 3.

### 2.2 Defaults this plan takes (say if any is wrong)

- **Worksheets are not saved.** A teacher's picks are kept in the browser
  tab's `sessionStorage`, per course, as question ids. They survive a reload
  and a visit to the Viewer, and go when the tab closes. The downloaded PDF is
  the record. A sheet worth giving again needs no build: the teacher keeps
  the PDF, and an in-charge can upload a good one into the unit's folder,
  where it is one more finished paper. If saved worksheets are wanted later,
  use `worksheets` and `worksheet_items(question_id … on delete set null)`.
  That design was prototyped and tested, but it waits until the same custom
  sheet is seen going to several children (§9.3).
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

  The later samples need more boxes, not more than four (§9.2.1): 30% of the
  biology questions checked need a second box, and in the IM3 and Algebra 2
  Trig booklets and a Geometry mock 24–31% of questions run over a page (16
  and 17 of 67, 5 of 16), against 3% on the first ten banks. The limit
  is reached by the biology DBQ booklets (5 of 3742's 8 questions need
  exactly four) and passed once, by a chemistry FRQ over five pages, which
  is cropped as two questions.
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

The five this plan asked were answered on 2026-10-17, and are §2.1, items
10–14; the ones the bank measurements raised were answered on 2026-10-17 and
18, and are items 15–20. Three are open. PR 3's review left two, each built
one way and put to the owner when PR 3 was reported, with no answer yet:

- **The 0.55 working-space cap** (§6.2). The settlement said both that no
  box is shrunk to fit a page height and that a question that fits keeps the
  working-space rule, the 0.55 × 247 mm cap. Applied as a shrink, the cap
  printed a box from a digital bank that just fits a page at 0.60 (0.57 of
  its width's scale, 11 pt text at 6.6 pt), and the same box 20 pt taller,
  which no longer fits with its source line at its width's scale, at 1.04
  on a page of its own. PR 3
  reads the cap as the line below which a question leaves room for working,
  never as a shrink, so no question is printed smaller to make that room.
  Restoring it is one line in `scaleOf`.
- **Which page number the source line gives** (§6.1). It is the PDF's own page,
  as the page view and the Viewer count them. A booklet that numbers its pages
  from its first content page prints a different number at the foot: in "U4
  BOOKLET WORKSHEET 1 (L1-8)", PDF pages 11–14 print 10–13, and the file has
  no page labels to say so. A teacher working from the printed booklet or a
  mark scheme keyed to printed pages lands one page off.

The bank measurements left one, not yet put to the owner:

- **Children's work in the bank folders.** Some uploads are a child's
  finished work, not a bank: 7 of the 18 chemistry scans (some with a
  child's name on the page), a phone scan of a child's business homework,
  and maths Drive papers with handwritten answers that may be a pupil's
  (IM2 REFERENCE "SECTION A–D", a Geometry skip test in VERY ARCHIVE)
  (§9.2.1). A crop from one would put a child's answers, and sometimes a
  name, on another child's worksheet, and a clean copy (item 16) does not
  cover it. Until the owner says, they are left out of the upload (§9.2
  step 5).

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
  whose migration history is complete (§9.2 step 1); and step 8, the topic
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

**As built (PR 3).**

- **`preparePicks` makes two flat reads, not the one select above.** The
  picked questions with their `files` row embedded (`files!inner`, filtered to
  the course, so a pick of another course comes back missing), and their
  boxes, `.in("question_id", ids)`, in a read of their own, made into
  questions by the page view's own reader (`bankOf` in
  `lib/worksheet/crops.ts`). A project's max rows caps an embedded list too:
  the browser harness, run with PostgREST's `db-max-rows = 3`, printed a
  four-box question with three boxes and said nothing. Both reads go a range
  at a time through `readAllRows`, like `listFileQuestions`, so a project's
  max rows never passes for picks that are gone. A worksheet takes 200 picks
  at most, which keeps the reads' request line short; a call with more is
  refused with that number.
- **`listQuestionSources`** reads the view a range at a time too, by file id,
  for the same reason; it has no limit of its own.
- **The topic filter** (§4.2) counts the chosen topic's questions per bank:
  `questions` with that `topic_id`, `.in("file_id", the course's cropped
  banks)`, a range at a time (`countTopicQuestions`).

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
- These are floors from a shared 4-core machine. §9.2 step 8 repeats them on
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

**As built (PR 2).** *Crop questions* is in the file menu, after *Open*, and
opens the page view. The header's *Questions* link is not there yet: it comes
with the Questions page in PR 3, so `CropIcon` has one use for now.

**As built (PR 3).** The course header has *Questions*, with `CropIcon`, for
anyone who can see teacher-only material, and *People* and *Trash* after it
for managers only.

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

**As built (PR 3).** `app/(app)/courses/[courseId]/questions/page.tsx` reads
`listQuestionSources`, `listAllFolders` and `listTopics`, and renders
`components/questions/QuestionsView.tsx`. Where it differs from the text
above, or adds to it:

- **Topic filter.** A select whose first row is *Any topic*, hidden while the
  course has no topics or nothing is cropped. A topic is `?topic=` on the
  page, so the server reads the counts (§3.5) and only one of the course's own
  topics filters. Rows narrow to banks with a question of that topic, and the
  count line reads "2 Fractions questions · 19 in all". With a topic, a row
  opens the page view at `?topic=`, which sets its Topic select and so opens
  at the first page with that topic; without one, at `?page=` the bank's first
  page with questions. A topic no bank has reads "No question in this course
  has this topic".
- **Rows** are links, labelled by `bankPath` (`lib/worksheet/layout.ts`), the
  same label the worksheet's bank order sorts by. The warning line is red, and
  for managers it goes on "Make it teacher-only to change its crops."
- **The picks bar** is `components/questions/PicksBar.tsx`, the same as the
  page view's: "{n} picked · *Make worksheet* · ×".

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
- **Picks bar** at the bottom, copied from `Browser.tsx`'s selection action
  bar: "{n} picked · *Make worksheet* · ×".

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
- **Suggestions** (§5.1) have a dashed outline. A box that is not a
  question carries a tag saying what it is for: "continues Q7", "above
  Q5–7".
  - Click one to accept it as a draft. What it becomes depends on its kind:
    - a **question** becomes a new question, under any accepted stem or
      context that names it;
    - a **continuation** (a question running on from the page before, or
      from the column before) becomes a box of the question it continues,
      saved or accepted earlier, in the bank's order: a box 3 accepted
      before box 2 still prints third. If that question is not cropped
      yet, or has four boxes already, the toolbar says so and offers
      *Accept as a question* or *Skip*;
    - a **stem** (an instruction or stimulus printed once for questions
      N–M) or a **context** (a "Model 2" passage) becomes a stimulus: box 1
      of each of its questions on screen, copied into each, and of the rest
      as they are accepted, on whatever page. A question with four boxes
      already is left as it is, and the toolbar says so.
  - An amber "?" marks one to check, with its reasons on hover: "continues
    the question above it", "an image spans this box and the next", "holds
    a numbered list that is not proposed", "overlaps another question's
    box", "holds only its number". A click on it asks first, in the
    toolbar, with its reasons, *Accept* and *Skip*. Every continuation has
    one.
  - *Accept all (n)* accepts only the suggestions without "?". Each "?" one
    needs its own click, so the doubtful boxes are the ones a person looks
    at.
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
  (§3.5), and the screen replaces its boxes with what was saved. The sample
  banks hold 11–244 questions (the first ten 11–84, §8.1; the AP Statistics
  textbook bank 244, §9.2.1); a 2,100-question bank is 3 range requests per
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
  10 MB it reads "Downloading bank.pdf · 48 MB…" instead. Sizes here and in
  the worksheet modal are counted as the app's `formatBytes` shows them, in
  units of 1,024 × 1,024 bytes, so 10 MB is 10,485,760 bytes.
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
  to draw a box." That includes a scanned page (§5.3). A blank page reads
  "This page is blank: there is nothing on it to crop.", a page the PDF
  reader could not draw "The PDF reader could not draw this page, so nothing
  is suggested on it. Drag to draw a box.", and an answers page "This page is
  answers: nothing is suggested on it. Drag to draw a box."
- **A file with answers in it** (managers, §2.1 item 16): a strip under the
  toolbar, "This file has answers on pp. 45–64. Upload a clean copy without
  the answer pages and crop that." An answer key's reads "This file looks
  like an answer key. Upload a clean copy without the answers and crop
  that.", and its toolbar "Nothing is suggested on an answer key. Drag to
  draw a box." Boxes can still be drawn by hand on either.

**Server actions:** `app/actions/questions.ts` (`"use server"`).

- `savePage(courseId, fileId, { add, edit, remove })` calls `save_crops`,
  then `listBank(fileId)`. It returns the bank's rows, or the error with its
  SQLSTATE, and revalidates `/courses/${courseId}/questions`.
- `preparePicks(courseId, ids)` is for the modal (§4.4).
- Both use `createClient()`, so RLS decides who may do this, and neither adds
  a role check in TypeScript.

**As built (PR 2).** `components/questions/PageView.tsx` holds the screen and
`Stage.tsx` the overlay and its gestures; `lib/worksheet/crops.ts` holds the
screen's state, its edits and the one `save_crops` call they make. Where it
differs from the text above:

- **Route.** The bank's read is `listFileQuestions` (the plan's `listBank`).
  The route also passes the signed-in person's id, which the picks are kept
  under (§4.4).
- **Header.** The back link goes to the bank's folder in the course and
  carries the course's name, since the Questions page comes in PR 3. *Topic
  for new questions* sits in the toolbar row under the header, labelled "New
  questions", beside a chip naming the kind of page (§5.1) and *Accept all
  (n)*; *Save* stays in the header. The picks bar is "{n} picked · ×", and
  gains *Make worksheet* in PR 3.
- **The toolbar of a question** also has *Remove box* on a question with
  several boxes, and each "continues on p. 13" or "starts on p. 11" is a
  button to that page. The arrow keys nudge the selected box 1 pt, 10 with
  Shift.
- **Pick** is offered only on a saved question: a draft has no row a
  worksheet could read, so its pick could never resolve.
- **Stimulus** is offered only on a draft, a new question's one box. On a
  saved question it would have deleted the question at the next save,
  leaving its box as an unsaved stimulus. *Done* lets go of the stimulus in
  hand.
- **A box cropped twice** is a rectangle shared like a stimulus, but it is
  not one: selecting it reads "Cropped twice · This box is saved as 2
  questions." with *Delete one*, and it is never put in hand, so the next box
  drawn is a question of its own and not a third copy under it.
- **Delete** of a question's own box, under a stimulus other questions share,
  deletes the question: what it had left is only their stimulus, which would
  otherwise be saved as a question of its own.
- **Saving** also happens, as a last try, when the page view is left another
  way, such as the browser's Back. A refused save is shown by kind:
  - `42501` and `23505`: as above, with *Reload page*;
  - `save_crops`'s own `23514` messages ("A saved box keeps its page: …", "A
    question needs at least one box.") as written; any other code of class
    22 or 23 as "The database refused a value on this page (22003).", since
    Postgres's own messages name tables and constraints. The message goes to
    the server's log. Trying again cannot pass, so there is no *Try again*;
  - anything else, `40P01` and a failed request included: "Not saved. *Try
    again*."
- **The back link** saves first and stays on a save that fails, with why. When
  the failure is one only *Reload page* clears (changed elsewhere, the bank
  gone to Trash, signed out), the next click asks "Leave without saving?" and
  leaves on OK.
- **States.** The error card has *Try again*, which opens the bank afresh,
  except for a PDF that needs a password or is not a PDF. A bank whose
  `/pdfjs/` files are missing, stale or unreachable is refused with "This
  site's PDF reader is incomplete…" (§8.3). A page with an image that did not
  decode gets the line "Part of p. 3 didn't draw: …" and *Try again* (§8.3).
  Suggestions read "Finding suggestions: page 3 of 40…" while the bank is
  read for them (§5.1), and "Suggestions failed on this bank. Drag to draw a
  box." if they fail. A teacher on a bank with nothing cropped sees "Nothing
  is cropped in this bank", and the bank is not downloaded.
- **`savePage(fileId, changes)`** takes no course: it calls `save_crops`,
  reads the bank back, and revalidates `/courses/[courseId]/questions/[fileId]`
  by its route pattern, never a path the caller names. An empty change set is
  only the read-back, with no `save_crops` call and no revalidation. It
  refuses a caller who is not signed in and changes that are not the shape
  above, before anything reaches the database. `preparePicks` comes in PR 3.

**As built (PR 3).**

- **The back link** goes to Questions and reads "Questions", now there is a
  Questions page, with the page view's topic as `?topic=`, so the next bank
  is found by the same topic. A save also revalidates
  `/courses/[courseId]/questions` by its route pattern, so the counts there
  are fresh.
- **`?topic=`** opens the page view on one of the course's topics (from the
  Questions page's filter). The page and the topic are both kept in the URL
  across a reload.
- **The picks bar** gains *Make worksheet* (§4.4). In crop mode it saves the
  bank first, since what prints is what is saved. While the modal is open the
  page view takes no keys, so Delete inside the modal cannot delete a box
  behind it; the Esc that closes the modal stops there, so it does not also
  let go of the in-charge's selection.

**As built (every kind of suggestion).** The page view offers all four kinds
finder v2.2 makes (§5.1), as the list above says. Where the build settles
what the text leaves open:

- **The whole bank's suggestions.** `suggestionsFor(doc)` gives every page's
  at once, since a continuation, stem or context names questions on other
  pages, by page and printed number.
- **Finding the question a box names** is `lib/worksheet/crops.ts`, pure and
  tested (§9.1): `namedQuestion` is the question suggested on that page with
  that number, and `questionAt` the question on screen, saved or a draft,
  with a box over it (IoU over 0.5, as for hiding a suggestion). A page can
  number two sections alike (hl-book-b numbers up to four on a page): a
  continuation then names the last of them, the question left open at the
  page's foot, and a stem the first not above it in its column. A question
  whose box has been redrawn past that overlap reads as not cropped yet.
- **`acceptOffers`** makes the drafts, for one click and for *Accept all*
  alike. Stems and contexts go first, so the questions accepted with them go
  under them. A question goes under every accepted stem or context that
  names it (`stimuliOver`), on any page; one that none names goes under the
  stimulus in hand, as a drawn box does. Four boxes stay the limit: a
  question with no room is left as it is, and a continuation whose question
  is not on screen is not taken.
- **An accepted stem or context is not put in hand,** and nothing is
  selected after it: in hand, it would take every question drawn or
  accepted next, named by it or not. The toolbar says what it did: "The
  stimulus is above 2 questions. 4 more go under it when accepted." A click
  on it later puts it in hand, as with any stimulus.
- **What asks first:** a suggestion with a "?" and every continuation (R51
  gives each one). The toolbar names it ("Suggested question 1", "Continues
  question 7 on p. 2"), shows the amber "?" with its reasons, and offers
  *Accept* (for a continuation *Add as box N*, or *Accept as a question* when
  its question is not cropped or is full) and *Skip*. Esc lets it go.
  *Skip* hides that suggestion until the bank is opened again; nothing about
  it is kept.
- **A continuation goes where it falls in the bank** (`continuesAt`), not
  at the end of its question: before the first of the question's later
  boxes, on a later page, or later on its page by the finder's box number
  (a column's continuation before the next column's). *Add as box N* names
  the place it takes now. In IM3 U4 booklet A, question 63 runs from p. 34
  onto pp. 35 and 36: reached at p. 36 first, its box there is box 2 for
  now, and p. 35's then goes in front of it, so the worksheet prints 63 a)
  to h) in order. It used to be added at the end, which printed h) before
  c)–g), with no way to reorder the boxes but cropping the question again.
- **The amber "?"** is a tag at the box's top right, beside what the box is
  for; its reasons are its tooltip, and its suggestion's name for the
  keyboard. *Accept all (n)* counts and takes the rest, and the toolbar says
  "The one marked ? needs a look, so Accept all leaves it." The second half
  is said only when *Accept all* is shown (3741 DBQ p. 6 has only a
  continuation).
- **While *Add a box* is in hand,** a click on any suggestion makes its box
  the box added, as if drawn.
- **A question's other boxes** in its toolbar read "starts on p. 28" for box
  1, "continues on p. 30" for the one after this page's, and "box 3 on p. 30"
  for any other, each a button to its page. It used to say "starts on" for
  every earlier box, which a four-box chain made read as three starts.
- **The answers notice** for a file with answers in it (§2.1 item 16) shows
  in crop mode once the bank is read, as a strip under the toolbar, outside
  the page's scroll. "Students can see this file" stays a banner above the
  page. The page select is unchanged.
- **The page stays put under the pointer.** The toolbar and the answers
  strip change height as the bank's suggestions arrive (2–26 s after
  opening, while boxes may already be drawn) and as suggestions are
  accepted; the page is scrolled by the same amount each time, so it does
  not move on screen. On 3741 DBQ p. 28 at 1180 × 820 the page used to move
  55 px down mid-drag, and a drawn box ended about 30 pt from the pointer; at
  1000 px wide an accept moved it 12.75 px. Measured in Chromium since: the
  page's top stays within 0.3 px through opening, reading, accepting, a
  "?" asking and *Accept all*, at 1000, 1180 and 1440 px, and a box dragged
  across the arrival ends where the pointer does. At the very top of the
  scroll a toolbar that shrinks can still move the page up.

**As built (the one-page fixes).** Three changes from the UX study of
cropping and picking, in `PageView.tsx` and `Stage.tsx`, with no server or
database change:

- **A page opens at its top.** `goTo` sets the scroll to 0 whenever the page
  changes: Next, Previous, the page select, a topic that leaves the page, or
  a toolbar button to a question's other page, in crop and pick mode alike.
  It used to keep the last page's scroll, so a page left 500 px down opened
  500 px down and began with a scroll back up. Until the next press anywhere
  on the screen, the toolbar's changes as the page turns (the new page's
  suggestions, a question in hand gaining "box 1 on p. 9") do not scroll the
  page by their height either; that had left hl-book-b pp. 10, 15 and 16
  opening 41 px down. From the next press on, the page stays put under the
  pointer as above.
- **A drag at the edge scrolls the page.** While a box is drawn or resized
  with the pointer within 40 px of the scroll area's top or bottom edge, or
  past it, the page scrolls every animation frame, faster the deeper the
  pointer is (half a pixel for each pixel of depth, rounded up, at most
  20 px a frame), and the box follows the page under a still pointer. It
  starts only once the press has moved past the drag threshold, so a tap
  near the edge still accepts or selects, and it stops at the scroll's end,
  when the pointer leaves the edge, and on release. Moving a box does not
  scroll. A box taller than the window is one drag.
- **A page whose suggestions are all taken** reads "Every suggestion here is
  accepted. Drag to draw a box." (each has a box over it, saved or drawn
  here), or "Every suggestion here is accepted or skipped. Drag to draw a
  box." when some were skipped. "No suggestions on this page. Drag to draw a
  box." is now said only of a page that had none, as the states above say;
  it used to be said of both.

Measured in the study's browser harness (1440 × 900 at 2x, with its
counting rules: a scroll is one wheel gesture, and the estimate is its model
of a person's own time), on the same flows before and after:

| Flow | Scrolls | Clicks | Drags | Estimate |
|---|---|---|---|---|
| Crop IM3 U4 booklet A: 37 pages, 67 questions | 71 → 36 | 121, unchanged | none | 337 → 302 s |
| Crop IM2 U4 worksheet 1: 32 pages, 93 questions | 61 → 31 | 80, unchanged | none | 241 → 211 s |
| Crop hl-book-b pp. 1–16: 69 questions | 31 → 14 | 64, unchanged | 6 → 3 | 160 → 139 s |
| A teacher's 10 questions from 3 banks | 35 → 19 | 38, unchanged | none | 142 → 126 s |
| Every Logarithms question (11) | 13 → 7 | 23, unchanged | none | 73 → 67 s |
| Every Exponential growth question (62) | 54 → 28 | 96, unchanged | none | 323 → 297 s |

All 127 scrolls back up to a page's top are gone; what is left is scrolling
down to see a page's foot or to reach a question. hl-book-b's three boxes
drawn by hand, on pp. 10, 15 and 16, are one drag each where each was a
drag, a scroll and a second drag on its foot. What each flow made is
unchanged: the same questions, boxes and topics saved (the hand-drawn boxes
the same to 0.1 pt), and the same worksheets ("10 questions on 10 pages",
"11 questions on 11 pages", "62 questions on 49 pages"). Also checked: the
scroll is 0 after Next, Previous and the page select from 500 px down in
crop mode, and after Next in pick mode; a draw held at the top edge scrolled
the page up 375 px and ended at the pointer; a resize held at the foot
scrolled 376 px and ended at the pointer; a press with a pixel of jitter on
a suggestion in the bottom 40 px accepted it without scrolling; and *Accept
all* on a page just turned to and scrolled 300 px down left the page where
it was.

### 4.4 Make worksheet

**Picks** are question ids in `sessionStorage` under one key per course, read
and written inside `try`/`catch` so a blocked storage only means picks do not
survive a reload. They persist across pages, banks and a visit to the
Viewer.

**As built (PR 2).** `hooks/usePicks.ts` keeps them under
`worksheet-picks:{userId}:{courseId}`, one key per course for each person:
signing out keeps the tab, so on a shared centre computer the next teacher
would otherwise find the last one's picks. `readPicks(userId, courseId)` is
what the modal reads. The banks a tab has open (§4.5) outlive a sign-out too,
so the modal opens banks only from `preparePicks`'s rows, read under the
session at hand, never from the picks alone.

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
  boxes are on, in page order with adjacent pages merged, as "p. 4", "pp.
  4–5", or "pp. 4, 9" when they are not adjacent (§6.1 as built);
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
  threshold is Pencil Files' limit until §9.2 step 7 measures the drag-in
  limit. It is 25 × 1,024 × 1,024 bytes, as the toast's size counts them, so
  a worksheet of 25.0–26.2 million bytes, over a 25 MB limit counted in
  millions, gets no warning until then.

**On failure** to fetch or draw from a bank, no PDF is made, and the error
names the bank, e.g. "bank.pdf could not be read: …".

**As built (PR 3).** `components/questions/WorksheetModal.tsx`, mounted by the
picks bar on the Questions page and on the page view. Where it differs from
the text above, or adds to it:

- **Opening** reads the picks once with `preparePicks` (§3.5 as built), the
  picks at hand when it opened; picks removed later are the modal's own. The
  status line reads "Reading the picks…", "Fetching bank.pdf (2 of 3)…" (with
  the size for a bank over 10 MB) and "Drawing question 4 of 12…". Every bank
  downloads at once through `openBank`, held until the modal closes. A pick
  whose bank page is past the bank's end, or with a box wholly off its page,
  is dropped with the missing ones, and all of them leave the tab's picks.
- **Picks the action will not read.** A pick that is not a question id as the
  database writes one (lower case), which only a tab's storage edited by hand
  holds, comes back as missing and is removed with the same line; it no longer
  refuses the whole set. Over 200 picks is refused with how many there are and
  where to un-pick them ("… and 201 are picked. Un-pick some on their banks'
  pages, or clear the picks with × and pick again."), with no *Try again*,
  which could only fail the same way. When every pick is gone, nothing is sent
  to be signed (Storage refuses an empty list), so the line still shows.
- **Drawing.** Each pick's scale is `scaleOf` (§6.2), worked out from its
  boxes' displayed sizes before anything is drawn, so each box is drawn once,
  at the size it prints. Boxes are drawn in bank and page order, with
  `page.cleanup()` after each page's last. A page with an image that did not
  decode (`imagesFailed`, §8.3) fails its bank, like a failed download.
- **The list** shows each pick's JPEGs, at their printed widths against the
  content area's 180 mm, with a grey placeholder of the right shape until
  drawn; the source line as it prints (§6.1), except that a name too long for
  180 mm shows in full here and is cut with "…" in the PDF; its topic; and ×.
  Beside the label strip: "13 questions on 11 pages", from the layout (§6.2).
  "Drawing question 2 of 4…" counts the list, so a pick removed while drawing
  leaves the count too.
- **Label** is a two-tab strip, Lesson | Homework, Homework first chosen.
- **Cancel** shows while the modal prepares; it, ×, Esc and a click outside
  all close it, which cancels the render in hand, releases the banks and frees
  the pictures.
- **Download PDF** stays enabled after a download, so the other label can be
  downloaded from the same pictures; the modal closes only when the teacher
  closes it. The 25 MB warning is about the last download. A failure to make
  the PDF (the template not fetched, say) is an error toast.
- **Errors.** A bank that fails names itself ("scanned.pdf could not be read:
  The download failed. Try again.") and offers *Try again*, which opens that
  bank afresh in a new pdf.js worker (`closeBank`, §8.3) and draws again; a
  PDF that needs a password, or is not one, gets no *Try again*. Beside it,
  *Remove its 2 picks* takes that bank's picks out of the tab and makes the
  worksheet again from the rest: such a bank's own page view may not open
  either, so without it the only way out was clearing every pick. Once a bank
  has failed, the banks still downloading report nothing more, so the error
  stays on screen.
- **Esc** closes the modal and goes no further: the page view under it keeps
  its selection (`Modal` stops the key's propagation).

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
  `page.render` but the suggestions' read of a bank (§5.1). The page view
  and the modal both use it, with pdf.js's defaults: `intent: "display"` and
  the default `annotationMode`.
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

**As built (PR 2).**

- `openBank(fileId, sizeBytes, signUrl)` asks for a signed URL only when the
  bank is not open in the tab already, and holds the bank until its
  `release()`. A bank that failed to open is forgotten, so the next try starts
  over; `closeBank(fileId)` closes one that is open, which is how *Try again*
  gets a new pdf.js worker (§8.3).
- Before a bank's download, `/pdfjs/version.json` must match the worker's
  version (once per tab) and `wasm/jbig2.wasm`, `openjpeg.wasm` and
  `qcms_bg.wasm` must answer a `HEAD` (every bank). `imagesFailed(page)` says
  whether an image on a page just drawn did not decode (§8.3).
- `source.ts` also holds `toPdfBox` and `toViewRect`, the two conversions
  between PDF space and the screen, `pageBox`, and `suggestFile` and
  `suggestionsFor`, which read a bank for `propose.ts` (§5.1).
- `propose.ts` is the text-layer rules only (§5.1). Reading order (`pos`)
  is `readingOrder` in `lib/worksheet/crops.ts`, because it is worked out from
  the boxes being saved, drawn by hand or not.
- `compose.ts` comes in PR 3.

**As built (PR 3).**

- **`lib/worksheet/layout.ts`** is pure (no pdf.js, pdf-lib or DOM): `PAGE`,
  the templates' page size; `contentArea`; `scaleOf` and `layout`, boxes in
  and positions out (§6.2); `pagesText`, `winAnsi` and `sourceLine` (§6.1);
  `bankPath` and `printOrder` (§4.4); and `worksheetName` (§6.5).
  `supabase/tests/worksheet.mjs` tests it in Node (§9.1).
- **`clipToPage(page, box)`** in `source.ts`: the part of a box inside the
  page's own box, or null. pdf.js does not clip to the CropBox, so
  `renderRegion` draws only that part, and a box reaching past the CropBox no
  longer draws what the MediaBox holds there (§6.3).
- **`lib/worksheet/compose.ts`**, loaded with `import()` by the modal, so
  pdf-lib is fetched only when a worksheet is made:
  - `boxSize(page, box)`: the displayed size at scale 1, after `/Rotate`, of
    the box's part on its page; null if none is, and the modal drops the pick;
  - `drawBox(page, box, scale, canvas, signal)`: `renderRegion` at scale ×
    300 ÷ 72, then `canvas.toBlob` as JPEG at 0.9. The signal cancels the
    render;
  - `template(label)`: `/worksheet/template-{label}.pdf`, fetched once per
    tab, a failure not kept;
  - `save(questions, template, title)`: `embedPdf` once, `drawPage` on each
    page, `embedJpg` with the bytes unchanged, the source line with
    `drawText` in `StandardFonts.Helvetica`, `setTitle`. Each picture is drawn
    at its own pixels × 72 ÷ 300, so `pdfimages` reads exactly 300 dpi; that
    is within half a pixel of its box's printed size.

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

**As built (PR 2).**

- New: the page view's route (§4.3); `app/actions/questions.ts` with
  `savePage`; `components/questions/{PageView,Stage}.tsx`;
  `lib/worksheet/{source,propose,crops}.ts`; `hooks/usePicks.ts`;
  `scripts/copy-pdfjs-assets.mjs`; `supabase/tests/crops.mjs`, which
  `run.sh` runs (§9.1).
- Changed: `Rows.tsx`, `Browser.tsx`, `icons/index.tsx`; `lib/queries.ts`,
  which gains `getFile`, `listFileQuestions`, `listTopics` and `canCropFile`;
  `proxy.ts`, whose matcher skips `pdfjs/` only, with `worksheet/` to follow
  in the PR that adds the templates; `package.json` (`pdfjs-dist` 6.4.299 and
  the `postinstall`); `.gitignore`; `eslint.config.mjs`, which ignores
  `public/pdfjs/`; `DEPLOYMENT.md`; `README.md`'s permission matrix;
  `supabase/tests/run.sh`.
- PR 3 adds the Questions page, `QuestionsView`, `WorksheetModal`,
  `compose.ts`, `preparePicks`, `listQuestionSources`, `pdf-lib` and the
  templates.

**As built (PR 3).**

- New: the Questions page's route (§4.2);
  `components/questions/{QuestionsView,WorksheetModal,PicksBar}.tsx`;
  `lib/worksheet/{layout,compose}.ts`; `public/worksheet/template-lesson.pdf`
  and `template-homework.pdf`, moved from `docs/worksheets/`, where the HTML
  they were printed from stays; `supabase/tests/worksheet.mjs`.
- Changed: `app/actions/questions.ts` (`preparePicks`, and `savePage`
  revalidates the Questions page); `lib/queries.ts` (`listQuestionSources`,
  `countTopicQuestions`, and `readAllRows` exported);
  `components/questions/PageView.tsx` and its route (the picks bar's *Make
  worksheet*, the back link, `?topic=`); `components/browser/Browser.tsx`
  (the *Questions* link); `proxy.ts`, whose matcher now skips `worksheet/`
  too; `package.json` (`pdf-lib` 1.17.1, exactly); `supabase/tests/run.sh`;
  `README.md`; `DEPLOYMENT.md`.

**As built (finder v2.2 and every kind of suggestion).**

- New: `docs/worksheets/textlayer/compare.mjs` (§5.1). Replaced:
  `docs/worksheets/textlayer/propose.mjs`, now finder v2.2 less the rules
  that are not built.
- Changed: `lib/worksheet/propose.ts` (finder v2.2); `lib/worksheet/source.ts`
  (`suggestFile`, and `suggestionsFor` giving the whole bank's);
  `lib/worksheet/crops.ts` (accepting suggestions, §4.3);
  `components/questions/{PageView,Stage}.tsx`; `supabase/tests/crops.mjs`
  (§9.1).
- No migration: what a suggestion becomes is saved by the same `save_crops`
  call as any other box.

## 5. Suggestions

Suggestions are never saved. They become drafts only when a person accepts
them, and rows only when their page is saved.

### 5.1 Digital pages: the text layer (free, in the browser, once per open bank)

The rules were first written against made-up pages, then against ten of the
centre's banks (v1, §9.2.1), and then measured on 219 of its PDFs in five
subject groups, which made them finder v2.2.
`docs/worksheets/textlayer/propose.mjs` is the rules as run, and
`lib/worksheet/propose.ts` is its port, equal to it on every page of the 219
(below). A rule added after v1 has an id, R1–R53 and, after the finished
branch's review, R67–R69, and each sentence below
names the bank whose pages called for it (§9.2.1 says what each bank is). The
made-up pages still pass: two columns, a numbered list inside a question, an
offset CropBox, `/Rotate 90` and label variants.

Every rule reads the page through `viewport.convertToViewportPoint` and
`convertToPdfPoint`, one path that handles `/Rotate` and an offset CropBox
(a past paper's pages are offset by 50 pt). Text items are grouped into
lines by vertical centre, within half a glyph height. An item under ¾ of
body size (the median height, weighted by characters) never starts a line:
Word's maths sets every sub- and superscript, and both halves of every
fraction, as items of their own. It joins the nearest line beside it, whose
top and bottom take it in.

**Page kind**, decided per page:

- **Scanned** when the largest image covers at least half the page, checked
  first so that an OCR layer over a scan never counts as text; **digital**
  otherwise, with at least 20 visible characters; **none** otherwise, and
  nothing is proposed (v1).
- A text item counts only where the drawn page has ink inside its box, its
  descenders included (R2: a test scan with an invisible OCR layer, and the
  biology DBQ booklets, whose answer lines ink below the baseline).
- A page under a page-size image is digital after all when 20 or more glyphs
  are painted visibly on top of it and it yields a question (R1: the AP
  Statistics textbook bank, whose p. 28 is a text page over a 1 × 1 fill).
- A page under 20 characters is digital when it yields a question (R3:
  speed-math p. 50, "48. SYMMETRY" over a table).
- A page with no proposals whose ink lies 90% inside its placed images is
  scanned, to be drawn by hand (R4: BG-05's pasted textbook pages, the
  College Board screenshots in the AP economics banks).
- A page with no proposals, no body text and almost no ink inside its margins
  (under 0.02% of it) is **blank** (R5: the empty p. 2 behind many covers, as
  in the Mental Arithmetic books and 16 economics files).
- A page that paints an image but draws pure white is **render-failed** (R6:
  the AMO contest booklet, a CCITT scan, which pdf.js draws white on every
  page when its wasm decoder is missing).
- A cover, a page with a "Name:" line and a "School:" line, proposes nothing
  (v1: the AP banks' covers carry a numbered contents list and numbered
  rules for students). A Name/School header that also has a SCORE, START or
  END TIME, MAX TIME or DURATION field is a test's header, and the questions
  under it are proposed (R7: the IM2 U4 basic test "Quadratic Function 1",
  3 of whose 6 questions sat under it).
- A Contents or Index page proposes nothing (R8: speed-math p. 2, 53 false
  proposals, and p. 2 of the IB HL AA and IGCSE CIM books).

**Answers.** Nothing is proposed from an answers heading to the end of the
file: "Answers", "Answer Key", "Mark Scheme", "Solutions", or a title ending
"(Answers)", but not any line ending in "answer", since "Justify your
answer" wraps onto lines of its own (v1). Then:

- More forms count: "Markscheme", a "(topic)" after the word ("Answers (14:
  ARITHMETIC)"), "…: Mark scheme", "Mark scheme for …", and "Suggested",
  "Model" or "Sample answers" when set large or among a page's first two
  lines (R9: the economics banks, whose mark schemes gave 272 false
  proposals, the 215-integration chapter book and the IGCSE CIM books).
- So does an answers word after a dash or colon at the end of a title:
  "– Answer Key", "- Solutions", "− Answers & Explanations" with U+2212
  (R10: the chemistry keys, teacher editions and worked solutions).
- An answers line ends the questions only if it looks like a heading: bold,
  1.1 × body size or among the page's first three lines, and starting in the
  left quarter or centred (R11: Book No. 5043, where "solutions" in a table
  cell had ended the file at p. 5).
- It is looked for on every page, scanned or not (R12: BG-05 p. 9, an
  "Answer Key" over a pasted picture).
- Answers end at the sheet: a later page with a "Name:" line in its top
  fifth and no answers heading of its own starts a new one (R13: the merged
  chemistry packs; on the 219 it now fires nowhere).
- A run of three or more labels whose text on each label's own line is only
  answer letters is an answer key (R14: the chemistry letter keys, which
  with no heading gave 90 and 132 false proposals in two files; vertex
  letters in a figure on CIM1 p. 37 taught it to look at the label's line
  only).
- An answer key with no heading is found by its shape: the file's numbered
  sections, or two headings printed once, come back later on fewer pages
  with short entries (R15: Book No. 5004, 88 false proposals on its mark
  scheme; the IB books, each chapter of which restarts "Exercise 1", taught
  the guards).
- A page marked answers proposes nothing, and a file whose every page is
  answers is an answer key: it proposes nothing at all, and the page view
  says so (§4.3). On the 219, 43 files read as answer keys, every one a
  chemistry key, teacher edition or worked-solutions pack.

**Labels.** A label is a line's first token: "1.", "1)", "Q2", "Question
3:", "EX 1:", "EX 7 :" and "12. Express …", case-insensitive; later in a
line, "2." is a label only as the next cell of a grid row. "(a)", "2.5",
"3:15", "A1", "1/2" and a bare "78" at the start of a table's row are not
(v1: the AP banks, where a column of consecutive data values once became a
run of questions). Then:

- A label split over two abutting items is read joined, and "0." then "3"
  is a decimal (R16: the IM2 U4 booklet's "6" and ") Each figure", and 8
  labels in the AP economics books).
- Of two labels painted on one spot, the one painted later counts (R17: the
  AP Statistics textbook, renumbered in Acrobat over its old numbers).
- 0 is never a label (R18: the "step 0" rows of the IM2 U4 booklet's
  tables).
- A colon before a digit is a ratio, not a stop (R19: speed-math p. 36,
  "SIMPLIFY THE RATIO", 12 false proposals).
- "*2." and "6 ." are labels (R20: BG-07 and BG-06).
- "4a)", "7a." and "2 a)" are labels when the number continues a run (R21:
  BG-07, chemistry-of-life, hl-book-b).
- An answer blank before the number, "_____8.", does not hide it (R22: Accel
  Bio unit 1, Q8).
- "FRQ 2", "Long FRQ 1" and "Q 3 – Title" are labels (R23: the chemistry
  FRQ packs).
- A bare number hanging left of the text margin before its stem, "2", "1a",
  "4 a ii", is a label; in the top band only when it lines up with the
  file's other hanging labels (R24: the seven biology DBQ and EBQ booklets,
  where v1 found none of 128 questions, and hl-book-b).
- A hanging number alone on its line, with ink to its right, is a label in a
  run that also holds an ordinary one (R25: the biology Word worksheets; the
  IM2 U4 booklet's numbered table columns taught the guard).
- A number whose stop was lost, then a capital, is a label only as a run's
  next number (R26: "55 The …" and "61Suppose" in the economics books).
- A number set 1.25 × body size, one or two among body-size labels, is a
  chapter title, not a label, and ends the box above it (R27: the IB HL AA
  books' numbered chapter titles; speed-math, whose every page number is
  large, taught the guard). Sub-parts never start a question: a.–z., a)–h),
  (a)–(h) and (i)–(viii) (v1).

**Runs and columns.** Labels chain into runs of consecutive numbers, and
every run is kept, since a page restarts its numbering for each section, up
to four times (v1: the AP banks). A label continues a run when it is the
next number and sits under the run's left edge, within 6 pt, or follows the
run's last label on the same line, which makes the run a grid. When two runs
could take a label, one with a gap above it goes to the run whose labels all
have one. A run needs two labels, or a gap above its one label taller than
body text. A run lying wholly between two labels of another run is a list
inside that question, and is dropped (v1). Then:

- A run of one is kept when it sits straight under a heading, at the margin
  or in line with another label (R30: IM3 U4 booklet A's questions 16, 25
  and 63, and the same booklet in Algebra 2 Trig).
- A run starting at N + 1 a quarter of the page right of a run that ended
  at N is the next column, not a list (R31: written for the IB books; it
  fires on none of the 219, because the page it was for needed R32).
- An inline label starts a run of its own when the next number sits right
  under it, a table read down its columns, and a label further along a
  box's own line ends the box's right edge there (R32: BG-04 p. 2, 19
  proposals to 34, one a cell; the last cell of such a column is capped like
  a grid's last row).
- A run from 1 indented more than 12 pt inside a question is a list in it
  (R33: a lesson-notes list in AP unit4-s2, a procedure in chemistry
  grill-4, cell-structure); a run level with another run's labels and
  numbered in the style of the label above is a column of questions instead,
  and the style test keeps IB Blue p. 68's "1)"–"18)" under "1." a list.
- A run from 1 under a sub-part line, or under an FRQ, Exercise or Prompt
  heading, is a list in that part (R34: chemistry grill-3's steps).
- In a file of "Question N" labels, an indented bare run after one is a list
  (R35: a biology homeostasis worksheet).
- A run 6–10 pt off its column still chains (R36: a chemistry semester
  review sheet, and drifted labels in the Word chapter books).
- Columns: an empty vertical band in the middle 30–70% of the width is a
  gutter only if each side carries a run of two or more of its own, so a
  grid, whose cells read one side at a time are odd and even numbers, never
  splits (v1). The gutter is the widest empty band, not the middle of it
  (R38: BG-06); never through a placed image under 60% of the page wide or
  between the columns of a table (R39: BG-04 p. 2's table, a speed-math Venn
  table, Book No. 1's clip art); and on a drawn divider when there is one,
  with the left column's edge taking in its own text (R40: the Math Fluency
  sheets).

**Headings.** A label-free line of 60 characters or fewer is a heading when
it is set 1.25 × body, is in section words (Exercise, Part, Section, Unit,
Lesson, Chapter, Classwork, Homework, Problem set, MCQ, FRQ, Structured or
Essay questions, an upper-Roman numeral), or is bold or short capitals on a
page whose body is not, those two only straight above a label or outdented.
A heading below a label, at or left of it, ends that question's box, and a
run after one is a new section, not a list. A heading stacked straight above
such a heading ends the box too, and a font the page paints only invisibly,
an OCR layer, is never one. Each question carries the heading it sits under,
its section (R29: the IM2 U4 booklet's "Lesson 4:" bars, the IB HL AA and
IGCSE CIM books, where headings inside question boxes went from 163 under v1
to 8, economics section stops, hl-book-b's "SL Short Answer Questions";
unit2-s3-ms's OCR layer taught the last guard). R27's chapter titles and
R52's "questions N–M" lines end the box above them too.

**Box edges and the footer.** The top is the label line's top less 4 pt; the
left the label less 4 pt, or any ink within 30 pt left of it on its line, a
calculator icon that belongs to the question; the right a grid's next cell,
a label a quarter of the page to the right inside the question, or the
column's edge; the bottom the last inked row (R+G+B under 600) above the
next label below that starts inside the box's width, the footer band (the
outer 6%) or the answers heading; the sides shrink to the ink, plus 4 pt.
Ink, not text, sets the bottom, so diagrams and answer lines stay in and the
blank space under an example stays out (v1). Then:

- The footer is the page's own when it has one: its page-number line in the
  bottom 12% ("7", "Page 7 of 9") or a page frame's bottom rule (R41: the
  IM2 U4 booklet, whose page numbers about 10% from the foot sat inside the
  last box on 28 of 31 pages, the economics Word books, the biology
  template's border).
- With no footer of its own, the band never cuts a line, and a drawing that
  crosses it stays whole (R42: economics Word pages with no footer; it also
  fixed 5 boxes on the first ten banks that had been counted right, below).
- Footer furniture ends the questions above it: a line repeated at one
  height on half the pages, "turn over", "Do not extend your answer beyond
  this page" (R43: the chemistry quizzes and FRQ packs).
- Page frames and page-long rules are not ink, unless a table's rules cross
  them (R44: the Math Fluency sheets, about 500 of whose boxes v1 stretched
  to the border, the biology template, the chemistry teacher editions).
- The top takes ink rising from the label line's own text, a numerator or a
  radical bar, and stops at the ink of the line above (R45: the Math Fluency
  sheets and BG-06; a guard stops it climbing into the icon or table row
  above).
- Neighbouring boxes in one label column never overlap: the gap between
  their inks is split (R46: the Math Fluency sheets, the IM3 and Algebra 2
  Trig mocks).
- The left edge takes outdented ink anywhere in the question, up to 40 pt
  (R47: the IM2 U4 booklet's p. 28 options A and C, a "30°" on a fluency
  sheet, speed-math's frames).
- A placed image is never cut: one across the bottom goes with the question
  that holds half of it, or the box ends above it (R48: Book No. 1's
  number-bond trees, the next question's calculator icon in pcs-poly).
- A grid's last row, or the last cell of a drill column, is one row pitch
  tall (R49: BG-04's conversion tables).
- A marks-only line, "(3)" or "2 marks", straight above a label starts that
  question (R50: the basic tests and Test Your Basics; "[4]", which the IB
  and CIM books print at the end of the question above, does not count).
- Ink in a box's top two pixel rows that its third row does not continue is
  the line above's tail, a comma or a descender, and does not widen the
  box, unless it is all the ink there is (R69: IGCSE CIM Book 1, where
  Chromium draws a comma of p. 20's Q65 a pixel lower than Node's canvas,
  into Q63's top row, and Q63 came out 179 pt wider in the page view than
  in Node).

**Continuation, stem and context boxes.**

- **A continuation.** The last question of a page, or of a left column, is
  left open when no label below it ended its box. On the next page or
  column, the ink above the first label, or the whole page if it has none,
  is that question's next box, box 2, 3 or 4, when the question's ink
  reached the foot, or the block opens on a bare sub-part, or the page says
  it is continued; never when the block opens on a heading, a short centred
  title, a source tag, a "questions N–M" line, an answers line or a label
  the rules did not take. It ends at a heading that ends something, a source
  tag (below it, so a question keeps its closing "[M/J 2021/P41]"), a stem
  line or an instruction block (R51: IM3 U4 booklet A, 16 of whose 67
  questions run over a page, where ink to the foot alone missed them because
  their answer space is blank; hl-book-b; the past papers; the IGCSE CIM
  books' source tags).
- **A stem.** A label-free line naming the questions a stimulus serves,
  "Use the graph for questions 5–9", "Questions 11–14 are based on",
  "(Exercises 5–12)", ends the box above it and is a stem box down to its
  first question, for the questions it names wherever they fall, up to the
  next section heading (R52: the chemistry MCQ warm-ups' "For questions
  N–M", the AP economics banks, where 214 of 1,104 questions need one, the
  AP Statistics textbook). Up to six label-free lines straight above a
  run's first label, at the margin, after a gap or a heading, are a stem for
  the run, up to the next section heading too (R53, form i: the
  problem-set instruction over a table of bare expressions, which 60 of the
  first ten banks' 65 questions printed-above depend on; on those banks it
  proposes the stem over 31 of them, and misses AP CAL Unit 10's, below).
- **A context.** A "Model N" or "Read this" heading is a context box down to
  the first label, for every question after it until the next Model
  heading, a run that restarts at 1, a new sheet, a section heading, or a
  question under a heading none of its earlier questions sat under (R53,
  form ii: Accel Bio unit 1, 89 of whose 126 questions need a Model). The
  last two end it since review: unit 1's p. 17 passage ("Read the passage
  below. Then answer the questions that follow.") also named question 8,
  under p. 18's "Fill in the Venn" and an MCQ instruction of its own, and
  printed above it; Models 3 and 4 named their "Extension Questions" too.
  Of the 14 contexts on the 219, those three name 8 questions fewer.

**The "?" flag.** A box that needs a look carries an amber "?" with its
reasons, and *Accept all* leaves it (§4.3):

- "continues the question above it": every continuation (R51);
- "an image spans this box and the next" (R48);
- "holds a numbered list that is not proposed": the box holding a run
  dropped as a list, unless every dropped label shares its line with a
  lettered item, a matching exercise (IM2's p. 29), or the list is set
  inside a paragraph, a case study's aims (book 6650 p. 5) (R37: the
  made-up label-variants page, AP unit4-s2);
- "overlaps another question's box": two questions' boxes, not cells of a
  grid, that overlap by more than 3 pt each way, each one to check (R67:
  IGCSE CIM Book 1 p. 18, where Q7's box ran across all three columns and
  printed Q21's expression, and Q21's took in Q20's line);
- "holds only its number": a box one line tall and no wider than its label
  (R68: p. 18's Q16, whose expression is elsewhere or not in the PDF).

**Reading order.** When a page is saved, its crops get `pos` in reading order
on the displayed page: columns left to right, then top to bottom (v1;
`readingOrder`, below), with two or three columns, and a box across them
with nothing beside it a band of its own between what is above and below.

**Not built.** R28 (a small "N." starting a line), R54 (a whole-page box on a
drill page), R55 (a box per picture on a page with no labels) and R56
(lettered whole questions) were written and left off, each for a file the
owner's answers now send whole: the primary drill books, the WPS BG drill
books and the IB Economics Paper 2 sheets (§2.1 item 15). R57, the answer
shown by a bold option, changed nothing on the 219 once R10 read the
teacher editions as answer keys. R53's form iii, a page of prose as the stem
of the next page's run, was turned off in v2.1, because every one the checks
found was wrong. R58–R66 were recorded and never built. None of these is in
`propose.mjs` or `propose.ts`.

**As built (PR 2).**

- PR 2 ported v1 to `lib/worksheet/propose.ts`, fed pdf.js's text content
  and the page drawn at 144 dpi, for the page on screen. Finder v2.2 has
  since replaced that port (below).
- Reading order is `readingOrder` in `lib/worksheet/crops.ts`, from the boxes
  alone, however they were made. The gutter is the widest band of the middle
  30–70% of the page that no box crosses, measured exactly rather than in 1%
  steps (two columns' boxes can be 2–4 pt apart), with two boxes or more on
  each side. A page is a grid, read row by row, only when most boxes on the
  side with fewer have a box beside them at the same height (tops within 6 pt)
  that all but touches it across the gutter (within 8 pt): a grid's cell ends
  at the next cell's label. Rows that only line up are not enough, since two
  columns numbered down each column often line up. On the 381 pages of the 53
  sample banks with two proposals or more, with every proposal accepted, no
  consecutive pair of numbers is saved out of order; reading row alignment
  alone, and the gutter in 1% steps, put 4 pages out of order
  (`g6-math-fluency-1-merged` p. 2 read 1 21 2 22 …).
- *Changed after review:* that check could not see columns interleaved,
  since 1 8 2 9 has no consecutive pair swapped, and the one gutter missed
  three columns and any page with a box across the middle: IGCSE CIM Book 1
  p. 18 printed picks 1, 2, 3, 8, 9 as 1, 8, 2, 9, 3, and p. 89 saved its
  stem, 22, 26, 23, 27 …. Now a page has as many gutters as it has columns,
  each where fewer boxes cross than on either side, fewer than half the
  page's, and every column needs two boxes wholly inside it. A box across a
  gutter with nothing beside it in a column it reaches into, a stem over
  both columns or a wide question under them, is a band: what is above it
  is read first, columns and all, then it, then what is below, each band
  read the same way. A box across a gutter with something beside it there,
  a line run long, stays in the column it starts in. Besides a grid, two
  columns are read along their rows when their tops line up within 3 pt on
  most rows and their questions are 40 pt apart or more down the column,
  questions set two to a row with room to work (CIM Book 1 p. 31, 609
  mensuration); closer set, a list numbered down each column, they stay
  columns (the fluency sheets, CIM Book 1 p. 89's 22–25 and 26–29). Measured
  on the 219 sample PDFs, every proposal accepted, over the 1,221 pages with
  three questions or more: pages whose questions are each numbered once and
  read with two descents or more went from 25 to 14, and pages with any
  descent other than a section restarting at 1 from 51 to 40 (13 put
  right, 2 put wrong). The two are tall questions numbered down two columns
  whose tops line up exactly (Book No. 1 p. 10, the AP Statistics textbook
  bank p. 7), which the boxes alone cannot tell from questions set two to a
  row; the rest are mostly tables numbered down their columns, IB pages
  that restart their numbering mid-page, and the LibreOffice copies of the
  Word books, whose dropped equations leave odd boxes (§9.2.1).

**As built (finder v2.2).**

- `lib/worksheet/propose.ts` is finder v2.2, the rules measured on 219 of
  the centre's PDFs (3,909 pages), ported from the lab finder,
  `docs/worksheets/textlayer/propose.mjs`, one function per rule, each named
  with its rule's id (`r24HangingLabel` is R24). The rules above that are
  not built are in neither. It still touches no pdf.js and no DOM.
- **What it reads.** `suggestFile` in `source.ts` reads the bank twice, a
  page at a time, in order. First each page's text, for the lines the file
  repeats (running headers, footer furniture). Then each page's text
  content; the page drawn at 144 dpi, for its ink and where its images fall;
  each font's weight; and, on the pages `needsOperators` names, the operator
  list (render modes, image sizes, glyphs painted after an image). The bank
  is opened with `fontExtraProperties`, so a font's name ("…-BoldMT") can
  say bold. The ink canvas is sized with `Math.ceil`, as the lab's is, which
  is why `suggestFile` calls `page.render` itself.
- **What a page takes from the others** is explicit, in `FileState`: where
  the answers start and whether a new sheet ended them (R9–R13), the
  question left open at the foot of the page before (R51), the x of the
  file's hanging labels (R24) and of its "Question N" labels (R35), and the
  "Model" context open (R53). `finishFile` then does what needs the whole
  file: an answer key under no heading (R15), and each stem's questions
  (R52).
- **So a page's suggestions come once the whole bank is read**, once per
  open bank, in the background from the first page asked. Meanwhile the
  status line counts the pages, and boxes can be drawn by hand. In headless
  Chromium, two sample banks of 14 and 22 pages were read in 2.5 s and
  2.3 s; in Node a page takes 0.1–0.3 s.
- **What comes back.** Per page: its kind (digital, scanned, none, blank or
  render-failed), whether it is answers, and its boxes, each a question, a
  continuation (box 2–4 of the question it names), a stem or a context
  (with the questions it is for). A box that needs a look carries its
  reasons, the "?", and a question carries its section heading. Per file:
  `answerKey`, when every page is answers and nothing is proposed.
- **The page view offers every kind** (§4.3): a question as a new question,
  a continuation as the next box of its question, a stem or context as a
  stimulus above its questions, each "?" with its reasons, and the page's
  kind and answers in words.
- **Equality.** `node docs/worksheets/textlayer/compare.mjs <bank.pdf…>`
  runs the port through `suggestFile` and the lab finder beside it,
  `propose.mjs`, on the same banks. It compares every page's kind,
  characters, coverage and answers, and every box in order, to 0.5 pt, with
  its type, number, questions, box number, reasons, section and label, and
  the answer-key flag. On the 219 PDFs every page is equal: 3,909 pages and
  10,794 boxes (10,214 questions, 478 continuations, 88 stems and 14
  contexts; 1,132 with a "?"), with 43 answer keys. `propose.mjs` is the
  lab's v2.2 with the rules that are not built taken out, plus what the
  finished branch's review added: R67–R69, and stems and contexts that end
  at a section heading. Against v2.2's output on the 219 those add 603 "?"
  (45 by R67, on 6 files; 558 by R68, all but one of them on the
  LibreOffice copies of the Word books, 420 in the two CIM books), take 8
  questions off 3 contexts, and move 11 boxes' sides by 1–118 pt (R69, 5 of
  them on CIM Book 1); no box is added or lost. §9.2.1's measurements are
  v2.2's.
- **The browser.** The page view draws with Chromium's canvas, not Node's,
  so a box can differ by a pixel. Walking every page in the page view
  against the lab's output, the review found IGCSE CIM Book 1 different on
  6 of its 946 boxes, 5 by 139–188 pt: a comma or descender of the line
  above, drawn a pixel lower than in Node, fell into a box's top row and
  widened it (p. 20's Q63 reached under Q65, 380 pt against 201). R69 is
  the fix. Walked again since, CIM Book 1, hl-book-b and 3741 DBQ match
  Node on every page to 1.5 pt or less. No browser walk sits beside
  `compare.mjs` in the repo, which keeps no browser harness; a change to
  the finder's ink tests is walked in a browser by hand.

**What it got on the first ten banks (§9.2.1).** Under v1, every one of the
495 questions had a proposal starting at its number. Of the boxes, 10 took in
a heading or a notes box between two questions, such as "AP MCQ" or "Problem
Set 3-1 Part 2", and 80 were only part of their question: they missed what is
printed once above the number, or stopped at a page break, so those questions
need more than one box (§2.2). 12 proposals were not questions, all numbered
lists in lesson notes ("Integrals are classified as improper for three
reasons. 1. … 2. … 3. …"), 507 in all. The economics run later found 5 boxes
counted right there that the 6% footer band cut: unit2-s3 Q2's option E,
pcs-poly Q6's last row and Q35's part g, and the last line of pcs-explog Q52
and unit8-s1 Q15. R42 fixed all five. Finder v2.2 makes the same number of
question boxes on each of the ten banks, and adds 5 continuations and 3 stems.

**Across subjects**, finder v2.2 against v1 (§9.2.1, with each figure's
method): on 14 Word books scored against Word's own numbering, 4,483 of 4,560
questions found against 4,261, and 44 false proposals against 1,654; on the
chemistry papers scored against their keys, 206 of 206 found, as before, and
204 right against 201 (2 counted wrong both times); on the biology label columns, 861 of 863 found against
306; on the economics and business banks, by eye, 1,855 of 1,918 right against
1,711, with no false proposal and no trim left.

**Where it still misses**, on the 219 (§9.2.1). Each miss means fewer
proposals, or a box to fix, and the person draws the rest:

- numbers printed inside a picture: BG-04, BG-05 and BG-07, and 47 economics
  questions pasted as screenshots. R4 reads most such pages as scanned, to be
  drawn by hand;
- whole questions lettered (a)–(g) (the IB Economics Paper 2 sheets, 14),
  and letter or prompt labels ("Prompt A:", "Exercise N") in the chemistry
  handouts. §2.2's default holds: "(a)" is a sub-part;
- labels set under ¾ of body size (Book No. 1's 900 sums) and unnumbered
  drill tables (speed-math's 34 drill pages). Both are drill books, sent
  whole;
- a number fused to its part at a run's start, as hl-book-b p. 61's "1 a)";
- a stem printed on the line above its number (macromolecules p. 5, Q11);
- a continuation that opens on plain prose under a question whose ink did
  not reach the foot: 31 of the 109 IB DBQ pages that need one get none;
- bare cell numbers with no stop, and a stop wrapped onto its own line in a
  narrow table cell (IGCSE CIM Book 1, 32 missed, and Book 2, 25);
- a nested list laid out in columns (IB Blue p. 68's "19)"–"37)"), 37 of the
  44 false proposals left in the Word books;
- an answers heading printed inside a picture (BG-01 pp. 10–12) and a mark
  scheme known only by its file name (a biology homeostasis "a-ms" file,
  whose 8 continuations carry wrong numbers): neither is marked answers, so
  the crop screen shows no banner for them, and the in-charge goes by the
  file;
- a problem set's instruction R53 does not take: AP CAL Unit 10 p. 6's
  "Problem Set 10-1 (Improper Integral)" over 23 questions gets no stem;
- a stem over a run whose later questions stand on their own, with no
  heading between: unit2-s3 p. 5's "Find the derivative of each function.
  Simplify, if necessary." names questions 1–13, and 11–13 ("Find the
  equation…", "Determine all values of x…") do not need it, yet it prints
  above them once both are accepted. The in-charge draws those three by
  hand instead, since a drawn box goes under no stem;
- on the LibreOffice copies of the Word books (§9.2.1), whose equations
  were dropped or moved, boxes that take in another question's expression
  or leave out their own. R67 and R68 put a "?" on those that overlap
  another box or hold only a number; one that took in a stray expression
  without overlapping another box is not flagged;
- labels like "A1", numbers inside circles, a label font that extracts as
  garbage, a diagram across a gutter, and content drawn sideways with no
  `/Rotate`: none appeared on the 219.

### 5.2 Scanned pages: AI (on request, one page at a time)

**Designed, not built** (§2.1 items 9 and 18). This is the design if AI is
wanted later. Nothing in PRs 1–3 depends on it, and until then §5.3 is what
happens. It was left out because the owner asked for the small build, and
because the scanned pages the samples hold are few, or are not to be
cropped (§9.2.1):

- the primary drill books (Book No. 2, Mental Arithmetic 2–5, the Primary 1
  workbook units) are all scans, but they are finished books, sent whole;
- every one of the 18 chemistry scans is already answered, 7 of them a
  child's own work, so AI there would only make it easier to crop answers;
- the IM3 U1 sets are drawn by hand in an estimated 1–2.5 minutes each, and
  the 150 questions of the AMO contest booklet in about 20–25;
- the strongest case is the AP Statistics textbook bank, whose 27 image
  pages hold 163 of its 244 exercises.

If it is built, the samples change some of what follows: a 600 ppi 1-bit
scan's JPEG is 410–580 KB, not about 330 KB, and a phone photo's 383–612 KB,
all far under the 3 MB cap; a 36-question test page needs about 3,000 output
tokens before thinking, against the 500–1,500 assumed below; and a phone
photo of 110–153 ppi is only upsampled at 1623 × 2296, so the measurement
scores 924 × 1307 too.

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
- It builds each box with the same ink rules as §5.1's box edges.
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
- **`ANTHROPIC_MODEL`**: a model id that accepts images, chosen by
  the measurement above. No id is written in code or docs.
- **`ANTHROPIC_EFFORT`** (optional): one of `low`, `medium`, `high`, `xhigh`
  or `max`, chosen by the measurement. Unset means the request sends no
  `effort`. Any other value makes `aiConfig()` return null, so a typo turns AI
  off visibly rather than sending something nobody measured.

Add all three, empty, to `.env.example` and to the `DEPLOYMENT.md` §5 table,
as optional entries.

### 5.3 When AI is not set up

This is how it ships, for now (§2.1 items 9 and 18). There is no *Suggest
boxes* button, and cropping never waits on AI. On a scanned page (§5.1, page
kind) an in-charge sees:

- the page, drawn as on any other, and its saved boxes;
- in the toolbar, the chip "Scanned page", and the line "No suggestions on
  this page. Drag to draw a box.", the same as on a digital page with no
  proposals;
- no dashed box and no *Accept all*;
- the banner of §4.3 when the file has answers in it, and on an answers
  page the line "This page is answers: nothing is suggested on it. Drag to
  draw a box." instead.

A page with no text layer reads the same, with the chip "No text layer". A
blank page's chip is "Blank page", with "This page is blank: there is
nothing on it to crop.", and a page pdf.js could not draw has "Page did not
draw", with "The PDF reader could not draw this page, so nothing is
suggested on it. Drag to draw a box." Every box on such a page is drawn by
hand, and saved like any other. On the scanned chemistry FRQ sets that was
1.1–1.7 boxes a page, each mostly one drag along a printed frame (§9.2.1).

## 6. Output

### 6.1 The branded A4 page: the template itself

Each worksheet page is the owner's own template page with the crops drawn on
top. Nothing of the template is redrawn.

- **Files:** `public/worksheet/template-lesson.pdf` (25,655 bytes) and
  `template-homework.pdf` (26,961 bytes), the PDFs the Pencil template's
  Lesson and Homework boards were made from. PR 3 moved them there from
  `docs/worksheets/`, where the HTML they were printed from stays. `proxy.ts`
  skips `/worksheet/`, as it does `/pdfjs/`, so fetching a template costs no
  session check; they are the centre's blank branded page, nothing more.
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

**As built (PR 3).**

- **The source line** reads the bank's file name without ".pdf" and its
  pages: "U4 BOOKLET WORKSHEET 1 (L1-8) · p. 12", "… · pp. 12–13". Pages are
  the distinct pages of its boxes in page order, consecutive ones as a range:
  "pp. 4, 9", "pp. 4–5, 9".
- **"p." is the PDF's own page,** counted from 1 as the page view and the
  Viewer count them, so the line and the portal agree. It is not the number
  printed at the foot of a page, which a booklet may start later: in "U4
  BOOKLET WORKSHEET 1 (L1-8)", PDF pages 11–14 print 10–13, so the question
  whose line reads "p. 12" sits above a printed "11". The file has no page
  labels (`/PageLabels`) that could say so; where a bank has them, pdf.js's
  `getPageLabels()` could give the printed one. To confirm with the owner
  (§2.3). It is small grey sans text, 8 pt Helvetica (pdf-lib's
  `StandardFonts.Helvetica`, not embedded) in the template's label grey
  `#B4B8C5`, 2 mm under the question's last box and inside the content area.
  A name too long for 180 mm is cut short with "…", and the pages always stay.
- **Characters Helvetica cannot draw are replaced, never thrown on**
  (`winAnsi`): a letter outside WinAnsi keeps its letter and every accent
  WinAnsi still has with it ("ố" prints as "ô", "ậ" as "â", "ő" as "o"), "Đ"
  prints as the identical "Ð" and "đ" as "d", white space is a space, and
  anything else is "?" ("Đại số 数学" prints as "Ðai sô ??"). The test runs
  every character of the Basic Multilingual Plane through it and through
  pdf-lib's Helvetica.
- **Tested** on a worksheet from two synthetic banks and one of the centre's
  (§9.1): `pdftotext` prints, per page, "HOMEWORK" and "MathVision", and one
  source line per question, nothing else; `pdffonts` lists the template's
  Inter Type 3 fonts and Helvetica (Type 1, WinAnsi), nothing else.

### 6.2 Placing crops

- **Content area:** from 15 mm to 195 mm across, and from 26 mm below the top
  to 24 mm above the bottom, which makes it 247 mm tall. Questions are placed
  top-left.
- **A question is its boxes stacked,** in `box_no` order, one under another,
  left-aligned and at one scale, with no gap: a proposed box already carries
  4 pt of margin round its ink (§5.1, box edges). Its source
  line (§6.1) follows 2 mm under the last box, at 8 pt in the template's
  label grey, `#B4B8C5`, and is never scaled.

**As built (PR 3), settled by the owner** so that every box stays readable.
The rule is `scaleOf` and `layout` in `lib/worksheet/layout.ts`:

- **One scale per question,** from its width: min(1.25, 180 mm ÷ its widest
  box). No page height shrinks it, save the two exceptions below.
- **A question that fits one page** at that scale, boxes and source line
  within 247 mm, prints at that scale from the top of its page, and the rest
  of the page is for working. Two short questions share a page:
  - a question is *short* if its printed height, boxes and source line
    together, is 74 mm or less;
  - two short questions in a row share a page, and the second starts at the
    content area's vertical midpoint;
  - any other question gets a page of its own.
- **An enlargement that would split a question is cut back.** A question
  that fits one page at the bank's own size, but not at its width's scale,
  prints at the largest scale that fits, 1 or more. The enlargement up to
  1.25 used to push such a question over a page break: Chap10 warm-up 2's
  stem, the drawings I, II and III, and its question 4 need 741 pt with the
  source line at 1.079 and 688 pt at 1, against the area's 700, so the
  stem printed alone and the question on the next page, three times on that
  sheet, and with one page per board the child had the drawings on one
  board and the question on the next. They now print on one page at 1.018.
  Nothing prints smaller than the bank, and a question that does not fit
  at 1 flows at its width's scale as before. Of the 469 questions a stem or
  context names on the 219 sample PDFs, each laid out as its stimulus and
  its own box, 3 split this way, all on that sheet, and none does now; 1
  other is taller than a page at the bank's size and still flows.
- **A question that does not fit one page at the bank's own size is never
  shrunk to fit a page height.** Its boxes are laid one under another at its width's scale, from
  the top of a new page; a box that does not fit under the one before it
  starts the next page, and the last box needs room for the source line too,
  so the line is never alone on a page. The working space is the rest of the
  page after the last box, and the next question starts a new page. A
  past paper's question over four full pages prints at its full width's scale,
  a box a page.
- **A box too tall for a page by itself** at that scale is the other exception,
  since it cannot be printed whole otherwise: its question's scale comes down
  until that box fits a page with its source line under it. No box is ever
  cut, and a box no taller than an A4 page still prints at 81% of its size or
  more.
- **The 0.55 × 247 mm cap is not a shrink.** The plan's formula also capped
  a question at 0.55 × 247 mm ÷ its stacked height, and the settlement kept
  that cap for a question that fits. Applied as a shrink, it printed a
  question a little under a page tall at as little as 0.56 of its width's
  scale, while one a little taller, which flows, printed at full scale.
  Measured: a box 482 × 640 pt from `digital.pdf` printed at 0.602 (102 ×
  136 mm, its 11 pt text at 6.6 pt), and the same box 20 pt taller at 1.040
  (177 × 242 mm). That is the opposite of every box staying readable, so
  after review the cap shrinks nothing. It only describes what a question
  gets: one no taller than 0.55 × 247 mm at its width's scale leaves at least
  45% of its page for working, and a taller one keeps its scale and has the
  rest of its page. The pair above now prints at 1.059 and 1.040, the
  taller one as the largest scale that fits its page (above). Owner to
  confirm (§2.3).
- Picks keep bank order (§2.2).
- **Tested** by `supabase/tests/worksheet.mjs` (§9.1), and printed: a
  four-box question flowing over a page break, a box taller than a page alone
  on its page at 0.98, two short questions to a page.
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

**As built (PR 3).** Every crop of the sample worksheets (§9.1) is one JPEG,
which `pdfimages -list` reads at 300 × 300 ppi, at its printed size within
half a pixel. A question that flows (§6.2) can print a box up to the content
area's full height, so the largest canvas is now 180 × 242 mm at 300 dpi:
about 2126 × 2860 px, 6.1 million pixels and 24 MB, still under half of what
iOS Safari allows one canvas. A page-tall box from the grey test scan came
out 2014 × 2860 px and about 950 KB (§8.1).

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
- **As built (PR 3):** only the part of a box on its page is drawn
  (`clipToPage`, §4.5). pdf.js does not clip to the CropBox, so a box
  reaching past it, which only a crafted save stores, drew whatever the
  MediaBox holds there: in testing, a box over the left margin of a page
  whose CropBox starts 70 pt in drew 893 red pixels of text outside it, and
  none once clipped. A box wholly off its page drops its pick (§4.4).

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
  One rule for every page is simpler, and a usual worksheet of 5 to 20 crops
  stays well under 25 MB; one of many page-tall scan crops does not (§8.1).

**Memory.** pdf-lib never reads a bank; it loads only the 26 KB template.
Beyond the picked banks, which stay open while the modal is (§4.5), the modal
holds one canvas, the decoded images of the page it is drawing from (released
by `page.cleanup()` after that page's last pick), the held JPEGs (about 4 MB
for 20 picks from a scan, about 19 MB for 20 page-tall ones), and, on
*Download PDF*, the saved file. 20 picks from 20 pages of a 300 ppi colour
scan peaked at about 310 MB in Node with the cleanup and about 750 MB
without it. The largest canvas is the largest box the layout prints, 180 ×
242 mm at 300 dpi (§6.2): about 2126 × 2860 px, or 24 MB of pixels, about a
third of the 4096 × 4096 that iOS Safari allows one canvas.

### 6.4 Where it runs, and why

The PDF is built **in the teacher's browser**.

- **Speed:** 16 questions from a digital bank took 0.6–1.0 s, template and
  save included. From scans, a crop costs about 0.5 s when it is the first
  pick on its page, because pdf.js decodes the whole page image to draw any
  part of it, and about 0.1 s after that. 20 picks from 20 pages of a
  300 ppi colour scan took 9.5–12 s, and 20 from 5 pages took 4–5 s (Node,
  4-core container, §6.3). An iPad is slower, so the modal counts the
  questions as it draws them (§4.4), and §9.2 step 8 times a worksheet on
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
  The first ten banks measured 0.18–1.91 MB, about 1.5 s at 10 Mbps, but
  many banks are far bigger (§9.2.1).
- **The pass bar** (§9.2 step 8): the first page of the largest real scanned
  bank shows in under 10 s on an iPad on home Wi-Fi. At 10 Mbps a bank over
  about 12 MB cannot meet it, so the sample banks' sizes already predict the
  answer, and it is not only scans that fail: many current IM booklets are
  15–35 MB (12–28 s), hl-book-b, a digital biology book, 31 MB (25 s), and
  the AP Statistics textbook bank 15 MB (12 s). The textbook banks in the
  centre's Drive are 15–82 MB. All of these fail on download time alone if
  they are cropped as they are (§9.2.1).
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

**As built (PR 3).** `worksheetName` in `lib/worksheet/layout.ts`: the
course's code when it has one that is not blank, else its name; letters of any
script and decimal digits are kept, and round and square brackets. Downloaded
in the browser as "MathVision Homework IM2T 2026-10-17 2324.pdf", and the toast
read "Downloaded MathVision Homework IM2T 2026-10-17 2324.pdf · 2.5 MB".

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
PDF import takes up to 1,000 pages.

A whole booklet or a finished paper goes the same way, which is how most
homework goes (§1): downloaded from the portal, imported with one page per
board, the owner's choice (§2.1 item 8). A booklet then makes 30–40 boards a
unit. Whether a Space has a board limit, how the boards are named, whether a
reopened Space lands on the last page used, whether it stays smooth on an
iPad, whether a child can write beside a locked packed page, and Pencil's own
size limit for a drag-in are the 10-minute test of §9.2 step 7. In the app,
the homework card still tells the child to "do it on your Homework board";
pointing it at the pages the teacher marked is a change to the app, not to
the portal (§9.4).

## 8. Volume, limits, security, failure modes

### 8.1 Volume

The owner has not given volumes. The design handles the following:

- **Banks:**
  - the first ten banks are 0.18–1.91 MB, 7–25 pages each, with 11–84
    questions. Since then, digital banks have been found up to 35 MB (many
    current IM booklets in the Drive are 15–35 MB, and hl-book-b is 31 MB),
    and answered copier and phone scans up to 26 MB (§9.2.1). The textbook
    banks are 15–82 MB;
  - the largest scanned bank tried (for download time, §6.4) was 200 pages
    and 54 MB. A 300 ppi colour scan measured 0.87 MB a page, so a 200-page
    bank is about 170 MB;
  - on the Supabase Free plan no upload can exceed 50 MB, and on Pro the
    global limit can be raised to 500 GB. The bucket sets no limit of its own
    (`file_size_limit` is null in `20260611000005_storage.sql`), so the
    project's global limit applies. §9.2 step 2 checks the plan. On Free, an
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
  the plan's included egress (Supabase dashboard → Usage) at §9.2 step 2;
  the real sizes are in §9.2.1, and a 31 MB bank is about 3 times the 10 MB
  example.
- **Worksheet:** usually 5 to 20 questions from 1 to 4 banks. Every question
  is a picture (§6.3): about 95 KB from a digital page and 239 KB from the
  4-page, 200 ppi test scan of §6.3, so 20 questions are about 2 MB, or 5 MB
  from scans. A 300 ppi colour scan's crops averaged 198 KB, and its largest
  510 KB.
- **As built (PR 3), the largest crop** is a box the layout prints up to
  180 × 242 mm (§6.2), not 136 mm as planned. A page-tall crop came to about
  0.4 MB from a digital page, 0.95 MB from the grey test scan and 0.8 MB from
  the colour one: five questions of four page-tall boxes made a 20-page
  worksheet of 18.6 MB from the grey scan, and 15.3 MB in 12 s from the
  colour one (Node). So about 27 page-tall crops from the grey scan, or 33
  from the colour one, pass 25 MB, and the modal's warning (§4.4) is what
  says so.
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
  Every crop is a picture of its box alone, and only of its part on the
  page (§6.3), so the file carries nothing of a bank beyond the questions
  picked, wherever it is sent. It is
  never locked, whatever lock the bank had (§2.1 item 14).

### 8.3 Failure modes

| What happens | Result |
|---|---|
| Big scanned bank | Slow first open. The size is shown, and the bank stays open for the tab. §6.4 sets the pass bar and the fallback. |
| A scan stored as JBIG2, JPEG 2000 or CCITT (common from office copiers and iLovePDF merges) | Without `wasmUrl` it renders **blank**, with only a console warning: pdfjs-dist 6.4.299 decodes both JBIG2 and CCITT through `jbig2.wasm`, with no fallback. Confirmed on real files (§9.2.1). The `postinstall` copy and the check before a bank opens (as built, below) prevent it. |
| A bank converted to PDF by something other than Word | Its maths can be missing: LibreOffice without its maths module dropped every equation and moved pages, and exited 0 (§9.2.1). Banks are exported from Word itself (§2.1 item 19). |
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
| A picked question's bank went to Trash, or the crop was deleted | The modal drops it from the picks and says how many were removed, also when every pick is gone (§4.4). |
| A tab's picks edited by hand (not question ids) | Dropped like a deleted question; the rest are made (§4.4). |
| More than 200 picks | Refused with how many there are and where to un-pick them, and no *Try again* (§4.4). |
| A bank's bytes are replaced in Storage under the same name | Every crop points at different content. §9.4 item 4. |
| A box saved on a page past the bank's end (only by a crafted call) | The page view ignores it, and the modal drops its pick as removed (§4.3, §4.4). |
| A box reaching past its page's CropBox (only by a crafted call) | Only its part on the page is drawn; a box wholly off its page drops its pick as removed (§6.3, §4.4). |
| A bank fails to download or draw while the modal prepares | No PDF; the error names the bank, *Try again* opens it afresh, and *Remove its picks* makes the worksheet from the other banks (§4.4). |
| A bank's file name has characters Helvetica cannot draw | They are replaced in its source line; compose never throws on one (§6.1). |
| The worksheet template cannot be fetched | No PDF; an error toast says why. The templates are in git, under `public/worksheet/`. |
| A project's max rows is below what a read returns | Every worksheet read goes a range at a time, so nothing is cut short (§3.5). |

**As built (PR 2).**

- **The decoders.** A bank opens only if `/pdfjs/version.json` matches the
  worker and the three decoders under `/pdfjs/wasm/` answer; otherwise the
  card reads "This site's PDF reader is incomplete: its files under /pdfjs/
  are missing, unreachable or from another version …", with *Try again*. A
  folder blocked or unreachable while `version.json` loads used to draw
  CCITT pages white and JBIG2 pages without their text, with nothing on
  screen.
- **A decoder that fails later**, after that check passed: pdf.js keeps the
  failure for the life of the bank's worker, so every such page of the bank
  stays blank until the bank is opened again. A page with an image that did
  not decode (pdf.js hands it over as nothing) reads "Part of p. 3 didn't
  draw: an image on it couldn't be decoded, …", and *Try again* closes the
  bank and opens it in a new worker. Not caught: a JBIG2 *image mask* (text
  stamped over a background) whose decoder fails, since pdf.js then drops
  the drawing command in its worker and tells the page nothing, and ICC
  colours if `qcms_bg.wasm` fails. Both need the decoder's fetch to fail
  after the check passed, when the worker first meets such an image;
  reloading the tab cures them.
- **Two in-charges crop the same page at once.** A box both saved is
  "Cropped twice" with *Delete one* (§4.3), and the next box drawn is never
  put under it.

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
It needs `psql`, a local Postgres 16, Node 22.18 or newer and `npm install`
(the last two steps run in Node, which strips the types of the `.ts` files
they import, and `worksheet.mjs` reads `pdf-lib` from `node_modules`). It:

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

**As built (PR 2).** `run.sh` then runs `supabase/tests/crops.mjs` in Node
(22.18 or newer, which strips TypeScript's types itself), against the same
scratch database. Each step edits the screen's state with the functions the
page view calls (`lib/worksheet/crops.ts`), sends the one call `diff()` builds
to the real `save_crops` as an in-charge, reads the bank back as the page view
does, and checks that the bank is what the screen showed, with nothing left to
save and every question's boxes numbered 1..n. Its 17 checks: new questions
with their reading order; a stimulus copied into new questions, put above a
saved one, moved and deleted; a box moved and topics changed and cleared; a
question continued onto page 2; a page's reading order saved as `{id, pos}`;
stale screens refused with `42501` and `23505`, writing nothing; a question
deleted over two pages; a box cropped twice and one copy deleted; four boxes
at most; a saved box made a stimulus; what a save keeps in hand; reading
order (two columns, a grid, two columns whose rows line up, a gutter
narrower than 1% of the page, a box across the gutter, one box a side, a
rotated page); a question's own box deleted under a shared stimulus; and a
teacher reading what the in-charge saved.

**As built (every kind of suggestion).** `crops.mjs` gains three checks, 20
in all, each accepting the finder's suggestions for pp. 5–8 with
`acceptOffers` as the page view does and saving through the real
`save_crops`: a continuation accepted onto the saved question it continues,
the last of two numbered alike on its page, sent as `[{id}, its box]`, and
one whose question is not cropped left untaken; a stem accepted above two
saved questions (edits with the stem in front, no id) and a question on the
next page accepted under it (an add), the stem box 1 of all three with the
same numbers, and a stem naming the one below it of two questions numbered
alike; and four boxes at most, where a continuation onto a full question
changes nothing on screen, a stem goes above only the questions with room,
and `save_crops` refuses a fifth box sent anyway (23514), writing nothing.
Against seven breakages of `crops.ts` (a continuation naming the first of
two alike, a stem ignoring its column, no `stimuliOver`, no four-box check on
a continuation, a full question not reported, an uncropped continuation taken
as a question, `questionAt` ignoring the page) it failed on every one.

**As built (PR 3).** `run.sh` then runs `supabase/tests/worksheet.mjs`, which
needs no database: the layout of `lib/worksheet/layout.ts`, boxes in and
positions out on the templates' page, and the source line in pdf-lib's own
Helvetica. Its 14 checks: a one-box question; a narrow box at 1.25 at most; two
short questions sharing a page, and 74 mm exactly being short; a four-box
question over a page break, never shrunk; a last box moved on so its source
line fits; a box wider than 180 mm; a question nearly a page tall at its
width's scale, as is one 20 pt taller that flows; a box taller than a page,
alone and at 81% or more; 400 random worksheets, every box and line inside the
content area, in order, never overlapping, and at their width's scale unless
a box is taller than a page; the source line for one page, two pages and pages
apart; a non-WinAnsi file name keeping the accents WinAnsi has, and every
character of the Basic Multilingual Plane encoding in Helvetica after
`winAnsi`; a name too long for 180 mm; the file name; and print order, a
stimulus's questions by their second box. Against 14 deliberate breakages of
the layout (the cap, the line's room, the pairing, the 74 mm, the flow, the
tall box, the replacement, page order, the 1.25, the 2 mm gap, the cut, the
order, the name's characters, the midpoint) it failed on every one; after
review, also on the 0.55 cap put back as a shrink, on accents all stripped,
and on "Đ" left to "?".

**After the review of the finished branch.** `crops.mjs` has 21 checks.
The new one accepts continuations out of order, box 3 before box 2, on a
saved question and in two columns of one page, and expects the bank's
order; on the code before the fix it failed, saving pp. 9, 11, 10. The
reading-order check now takes real pages' boxes: lists numbered down two
columns whose rows line up (the fluency sheet, IGCSE CIM Book 1 p. 89),
questions two to a row (p. 31), three columns (p. 18), bands under a stem
and a wide question (p. 89), a long line across a gutter (p. 18's Q41 as
v2.2 drew it) and a grid row over a column (unit2-s3 p. 5); the code before
the fix failed four of these. `worksheet.mjs` has 15: a stimulus and its question that fit a
page at the bank's size print on one page at the largest scale that fits
(Chap10 warm-up 2's stem and Q4), the random worksheets check that a
question is shrunk to fit only down to the bank's size, and the last box
moved on for its source line is now a question wider than 180 mm, which
does not fit a page at the bank's size either.

**Manual checks:**

- the §5.1 rules on the test banks and on 20 real pages;
- `pdftotext`, `pdffonts` and `pdfimages -list` on a worksheet: the only
  text is the template's words and one source line per question, the only
  fonts the template's and the source lines' Helvetica, and each crop is one
  JPEG at 300 dpi of its printed size;
- a crop from a test bank whose Answers layer is off for viewing and on for
  printing (`layered.pdf` from `docs/worksheets/raster/make-banks.py`) comes
  out without the answers;
- a worksheet page overlaid on the template PDF: identical by construction,
  so this checks only where the crops sit.

**As built (PR 3), the manual checks run:**

- **In Node,** with the repo's `compose.ts` and `layout.ts` on pdfjs-dist
  6.4.299 and `@napi-rs/canvas`, as the modal makes one: 14 questions from
  `make-banks.py`'s digital and scanned banks and from "U4 BOOKLET WORKSHEET 1
  (L1-8)", one of the centre's banks, read as data. They included a four-box
  question over three bank pages, two questions under one stimulus, short
  pairs, a question over pp. 12–13, and a box of a whole page. 20 boxes, 12
  pages, 2.6 MB, 2.3 s with the banks' opening; made again after review
  without the cap (§6.2), 2.7 MB and 1.8 s, the pp. 12–13 question at 1.04
  where it had printed at 0.71. Both times `pdftotext` printed
  "HOMEWORK" and "MathVision" on each page and the 14 source lines, nothing
  else; `pdffonts` the template's five Inter Type 3 fonts and Helvetica;
  `pdfimages -list` the template's own mark (one image and its soft mask,
  drawn on every page) and 20 JPEGs, every one 300 × 300 ppi.
- **In a browser,** through the crop screen's scratch harness (PostgREST with
  `db-max-rows = 3`, banks served locally): a teacher opened Questions from
  the course header, filtered by a topic into the page view, picked two
  questions by clicking their boxes and had eleven more in the tab, one
  pick of a question that no longer exists among them. The modal dropped it
  with its line, drew 19 boxes from three banks in 3.5 s, and downloaded
  "MathVision Homework IM2T 2026-10-17 2324.pdf", 2.5 MB, 11 pages, which
  passed the same three checks: 13 source lines for 13 questions, 19 JPEGs at
  300 ppi. Also checked there: a pick removed in the modal, the Lesson label,
  Cancel while drawing, the Questions page's own picks bar, a bank whose
  download fails (named, *Try again* recovers), the modal at 390 px wide, and
  the manager's line on a bank students can see.
- **After review,** each fix replayed the way its finding was reproduced. In
  Node: the ws5 pair of §6.2 printed at 0.602 and 1.040 before and 1.059 and
  1.040 after; a box over the left margin of a page whose CropBox starts
  70 pt in drew 893 red pixels from outside it before and none after, and a
  box wholly off the page reads as no size, so its pick is dropped;
  `preparePicks` called as a teacher against PostgREST, with Storage's
  refusal of an empty list stood in, signed `[]` and failed before, and now
  returns every pick as missing without signing; a pick that is not a
  question id, or an upper-case one, comes back missing instead of refusing
  the set or printing while also being removed. In the browser harness, its
  signing stand-in now refusing an empty list as Storage does: a bank that
  is not a PDF, and one whose download keeps failing, each offered *Remove
  its pick*, after which the other banks' picks were made and the tab kept
  only theirs; two picks of gone questions were removed with their line;
  two bad strings among the picks were removed and the good one made; 201
  picks read "… and 201 are picked …" with no *Try again*; two picks
  removed while drawing brought "Drawing question 1 of 4…" beside "4
  questions on 16 pages"; Esc closing the modal kept the in-charge's
  selection (and Esc with no modal still lets it go); and the back link from
  a page view opened at a topic went to Questions at that topic, and to Any
  topic once that was chosen there.

**As built (every kind of suggestion), in the browser.** Through the crop
screen's scratch harness (PostgREST, the banks served locally and read as
data, Chromium at 900 × 1400), as an in-charge, with a screenshot of each
state:

- **hl-book-b** (87 pages, 31 MB; suggestions in 12.5 s from opening): p. 3's
  eight dashed boxes, the continuation tagged "? continues Q7" with its
  reason as its tooltip, and *Accept all (7)* leaving it. Clicked before
  question 7 was cropped: "Continues question 7 on p. 2, which isn't cropped
  yet", *Accept as a question*, *Skip*. After p. 2's *Accept all*: *Add as box
  2*, then "Question · 2 boxes · starts on p. 2", saved as one question on
  pp. 2–3.
- **3741 DBQ Cells** (64 pages): the banner "This file has answers on pp.
  45–64. …"; question 2 on p. 28 and its three continuations added as boxes
  2–4 on pp. 29–31, the toolbar at "Four boxes at most", saved as one
  question; question 1 brought to four boxes by hand, so that its p. 8
  continuation read "which has four boxes already", and *Skip* hid it;
  p. 50, "This page is answers: nothing is suggested on it. …".
- **IB HL AA book 2**, p. 26: the stem tagged "above Q1–2", and question 1
  with an amber "?" ("an image spans this box and the next"), which asked
  first; the stem accepted ("The stimulus is above 0 questions. 2 more go
  under it when accepted."), *Accept all (5)*, then question 1 by *Accept*:
  six questions saved, questions 1 and 2 each with the stem as box 1, the
  same numbers in both.
- **Accel Bio unit 1**, p. 4: the context "Model 2 - Animal and Plant Cells"
  tagged "above Q7–12", accepted, then *Accept all (6)*: six questions, each
  with it as box 1.
- **An answer key** (a chemistry MCQ warm-up's): the banner, "Nothing is
  suggested on an answer key. …", no dashed box, and a box drawn by hand.
- **A blank page and a scanned page** (pp. 2 and 4 of a business studies
  booklet), and **a page the reader could not draw**, made for the check
  (a page-size JPEG of random bytes; no corpus bank has one): its line sat
  beside §8.3's "Part of p. 1 didn't draw".

No page logged a console error.

### 9.2 Rollout

**Done.** The owner answered the plan's questions and settled how the tool is
used (§2.1); the sample banks were measured, the centre's Drive folders among
them (§9.2.1); teachers can download (d71febe, merged); and PRs 1–3 are built
on this branch, with finder v2.2's suggestions (§3, §4, §5.1, §6). The
unmerged branch `claude/awesome-bell-udvk0q` also edits `proxy.ts`, as PRs 2
and 3 do: whichever lands second merges the other first.

**Left, for the owner, in this order:**

1. **Apply the migration by pasting it.** Paste
   `supabase/migrations/20261017000009_questions.sql` into the Supabase SQL
   editor and run it, *before* this branch merges: Vercel deploys the app
   only, never the database, and the app reads the new tables at once. Not
   `supabase db push`, unless `supabase migration list` shows every earlier
   migration applied on the remote: on a project set up by pasting, a push
   replays them all, and `20260612000006` then approves every pending
   signup. `DEPLOYMENT.md` §2 says how to repair the history first. The
   migration can be run twice. Then merge; the portal deploys from its
   default branch.
2. **Check the Supabase plan's upload limit.** On Free no upload can exceed
   50 MB (§8.1). The largest booklets are 35 MB, under it; on Free, the
   textbook banks of 53–82 MB are split by unit or chapter before upload,
   and each part is its own bank.
3. **Create the bank-holding courses** (an admin, §2.1 items 10 and 17): one
   for IM2 with Geometry/IM2, one for IM3 with Algebra 2 Trig, and one for
   each other level or subject whose banks are kept from year to year. Add
   that year's teachers of the level as teacher and the people who crop as
   in_charge.
4. **Add each course's topics** with the snippet in `DEPLOYMENT.md` step 8,
   from the owner's list (§2.1 item 12). Until a course has topics, its
   topic pickers stay hidden. A suggestion, for the owner to take or leave:
   a level's topics are its booklets' lessons ("U4 L5 Vertex form"), so the
   Topic filter reads as the lesson just taught.
5. **Upload with *Upload a folder*,** one unit tree at a time, into
   teacher-only folders of the bank-holding course. It keeps the unit
   folders; *Import from Google Drive* puts every file in one flat folder
   (`lib/upload/drive.ts` keeps only the file's name). The uploader skips
   Word files and anything else that is not a PDF. Leave out the archive and
   OLD folders, and any child's own work (§2.3). A bank already in a class's
   course is uploaded again here, because the app cannot move a file between
   courses (§3.2).
6. **Make clean copies** of the files with answers inside them (§2.1 item
   16): remove the answer pages and upload the result beside the original,
   as "… (student).pdf". The crop screen names a file's answer pages in its
   banner (§4.3), which serves as the checklist; in the samples, the finder
   read answer pages inside 88 of the 219 files and 43 more as answer keys
   (§9.2.1). After that, an in-charge crops a bank the first time a teacher
   needs questions from it (§2.1 item 15).
7. **The 10-minute Pencil test.** Import one real booklet into the demo
   Space with one page per board, and on an iPad:
   - see whether the Space has a board limit. A booklet makes 30–40 boards,
     so a year of units could be about 250 in one Space. If there is a
     limit, how old boards are cleared becomes a question for the owner;
   - see how the imported boards are named: by file name, by the PDF's
     Title or by number. By name or Title, §6.5's name is what teachers see;
   - close the Space, reopen it, and see whether it lands on the last page
     used, which is where the child should find the lesson's questions;
   - flip through the pages and write on them: does it stay smooth?
   - import a packed page (a Biology Book B page), lock it, and do a
     question's working beside it. If that is comfortable, packed banks need
     cropping less often;
   - drop in a worksheet over 25 MB: if Pencil refuses a smaller one than
     that, the modal's warning (§4.4) moves to Pencil's limit.
8. **The browser checks,** on a real iPad on home Wi-Fi: the first page of
   the largest real scanned bank in under 10 s (§6.4, with its fallback if
   it fails), then a worksheet of 20 picks from 20 different pages of it,
   timed, which replaces §6.4's Node figures (over 60 s, take §6.4's
   fallback); 40 pages of the largest scan flipped through with Safari's
   Web Inspector open, memory staying flat (§4.5); and a page of Mental
   Arithmetic 4, whose 600 ppi pages decode to 34.85 million pixels, about
   twice what iOS Safari allows one canvas, so pdf.js must shrink each
   image. The Supabase project's own timings of §3.5's reads, with a seeded
   course of 25,000 crops, belong here too.

Each new year, each bank-holding course's in_charge updates its teachers on
its People page, and nothing else changes (§2.1 item 10).

**Later, only if wanted: AI** (§2.1 items 9 and 18, §5.2). Scanned question
pages do exist (§9.2.1), so this is not ruled out, but it is not needed for
the banks the owner's answers leave to be cropped. If it is wanted:

- run the measurement in §5.2, on scanned pages that are question pages
  (not the answered chemistry scans), including a 36-question test page and
  a phone photo;
- if a pair reaches 98%, set `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` and, if
  measured, `ANTHROPIC_EFFORT` in Vercel, for Production and Preview, then
  redeploy;
- PR 4 adds the route and the button. If no pair reaches 98%, there is no
  PR 4.

### 9.2.1 What the sample banks showed (2026-10-17 and 18)

The owner shared the centre's Drive folder of course material. Ten banks from
it were measured with v1 of `docs/worksheets/textlayer/propose.mjs` (the file
before finder v2.2, in git). The first five tuned §5.1's rules. The second
five were held out, run once untouched, and then fixed where they failed. The
banks themselves are not in the repository.

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
  MS file, as worked solutions. Seven of the ten also end with a short
  answer list under "Answers", where the suggestions stop (§5.1, answers);
  the two past-paper banks and PCS Exponential have none.
  The in-charge crops from the bank, not from its MS. Other subjects bind
  their answers into the file far more often (below).
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
  495, 10 boxes to trim, and 12 false proposals; 5 more boxes were later
  found cut by the footer band.
- **Questions needing more than one box: 80 of 495 (16%).** This decides
  §2.2 for several boxes.
  - Printed above, 65: 60 are a problem set's instruction, printed once
    over a table of bare expressions. It always sits directly under the
    problem set's heading and above its first number. The other 5 sit under
    a figure or table "above". Finder v2.2 proposes 3 stems on the ten
    banks, over 39 questions: R53 instruction blocks over unit2-s3's two
    problem sets (13 and 18 questions) and an R52 line over 8 in unit3-s1.
    AP CAL Unit 10's "Problem Set 10-1 (Improper Integral)" instruction, over
    23 questions, gets none and is drawn by hand (§5.1).
  - Over a page, 15: 9 of the past papers' 28 free-response questions, which
    run over as many as four pages, and 6 long examples or pages of graphs
    that run onto the next page.
- **Compose** (§6.4), in Node at 300 dpi from these banks, with the proposed
  boxes: 20 picks took 1.4 s (1.2 MB) from AP CAL Unit 2 and 2.2 s (2.8 MB)
  from PCS Exponential. 16 past-paper picks took 1.7 s (5.6 MB).

**Across subjects (2026-10-17 and 18).** Twenty bank checks then took in the
rest of the material the owner shared, and three rounds of rule fixes followed
(finder v2, v2.1 and v2.2), each run on every file and checked by eye on the
pages it changed, or on a sample of them where a group had over 300, and in
maths with an ink audit of every changed box. The banks are named below as the
measurements named them, and none of them is in the repository. 219 PDFs,
3,909 pages:

| Group | Files | What they are |
|---|---|---|
| Maths, Drive | 33 | 16 IM2, IM3, Algebra 2 Trig and Geometry/IM2 samples (booklets, exemplary sets, mocks, basic tests); the AP Statistics Unit 1 textbook bank; 16 primary and middle-school books (drill books, workbooks, Math Fluency sheets) |
| Maths, Word books | 22 | 4 IB HL AA books (Blue, Black, Yellow, Green), 8 chapter books (606, 609, 610, 209, 214–217), 2 IGCSE CIM books, 7 WPS BG books, the AMO 2016–2018 contest booklet |
| Biology | 19 | 7 IB DBQ and EBQ booklets (3741–3748), IB HL Book B (hl-book-b), Accel Bio unit 1, Word worksheets, a quiz, a mock, mark schemes |
| Chemistry | 72 | AP, Regular and XL: 8 blank question sources; the rest keys, teacher editions, worked solutions and 18 scans |
| Economics and business | 59 | AP Micro and Macro banks, CIE AS, IGCSE and IB banks and Paper 2 sheets, business banks and booklets, a phone scan |
| Others | 14 | the ten banks above, one of their mark schemes, 2 duplicate biology uploads, a biology summative |

**Finished papers and banks.** The inventory of the four maths Drive folders
(IM2, IM3, Algebra 2 Trig, Geometry/IM2) counted 663 finished-paper PDFs,
though its per-course counts (171, 143, 186 and 174) add to 674: basic tests
and Test Your Basics, mocks, summatives, semester papers, skip tests,
formatives and speed math, nearly all with a "… MS" key, in numbered series
(QUADRATIC FUNCTION 1–5, SIMILARITY 1–7, TEST YOUR BASICS 1–27). About 300
files are banks: booklets, older units' worksheets, exemplary sets, extra
practice and the topic-wise semester papers. The basic tests are already
built from their booklet's questions (QUADRATIC FUNCTION 1 is booklet L2 Q2,
L3 Q4 and L5 Q1 with the numbers changed, and others). Elsewhere: 8 of the
19 biology files are finished papers, holding 305 of the 692 questions
checked; 12 of the 59 economics and business files are, with 46 banks and
one child's homework; and only 8 of the 72 chemistry files are blank
question sources at all. These figures are what §2.1 item 15 rests on.

**How each figure was got.** A *found* question has a question box starting
at it; *right* and *trim* split the found boxes by whether one needs an edge
moved; *wrong* is a box that is not a question (in economics also one that
cuts a line or merges two); *missed* is a question with no box.

- **Word books:** the truth is Word's own list numbering, read from each
  `.docx` by scripts that follow Word's numbering rules and checked against
  the printed labels and the keys: 4,560 questions in the 14 IB, chapter
  and CIM books. Right and trim come from an ink audit at 144 dpi: a box is
  a trim if a run of ink crosses one of its edges (page-long rules masked)
  or it covers more than 30% of another question's box. The PDFs measured
  were made from the `.docx` by LibreOffice without its maths module, which
  dropped every equation and moved pages by up to 25%, so these figures show
  which rules break, not the rate on the centre's own exports from Word.
- **Math Fluency G6–G8:** the 1,060 "N)" labels of the text layer, with the
  same ink audit.
- **Chemistry:** the 7 MCQ papers scored against the item lists of their
  paired answer keys, 206 items. Its 2 wrong are found boxes counted wrong,
  not false proposals: both are in the chap8 warm-up 1 paper, whose items
  21 and 22 each hold four MCQs (its key gives each four answers). So in
  this row right, trim and wrong add up to found.
- **Biology:** the question-start lines in each file's label column of the
  text layer, on digital pages that are not answers, in 16 files: 863
  labels. Right, trim and wrong by eye.
- **Economics and business:** eye counts, 1,918 questions on the 709 pages
  checked.
- **The maths Drive samples:** eye counts, 435 question starts on the
  digital files, counting question boxes only.

| Group (truth) | Questions | v1: found / right / trim / wrong / missed | v2.2: found / right / trim / wrong / missed |
|---|---|---|---|
| Maths Word books (Word numbering) | 4,560 | 4,261 / 3,638 / 623 / 1,654 / 299 | 4,483 / 4,324 / 159 / 44 / 77 |
| Math Fluency G6–G8 (text-layer labels) | 1,060 | 1,050 / 575 / 475 / 0 / 10 | 1,050 / 1,049 / 1 / 0 / 10 |
| Chemistry MCQ papers (answer keys) | 206 | 206 / 201 / 3 / 2 / 0 | 206 / 204 / 0 / 2 / 0 |
| Biology (label columns; boxes by eye) | 863 | 306 / about 294 / 7 / 54 / 557 | 861 / about 859 / 2 / 0 / 2 |
| Economics and business (eye) | 1,918 | – / 1,711 / 94 / 305 / 82 | – / 1,855 / 0 / 0 / 63 |
| Maths Drive samples, digital (eye) | 435 | 418 / – / – / 0 / 17 | 435 / – / – / 0 / 0 |

- **What moved most.** In the Word books, false proposals fell from 1,654 to
  44, mostly the answer pages of the CIM books and 215 and the IB books' front
  matter (R8, R9); in the IB and CIM books, headings inside question boxes
  fell from 163 to 8 (R29). In the fluency sheets, trims fell from 475 to 1, most of them the page border
  or a drawn divider taken into a box (R44, R40). In biology, the hanging
  labels of the DBQ booklets and hl-book-b (R24, R25) took found from 306 to
  861. In economics, the 272 mark-scheme entries proposed as questions went
  (R9), and no bottom now slices a line (R42; 12 under v1). In the maths Drive
  samples, the 17 misses were a test header taken for a cover (R7), lone
  labels under a heading (R30) and a split label (R16).
- **What v2.2 adds.** 478 continuations, 88 stems and 14 contexts across
  the 219, and 533 boxes with a "?" (1,132 with R67 and R68, added after
  review, §5.1). In maths, 35 of the 37 continuations
  v2.2 added over v2.1 were right; in biology and chemistry 115 of 123
  continuation boxes were right, and the 8 wrong are all in one mark scheme
  the finder does not read as answers; on the IB DBQ booklets 78 of the 109
  pages that need one get one. In economics all 62 continuations were exact
  and 23 are still missing, and of 64 stems 3 leave out part of what they
  serve. No false stem was left in science (v2 had 27).
- **Page kinds**, under v2.2: 3,202 pages digital, 629 scanned, 62 blank and
  16 none; 941 are marked answers. No page failed to draw.
- **Answer files.** 43 files read as answer keys and propose nothing, all
  chemistry: letter keys, teacher editions and worked solutions; on the
  files R10 reads as keys, v1 had proposed 511 boxes. By the finder's
  reading, 88 more have answer pages among their question pages: 53 of the
  59 economics and business files, 16 of the 22 maths Word books, 10 of the
  19 biology files, 7 of the first ten banks (their short answer lists),
  and Book No. 5004 and 5043, which append a mark scheme with no heading
  (R15). They are the clean copies of §2.1 item 16. In the maths Drive
  folders keys are separate "MS" PDFs instead (IM2 293, IM3 244, Algebra 2
  Trig 233, Geometry/IM2 208), many of them handwritten worked solutions,
  and some summatives print answers at the end (IM2 U4 SUMMATIVE 1).
- **Teacher editions.** 14 chemistry files print every question with its
  correct option in bold, 368 questions. Rasterising a crop hides nothing
  there, because the answer is the ink, so any crop gives it away; v2.2
  reads them as answer keys (R10). Of the 72 chemistry uploads only 8 are
  blank question sources, so most of chemistry is not cropped until blank
  originals are uploaded. Answers can also live only in annotations: Ink
  annotations answer FRQ 2(d) on p. 4 of an acid-base equilibria pack, and
  pdf.js draws them, so a crop shows them as the page view does.
- **Scanned banks exist,** which the first ten did not show:
  - IM3 U1 EXEMPLARY SET 1 and U1 SOLID GEOMETRY 5 (a basic test) are
    office-copier scans; the Drive also holds handwritten scans among the
    IM2 U4 exemplary worksheets, the U6 and U8 extra practice and Geometry
    Cond Prob extra practice SET 1. Drawn by hand, a set takes an estimated
    1–2.5 minutes;
  - the primary drill books, Book No. 2, Mental Arithmetic 2–5 and the two
    Primary 1 workbook units, are scans throughout. They are finished books,
    sent whole;
  - the AP Statistics Unit 1 textbook bank: 27 of its 39 pages are 300 ppi
    images rasterised from the digital book, holding 163 of its 244
    exercises;
  - the AMO 2016–2018 Grade 8 booklet is a 72-page office scan, 68 pages
    scanned and 4 blank, with 150 questions: by hand about 20–25 minutes;
  - BG-05 is pasted textbook pages, 10 of its 11 pages pictures;
  - all 18 chemistry scans are already answered, 7 of them a child's own
    work, and the one economics scan is a child's homework;
  - inside digital banks, pasted screenshots carry 47 economics questions
    (College Board FRQs, textbook MCQ strips) and some biology questions.
- **Codecs and the wasm requirement.** Word, Quartz and Google Docs exports
  hold only Flate and JPEG images. The scans add CCITT (Mental Arithmetic
  2–4 at 600 ppi from a Fuji Xerox copier, Book No. 2, Mental Arithmetic 5
  and the AMO booklet at 200 ppi), JBIG2 (the IM3 U1 sets, a 100 ppi JPEG
  under 200 ppi JBIG2 text, and iLovePDF merges of chemistry scans), CMYK
  JPEG (the AP Statistics textbook, which needs `iccUrl`) and phone photos,
  as JPEG from CamScanner or lossless Flate from iOS at 3.15–6.6 MB a page.
  pdfjs-dist 6.4.299 decodes JBIG2 and CCITT through `jbig2.wasm`, and loads
  its fallback from `wasmUrl` too, so without it there is none: every page
  of Mental Arithmetic 4 drew blank, the AMO booklet drew white on all 72
  (R6 reads them render-failed), and on an iLovePDF page only the JBIG2 text
  vanished, so the page looked normal. `render()` resolves, nothing throws,
  and at verbosity 0 nothing is logged. The `postinstall` copy of `wasm/`
  and the check before a bank opens (§4.5, §8.3) are what prevent it.
- **File sizes against the pass bar** (§6.4: about 12 MB at 10 Mbps for
  10 s). Under it: the economics and business banks (0.07–2.53 MB), the
  sampled IM, Algebra 2 Trig and Geometry files (0.04–1.12 MB), the primary
  books (0.39–2.64 MB, and the 600 ppi Mental Arithmetic scans 7.2–7.7 MB),
  the BG books (1.16–4.57 MB), the AMO booklet (0.61 MB) and every digital
  chemistry file (3.9 MB or less). Over it, on download alone:
  - many current IM booklets in the Drive, 15–35 MB (IM2 U7 and U8
    WORKSHEET 1 at 31 and 35 MB, IM3 U1 booklets 21–35 MB, Geometry Cond
    Prob L1–L6 33.6 MB), 12–28 s;
  - hl-book-b, a digital Google Docs export of 31.1 MB with 167 figures at a
    median 260 ppi, about 25 s; 3741, at 9.82 MB, is close;
  - the AP Statistics textbook bank, 14.96 MB, 12.0 s, 96% of it the image
    pages' JPEGs;
  - five answered chemistry scans, 12.4–26.4 MB.

  So §6.4's range-request trial or its stored-picture fallback is needed for
  current booklets, not only textbooks, if the iPad test (§9.2 step 8)
  fails. A cheaper first step for a big digital bank is to re-save it with
  its images at about 200 ppi before upload, which lowers the crops' quality
  and so is the owner's call, never done silently.
- **Effort, estimated** (nothing has been timed; per-action rates from the
  AP banks plus the defects found on the samples, before v2's fixes):
  - an in-charge cropping a booklet of 32–39 pages and 67–100 questions:
    about 6–17 minutes (IM2 U4 6.3–14.8, IM3 U4 A 7.2–16.2, Algebra 2 Trig
    U5 7.4–16.8, Geometry L11–L19 5.8–14.0); an exemplary set 1–2.5
    minutes; a whole course at once 3–9 hours, which is why cropping is on
    demand (§2.1 item 15);
  - a teacher making a custom 10-question sheet: about 1.5–10 minutes, most
    of it choosing the questions (20 s to 5 minutes), with 35–120 s in the
    portal, because ten consecutive booklet questions span a median of 4–5
    pages, and up to about 3 minutes importing it one page per board; 20
    questions 2–17 minutes; the same PDF to another child 20–115 s;
  - a finished paper: about 35–90 seconds and 12 clicks, nothing to build.

  A custom sheet has no key of its own: marking finds each question in its
  bank's mark scheme, which the source line (§6.1) makes possible, and
  printed numbers can repeat within a file (38–40 twice in the IM3 and
  Algebra 2 Trig exponential booklet).
- **Duplicates.** The same booklet sits in two levels (IM3 U4 and Algebra 2
  Trig U5 WORKSHEET A differ only in the cover, 377,753 against 377,848
  bytes); Algebra 2 Trig copies TEST YOUR BASICS 20–27 into its unit
  folders, about 60 duplicate files; nine chemistry files are uploaded two
  or three times, byte for byte; two economics books exist in a 2019 and a
  2025 edition, numbered differently. Crops belong to one file, so a
  duplicate is cropped again (§9.4).
- **Word and conversion.** A Word file printed to PDF through macOS Quartz
  garbles Cambria Math in the text layer, but never a label; Word's own Save
  as PDF extracts it readably. LibreOffice without its maths module dropped
  every equation in all 14 Word books and still exited 0, and its pages
  drifted by up to 25% (Blue: 128 pages against Word's 103). So banks are
  exported from Word itself, and the app never converts one (§2.1 item 19).
- **Not measured:**
  - the Word books as the centre exports them from Word: the figures above
    are from LibreOffice's PDFs, and §5.1 has not been re-scored on Word's
    own;
  - the textbook banks over the Drive connector's 10 MB limit, such as
    "Question Bank - Unit 5 and 6 (Textbook only)", 15–82 MB. Whether they
    are scans decides, for them, whether the AI step is worth building
    (§9.2, later), and on Supabase Free the 53–82 MB ones must be split
    (§8.1);
  - how often two in-charges crop one bank at once;
  - the Supabase, Pencil and iPad checks of §9.2 steps 2, 7 and 8, which
    need the owner's project, accounts and devices.

### 9.3 Out of scope

Not built, each for the reason given:

- **the AI step** for scanned pages (§5.2): designed, left out by the
  owner's small build, and not needed for the banks left to crop (§9.2,
  later);
- **saved sets**, a teacher's picks kept as a named worksheet
  (`worksheets` and `worksheet_items`, drafted and tested, about 1.5–2 days):
  a kept PDF, or one uploaded into the unit's folder, already does it
  (§2.2). File as an issue, to build only if the same custom sheet is seen
  going to several children;
- **reading Word files**: no `.docx` is read, counted or converted in the
  app (§2.1 item 19). A per-section question count read from an uploaded
  `.docx`, to catch misses, is an issue to revisit only if misses go
  unnoticed in use;
- **the finder rules left out** (§5.1, not built): R28, R54–R57, R53's form
  iii and R58–R66;
- **a "Ready to send" flag** for finished papers: teachers download every
  file they can open (§2.1 item 8);
- **cleaning a file in the app**: clean copies are made by an in-charge
  before upload (§2.1 item 16); the app only says where the answers are;
- pushing anything into Pencil, or putting worksheets in Pencil Files;
- automatic marking;
- answer keys and worked solutions, unless the owner asks;
- history, or a record of which child got what. Under current RLS a teacher
  cannot even read the course's student list, and the report's Homework
  line is the record (§1);
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
7. **`README.md` has stale lines.** Its project structure leaves out
   `lib/worksheet/`, `components/questions/`, the Questions routes and
   `docs/`, and calls `app/actions/` "the API surface (§8)", a section the
   README does not have. (*Local development* step 2 offered `supabase db
   push` beside pasting `supabase/schema.sql`, which `DEPLOYMENT.md` §2 warns
   against on a project set up by pasting, since a push replays
   `20260612000006`, which approves every pending signup. This branch points
   it at that warning.)
8. **Duplicate files are cropped twice.** Crops belong to one file, and
   nothing notices a file uploaded again: the same booklet in two levels
   (IM3 U4 and Algebra 2 Trig U5 WORKSHEET A), TEST YOUR BASICS 20–27
   copied into Algebra 2 Trig's unit folders, nine chemistry files uploaded
   two or three times, byte for byte, and two editions of economics books
   6250 and 6251 (§9.2.1). The shared bank-holding courses (§2.1 item 17)
   remove the first; a content hash at upload, with "matches … on 34 of 40
   pages" for a near-copy, would catch the rest. The same question can also
   repeat inside one file (the AMO practice sets repeat at least 9 contest
   questions), and a teacher can then pick it twice.
9. **The app's homework wording assumes one Homework board.** mv-app's
   homework card says "do it on your Homework board in Pencil" and the
   parent's progress card "Homework board open until …", but booklets and
   worksheets now go in one page per board (§2.1 item 8, §7). Both should
   point at the pages the teacher marked: an app change, which reaches
   families only with an OTA update.
10. **Errors in the source banks,** for whoever owns them: the IGCSE CIM
    Book 2 Statistics key lists 29 and 32 answers for 26 and 28 questions;
    BG-05's key is offset by eight; the chemistry Warm-Up #3 key is the #1
    key in both chap1 and chap2; Grill 5's key leaves FRQ 2 empty; and in
    economics, obap-unit04 Q31's options D–E come from another question and
    qb-6250's FRQ 7 mark scheme scores parts the question does not have.

---

*Evidence.* The research, the RLS probe and the compose tests ran on
2026-10-17, and the finder's measurements on 2026-10-17 and 18. What they
ran on is kept in `docs/worksheets/`, as files that nothing applies or
serves:

- `template-{lesson,homework}.html`, which the two templates were printed
  from; the PDFs are served from `public/worksheet/` since PR 3;
- `textlayer/propose.mjs`: finder v2.2, §5.1's suggestions as measured on
  the 219 PDFs (§9.2.1), with the rules that are not built taken out the
  way the port leaves them out. On all 219 it prints byte for byte what the
  lab's v2.2 prints. It draws each page's proposals onto a PNG and prints
  them as JSON, with each box also in PDF space, as `compose.mjs` takes it.
  It runs from the repository root, on this checkout's pdf.js (its header
  says how). v1, the finder of the first ten banks, is this file's history
  in git;
- `textlayer/compare.mjs`: the port, `lib/worksheet/propose.ts` run through
  `suggestFile`, against `propose.mjs` on the same banks, page by page and
  box by box (§5.1);
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
the history at 9cbe177. PR 3 moved `template-{lesson,homework}.pdf` to
`public/worksheet/` (§6.1). `raster/` and `textlayer/` are
evidence only and move nowhere; PR 2 writes §5.1 for the browser.

## Review notes

The review's findings were applied, with these exceptions and choices.

1. **Committing the shim, probe and template PDFs at their repo paths now**
   (the "ephemeral artefacts" finding) was not done at the time: they were
   kept as drafts in `docs/worksheets/`, which nothing applied or served, the
   repo paths were named, and the Evidence note said where the files were
   until PR 1 and PR 3 moved them. *Since:* PR 1 moved the shim to
   `supabase/tests/shim.sql`, and PR 3 the templates to `public/worksheet/`.
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
12. **Local timings.** After the restructure, the one-box draft's reads
    measured 5–11 ms at 5,000 crops in a course, and 34–60 ms for the
    Questions page at 25,200, rather than the review's ~350 ms per list page,
    which timed the earlier cross-bank list. On the multi-box schema as built,
    §3.5's table replaces them: 46–50 ms for a teacher's Questions page and
    95–135 ms for an admin's (§8.1). They are still floors until measured on
    Supabase.
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
19. **The finished branch's review** (2026-10-18). Its findings were applied
    as §4.3, §5.1, §6.2 and §9.1 now say, with these choices:
    - **Reading order** reads three columns and bands, and still cannot tell
      tall questions numbered down two columns whose tops line up from
      questions set two to a row: it reads both along the rows, which put
      Book No. 1 p. 10 and the AP Statistics textbook bank p. 7 out of order
      while putting 13 pages right (§5.1, As built (PR 2)).
    - **A stem over a run that changes kind with no heading** (unit2-s3 p. 5,
      11–13) is listed as a miss, not fixed: ending a stem at a section
      heading, the finding's fix, changes nothing there, and no rule found
      tells those three from the bare expressions above them.
    - **No browser check beside `compare.mjs`.** The repo keeps no browser
      harness; R69 removed the differences the review's walk found, and the
      walk is repeated by hand when the ink tests change (§5.1).
    - **The 25 MB warning** keeps the app's own size units, so that it
      agrees with the size the toast shows; the gap to a 25 MB limit counted
      in millions is written down until §9.2 step 7 measures Pencil's
      (§4.4).
    - **The wrong boxes on the CIM books** are flagged, not fixed: they come
      from equations LibreOffice dropped or moved, which the centre's own
      exports from Word keep (§9.2.1).
