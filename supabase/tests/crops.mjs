// The crop screen's save (lib/worksheet/crops.ts) against the real save_crops.
// Each step edits the screen's state with the functions the page view calls,
// sends the one call diff() builds, reads the bank back as the in_charge (the
// page view's two reads), and checks that the bank now says what the screen
// said, with nothing left to save. Refused saves check that nothing was written.
//   node crops.mjs <scratch database with every migration>   (run.sh runs it)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as C from "../../lib/worksheet/crops.ts";

const DB = process.argv[2];
if (!DB) throw new Error("usage: node crops.mjs <database>");
const psql = (sql) =>
  execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c", sql], {
    encoding: "utf8",
  }).trim();

// Fixtures of their own, so this runs after questions.sql whatever it left.
const IC = "c0000000-0000-0000-0000-0000000000c9"; // in_charge of the course
const T = "c0000000-0000-0000-0000-0000000000e9"; // teacher
const COURSE = "cccccccc-0000-0000-0000-000000000009";
const FILE = "c1111111-0000-0000-0000-000000000009";
const TOPIC = "c7000000-0000-0000-0000-000000000001";
const TOPIC2 = "c7000000-0000-0000-0000-000000000002";
psql(`
insert into auth.users (id, email) values ('${IC}', 'crops-ic@x'), ('${T}', 'crops-t@x');
insert into public.courses (id, name) values ('${COURSE}', 'Crops');
insert into public.course_memberships (course_id, user_id, role) values ('${COURSE}', '${IC}', 'in_charge'), ('${COURSE}', '${T}', 'teacher');
insert into public.folders (id, course_id, name, teacher_only) values ('cf000000-0000-0000-0000-000000000009', '${COURSE}', 'Banks', true);
insert into public.files (id, course_id, folder_id, name, storage_path) values ('${FILE}', '${COURSE}', 'cf000000-0000-0000-0000-000000000009', 'bank.pdf', 'courses/c/9.pdf');
insert into public.question_topics (id, course_id, name, position) values ('${TOPIC}', '${COURSE}', 'Fractions', 1), ('${TOPIC2}', '${COURSE}', 'Algebra', 2);
`);

/** One save_crops call as the in_charge: "OK", or the SQLSTATE and the message. */
function save(changes) {
  const j = (v) => `$j$${JSON.stringify(v)}$j$`;
  return psql(`
create function pg_temp.try() returns text language plpgsql as $f$
declare r text := 'OK';
begin
  perform set_config('request.jwt.claim.sub', '${IC}', true);
  set local role authenticated;
  begin
    perform public.save_crops('${FILE}', ${j(changes.add)}::jsonb, ${j(changes.edit)}::jsonb,
                              array(select jsonb_array_elements_text(${j(changes.remove)}::jsonb))::uuid[]);
  exception when others then r := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  return r;
end $f$;
select pg_temp.try();`);
}

/** The bank as the page view reads it, under the caller's RLS (lib/queries.ts listFileQuestions). */
function read(uid = IC) {
  const out = psql(`
select set_config('request.jwt.claim.sub', '${uid}', false);
set role authenticated;
select json_build_object(
  'questions', (select coalesce(json_agg(json_build_object('id', id, 'topic_id', topic_id) order by id), '[]')
                  from public.questions where file_id = '${FILE}'),
  'boxes', (select coalesce(json_agg(json_build_object('id', id, 'question_id', question_id, 'box_no', box_no,
                     'page', page, 'x0', x0, 'y0', y0, 'x1', x1, 'y1', y1, 'pos', pos) order by page, pos, id), '[]')
              from public.question_boxes where file_id = '${FILE}'));`);
  const { questions, boxes } = JSON.parse(out.split("\n").at(-1));
  return C.bankOf(questions, boxes);
}

/** Every row of both tables, as the owner: what a refused save must leave as it was. */
const world = () =>
  psql(`select coalesce((select string_agg(id || ':' || coalesce(topic_id::text, '-'), ',' order by id) from public.questions where file_id = '${FILE}'), '') || '|' ||
               coalesce((select string_agg(concat_ws(':', id, question_id, box_no, page, x0, y0, x1, y1, pos), ',' order by id) from public.question_boxes where file_id = '${FILE}'), '')`);

// Two US Letter pages as displayed, unrotated: y grows downwards from the top.
const H = 792;
const geometry = { width: 612, view: (b) => ({ x: b.x0, y: H - b.y1, w: b.x1 - b.x0, h: b.y1 - b.y0 }) };
const PAGES = new Map([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((p) => [p, geometry]));

// A box by its top and bottom as displayed, the way toPdfBox makes them (to 0.01 pt).
const box = (top, bottom, x0 = 40.12, x1 = 571.88) => ({ x0, y0: H - bottom, x1, y1: H - top });

// What a question is, independent of ids: its topic and its boxes in print order.
const shape = (crops) =>
  crops.questions
    .map((q) => `${q.id.slice(-2)}:${q.topic_id ? q.topic_id.slice(-1) : "-"}:` +
      q.rects.map((id) => C.keyOf(crops.rects[id].page, crops.rects[id].box)).join(","))
    .sort()
    .join(" ");

let n = 0;
const ok = (msg) => console.log(`ok ${++n} - ${msg}`);
let ids = 0;
const qid = () => `c0a00000-0000-0000-0000-${String(++ids).padStart(12, "0")}`;
const rid = () => `n:${++ids}`;

let bank = read();
let screen = C.fromBank(bank);

/**
 * Save the screen as the page view does, and check it: the bank read back is
 * what the screen showed, nothing is left to save, and every question's boxes
 * are numbered 1..n. Returns the call that was sent.
 */
function commit(label) {
  const changes = C.diff(bank, screen, PAGES);
  const res = save(changes);
  assert.equal(res, "OK", `${label}: ${res}\n${JSON.stringify(changes)}`);
  const after = read();
  const { crops } = C.rebase(after, screen);
  assert.equal(shape(C.fromBank(after)), shape(screen), `${label}: the bank is what the screen showed`);
  assert.ok(C.isEmpty(C.diff(after, crops, PAGES)), `${label}: nothing left to save`);
  assert.equal(C.unsaved(after, crops).questions, 0);
  for (const q of after) assert.deepEqual(q.boxes.map((b) => b.box_no), q.boxes.map((_, i) => i + 1));
  bank = after;
  screen = crops;
  return changes;
}
const posOf = (q, k = 0) => bank.find((x) => x.id === q).boxes[k].pos;
const boxOf = (q, k = 0) => bank.find((x) => x.id === q).boxes[k];
const rectOf = (q, k = 0) => screen.questions.find((x) => x.id === q).rects[k];

// --- 1. create ----------------------------------------------------------------------
// Drawn bottom first, so reading order has to come from the page, not the drawing.
const Q3 = qid(), Q1 = qid(), Q2 = qid();
screen = C.addQuestion(screen, { id: Q3, topic_id: null }, { id: rid(), page: 1, box: box(300, 360) }, null);
screen = C.addQuestion(screen, { id: Q1, topic_id: TOPIC }, { id: rid(), page: 1, box: box(80, 150) }, null);
screen = C.addQuestion(screen, { id: Q2, topic_id: null }, { id: rid(), page: 1, box: box(170, 280) }, null);
assert.equal(C.unsaved(bank, screen).questions, 3);
assert.deepEqual([...C.unsaved(bank, screen).pages], [1]);
let sent = commit("create");
assert.equal(sent.add.length, 3);
assert.deepEqual([sent.edit.length, sent.remove.length], [0, 0]);
assert.deepEqual(sent.add.find((a) => a.id === Q1).boxes, [{ page: 1, ...box(80, 150), pos: 0 }]);
assert.equal(sent.add.find((a) => a.id === Q1).topic_id, TOPIC);
assert.deepEqual([posOf(Q1), posOf(Q2), posOf(Q3)], [0, 1, 2]);
ok("create: three questions in one call; pos is reading order on the page, not drawing order; the topic is stored");

// --- 2. a stimulus drawn once, copied into several new questions ------------------------
// Drawn as a question, then made a stimulus: the question goes, the box stays.
const QS = qid(), S = rid();
screen = C.addQuestion(screen, { id: QS, topic_id: null }, { id: S, page: 1, box: box(400, 430) }, null);
screen = C.makeStimulus(screen, S);
assert.equal(screen.questions.some((q) => q.id === QS), false);
assert.ok(C.isStimulus(screen, S));
assert.ok(C.isEmpty(C.diff(bank, screen, PAGES)), "a stimulus no question uses is never saved alone");
const Q4 = qid(), Q5 = qid(), Q6 = qid();
screen = C.addQuestion(screen, { id: Q4, topic_id: null }, { id: rid(), page: 1, box: box(440, 480) }, S);
screen = C.addQuestion(screen, { id: Q5, topic_id: null }, { id: rid(), page: 1, box: box(490, 530) }, S);
screen = C.addQuestion(screen, { id: Q6, topic_id: TOPIC2 }, { id: rid(), page: 1, box: box(540, 580) }, S);
sent = commit("stimulus");
assert.equal(sent.add.length, 3);
assert.equal(sent.edit.length, 0, "the boxes above keep their reading order: no edit");
for (const a of sent.add) assert.deepEqual(a.boxes[0], { page: 1, ...box(400, 430), pos: 3 });
for (const q of [Q4, Q5, Q6]) assert.deepEqual(boxOf(q), { ...boxOf(Q4), id: boxOf(q).id });
assert.equal(new Set([Q4, Q5, Q6].map((q) => boxOf(q).id)).size, 3, "copied, not shared");
const S1 = rectOf(Q4);
assert.deepEqual([...C.usersOf(screen).get(S1)], [Q4, Q5, Q6], "on screen the copies are one rectangle");
assert.deepEqual([posOf(Q4, 1), posOf(Q5, 1), posOf(Q6, 1)], [4, 5, 6]);
ok("a stimulus made from a drawn box, put above three new questions: box 1 of each with the same numbers and pos; never saved alone");

// --- 3. the stimulus put above a saved question -------------------------------------------
const q2own = boxOf(Q2).id;
screen = C.putAbove(screen, Q2, S1);
sent = commit("put above");
assert.deepEqual(sent, { add: [], edit: [{ id: Q2, boxes: [{ page: 1, ...box(400, 430), pos: 3 }, { id: q2own }] }], remove: [] });
assert.equal(Object.hasOwn(sent.edit[0], "topic_id"), false, "no topic_id: its topic did not change");
assert.deepEqual(bank.find((q) => q.id === Q2).boxes.map((b) => b.y0), [box(400, 430).y0, box(170, 280).y0]);
ok("put above a saved question: one edit, [the stimulus with no id, {id} of its box], no topic_id");

// --- 4. a stimulus moved: every copy, the same numbers ---------------------------------------
screen = C.moveRect(screen, S1, box(395.5, 431.25, 36.01, 575.99));
sent = commit("move stimulus");
assert.deepEqual(sent.edit.map((e) => e.id).sort(), [Q2, Q4, Q5, Q6].sort());
for (const e of sent.edit) {
  assert.equal(Object.hasOwn(e, "topic_id"), false);
  const moved = e.boxes.filter((b) => b.x0 !== undefined);
  assert.equal(moved.length, 1, "only the stimulus's copy sends corners");
  assert.equal(Object.hasOwn(moved[0], "page"), false, "a kept box never sends its page");
}
const copies = [Q2, Q4, Q5, Q6].map((q) => boxOf(q, 0));
for (const b of copies) assert.deepEqual([b.x0, b.y0, b.x1, b.y1], [36.01, H - 431.25, 575.99, H - 395.5]);
assert.equal(new Set(copies.map((b) => b.pos)).size, 1, "copies of one stimulus keep one pos");
ok("moving a stimulus edits every question under it with the same corners; kept boxes send no page");

// --- 5. a question's box moved, and topics changed ------------------------------------------------
const q1box = boxOf(Q1).id;
screen = C.moveRect(screen, rectOf(Q1), box(70, 152));
screen = C.setTopic(screen, Q2, TOPIC2);
screen = C.setTopic(screen, Q1, null);
screen = C.setTopic(screen, Q3, TOPIC);
screen = C.setTopic(screen, Q3, null); // and back: not a change
assert.equal(C.unsaved(bank, screen).questions, 2);
sent = commit("move and topics");
assert.deepEqual(sent.edit.find((e) => e.id === Q1), { id: Q1, topic_id: null, boxes: [{ id: q1box, ...box(70, 152) }] });
assert.equal(sent.edit.find((e) => e.id === Q2).topic_id, TOPIC2);
assert.equal(sent.edit.some((e) => e.id === Q3), false, "a topic changed and changed back is not sent");
assert.equal(bank.find((q) => q.id === Q1).topic_id, null);
assert.equal(bank.find((q) => q.id === Q2).topic_id, TOPIC2);
ok("a moved box sends its corners only; topic_id only for questions whose topic changed, null to clear it");

// --- 6. a question continued onto page 2, then that box removed -------------------------------------
const P2 = rid();
screen = C.addBox(screen, Q3, { id: P2, page: 2, box: box(40, 200) });
assert.deepEqual([...C.unsaved(bank, screen).pages], [2]);
sent = commit("continuation");
assert.deepEqual(sent.edit, [{ id: Q3, boxes: [{ id: boxOf(Q3, 0).id }, { page: 2, ...box(40, 200), pos: 0 }] }]);
assert.deepEqual(bank.find((q) => q.id === Q3).boxes.map((b) => `${b.box_no}/p${b.page}`), ["1/p1", "2/p2"]);
screen = C.removeRect(screen, rectOf(Q3, 1));
sent = commit("remove continuation");
assert.deepEqual(sent, { add: [], edit: [], remove: [sent.remove[0]] }, "a box only removed is just a removal");
assert.equal(bank.find((q) => q.id === Q3).boxes.length, 1);
ok("continued onto page 2: an edit [{id}, the new box on p. 2]; removing that box again sends only its id");

// --- 7. reading order saved for a changed page: other boxes send {id, pos} only ------------------------
const Q0 = qid();
screen = C.addQuestion(screen, { id: Q0, topic_id: null }, { id: rid(), page: 1, box: box(20, 60) }, null);
sent = commit("reorder");
assert.equal(sent.add[0].boxes[0].pos, 0);
assert.deepEqual(sent.edit.map((e) => e.id).sort(), [Q1, Q2, Q3, Q4, Q5, Q6].sort(), "every question on the page");
for (const e of sent.edit) {
  assert.equal(Object.hasOwn(e, "topic_id"), false);
  for (const b of e.boxes) assert.deepEqual(Object.keys(b).filter((k) => k !== "id" && k !== "pos"), []);
}
assert.deepEqual([Q0, Q1, Q2, Q3].map((q) => posOf(q, q === Q2 ? 1 : 0)), [0, 1, 2, 3]);
ok("a box drawn above the others: every box on the page gets {id, pos}, copies of the stimulus one pos, and nothing else");

// --- 8. stale screens are refused, and write nothing ----------------------------------------------------
{
  const staleBank = bank;
  const stale = screen;
  // Another in_charge continues Q1 onto page 2 and saves.
  screen = C.addBox(screen, Q1, { id: rid(), page: 2, box: box(100, 160) });
  commit("someone else");
  const before = world();
  // This screen, read before that, moves Q1's box: its list leaves out the new box.
  let res = save(C.diff(staleBank, C.moveRect(stale, stale.questions.find((q) => q.id === Q1).rects[0], box(72, 150)), PAGES));
  assert.match(res, /^42501 /);
  assert.equal(world(), before);
  // And deletes Q1: the box added meanwhile refuses it rather than surviving alone.
  res = save(C.diff(staleBank, C.deleteQuestion(stale, Q1), PAGES));
  assert.match(res, /^42501 /);
  assert.equal(world(), before);
  // And removes Q3's box after somebody already did: the count does not match.
  const gone = C.diff(staleBank, C.removeRect(stale, stale.questions.find((q) => q.id === Q3).rects[0]), PAGES);
  screen = C.removeRect(screen, rectOf(Q3));
  commit("Q3 removed elsewhere");
  const before2 = world();
  assert.match(save(gone), /^42501 /);
  assert.equal(world(), before2);
  assert.notEqual(before, before2);
  // A save retried after its reply was lost: the new question's id is already used.
  const Q9 = qid();
  screen = C.addQuestion(screen, { id: Q9, topic_id: null }, { id: rid(), page: 3, box: box(100, 200) }, null);
  const twice = C.diff(bank, screen, PAGES);
  commit("first try");
  const before3 = world();
  assert.match(save(twice), /^23505 /);
  assert.equal(world(), before3);
}
ok("stale screens refused with 42501 (a box added elsewhere, a question extended elsewhere, a box already removed), a retried add with 23505; nothing written");

// --- 9. a question deleted, over two pages --------------------------------------------------------
{
  const q1 = bank.find((q) => q.id === Q1);
  assert.deepEqual(q1.boxes.map((b) => b.page), [1, 2]);
  screen = C.deleteQuestion(screen, Q1);
  assert.deepEqual([...C.unsaved(bank, screen).pages].sort(), [1, 2]);
  sent = commit("delete question");
  assert.deepEqual(sent.edit.find((e) => e.id === Q1), { id: Q1, boxes: [] });
  assert.deepEqual(sent.remove.sort(), q1.boxes.map((b) => b.id).sort());
  assert.equal(bank.some((q) => q.id === Q1), false);
}
ok("a question deleted from one page: every box of it, on both pages, in remove, and edit {id, boxes: []}");

// --- 10. the stimulus deleted: every copy goes, each question keeps its own box --------------------
{
  const S2 = rectOf(Q4);
  const ids = [Q2, Q4, Q5, Q6].map((q) => boxOf(q, 0).id).sort();
  screen = C.removeRect(screen, S2);
  sent = commit("delete stimulus");
  assert.deepEqual(sent.remove.sort(), ids);
  for (const q of [Q2, Q4, Q5, Q6]) assert.equal(bank.find((x) => x.id === q).boxes.length, 1);
  // A stimulus whose question had nothing else takes that question with it.
  const S3 = rid(), Q7 = qid();
  screen = C.addQuestion(screen, { id: Q7, topic_id: null }, { id: S3, page: 3, box: box(300, 340) }, null);
  screen = C.putAbove(screen, Q5, S3);
  commit("second stimulus");
  const S3saved = rectOf(Q7);
  assert.equal(rectOf(Q5, 0), S3saved);
  screen = C.removeRect(screen, S3saved);
  sent = commit("delete second stimulus");
  assert.deepEqual(sent.edit.filter((e) => e.boxes.length === 0).map((e) => e.id), [Q7]);
  assert.equal(bank.some((q) => q.id === Q7), false);
  assert.equal(bank.find((q) => q.id === Q5).boxes.length, 1);
}
ok("deleting a stimulus removes every copy; a question it leaves with no box is deleted with an empty edit");

// --- 11. cropped twice: the hint, and deleting one ----------------------------------------------------
{
  const Q8 = qid();
  const twin = bank.find((q) => q.id === Q6).boxes[0];
  screen = C.addQuestion(screen, { id: Q8, topic_id: null }, { id: rid(), page: 1, box: { x0: twin.x0, y0: twin.y0, x1: twin.x1, y1: twin.y1 } }, null);
  commit("cropped twice");
  assert.deepEqual([...C.duplicates(screen)].sort(), [Q6, Q8].sort());
  assert.ok(C.isStimulus(screen, rectOf(Q8)), "one rectangle, two questions");
  screen = C.deleteQuestion(screen, Q8);
  sent = commit("delete one");
  assert.equal(sent.remove.length, 1);
  assert.deepEqual([...C.duplicates(screen)], []);
  assert.equal(C.isStimulus(screen, rectOf(Q6)), false, "shared, then not: an ordinary box again, never marked a stimulus");
  assert.equal(bank.find((q) => q.id === Q6).boxes.length, 1);
}
ok("a box cropped twice is flagged on both questions; deleting one leaves the other");

// --- 12. four boxes at most --------------------------------------------------------------------
{
  for (const p of [2, 3, 4]) screen = C.addBox(screen, Q4, { id: rid(), page: p, box: box(500, 600) });
  const four = screen;
  assert.equal(C.addBox(four, Q4, { id: rid(), page: 4, box: box(620, 700) }), four, "a fifth box is not added");
  const S4 = rid();
  const withStim = C.makeStimulus(C.addQuestion(four, { id: qid(), topic_id: null }, { id: S4, page: 4, box: box(10, 30) }, null), S4);
  assert.equal(C.canPutAbove(withStim.questions.find((q) => q.id === Q4), S4), false);
  assert.equal(C.putAbove(withStim, Q4, S4), withStim);
  commit("four boxes");
  assert.deepEqual(bank.find((q) => q.id === Q4).boxes.map((b) => b.page), [1, 2, 3, 4]);
}
ok("a question takes four boxes, on four pages; a fifth box and a stimulus above it are refused on screen");

// --- 13. a saved question made a stimulus ----------------------------------------------------------
{
  const was = rectOf(Q5);
  const rowId = boxOf(Q5).id;
  screen = C.makeStimulus(screen, was);
  const Q10 = qid();
  screen = C.addQuestion(screen, { id: Q10, topic_id: null }, { id: rid(), page: 1, box: box(700, 760) }, was);
  sent = commit("saved question made a stimulus");
  assert.deepEqual(sent.edit.find((e) => e.id === Q5), { id: Q5, boxes: [] });
  assert.ok(sent.remove.includes(rowId));
  assert.equal(bank.some((q) => q.id === Q5), false);
  assert.deepEqual(bank.find((q) => q.id === Q10).boxes.map((b) => b.y1), [box(490, 530).y1, box(700, 760).y1]);
}
ok("a saved question's only box made a stimulus: the question goes, and a question drawn under it gets the box as box 1");

// --- 14. rebase keeps what the screen had in hand ---------------------------------------------------
{
  const S5 = rid(), D = rid(), Q11 = qid();
  screen = C.makeStimulus(C.addQuestion(screen, { id: qid(), topic_id: null }, { id: S5, page: 2, box: box(400, 420) }, null), S5);
  screen = C.addQuestion(screen, { id: Q11, topic_id: null }, { id: D, page: 2, box: box(430, 470) }, null);
  const changes = C.diff(bank, screen, PAGES);
  assert.equal(save(changes), "OK");
  const after = read();
  const { crops, find } = C.rebase(after, screen);
  assert.equal(find(S5), S5, "a stimulus no question uses is carried over");
  assert.ok(crops.rects[S5]?.stimulus);
  assert.equal(find(D), C.keyOf(2, box(430, 470)), "a drawn box is found again by its page and corners");
  assert.equal(find("n:missing"), null);
  bank = after;
  screen = crops;
  assert.ok(C.isEmpty(C.diff(bank, screen, PAGES)));
}
ok("after a save, an unused stimulus is carried over and a drawn box is found again by page and corners");

// --- 15. reading order ---------------------------------------------------------------------------
{
  const order = (items, width = 600) =>
    [...C.readingOrder(items.map(([id, x, y, w, h]) => ({ id, v: { x, y, w, h } })), width)]
      .sort((a, b) => a[1] - b[1]).map(([id]) => id).join(" ");
  // Two columns: down the left, then down the right.
  assert.equal(order([["1", 40, 50, 250, 80], ["3", 320, 60, 240, 90], ["2", 40, 200, 250, 80], ["4", 320, 300, 240, 50]]), "1 2 3 4");
  // A grid: cells side by side on each row, each ending at the next cell, are read along the row.
  assert.equal(order([["1", 40, 50, 268, 30], ["2", 312, 51, 248, 30], ["3", 40, 100, 268, 30], ["4", 312, 102, 248, 30]]), "1 2 3 4");
  // Two columns numbered down each column whose rows line up, partly or exactly,
  // are still two columns (g6-math-fluency-1-merged p. 2, Q1-20 left and Q21-35
  // right; IGCSE CIM Book 1 p. 89's 22-25 and 26-29, 14 pt apart).
  const fluency = [["1", 69, 93.4, 124.5, 19.6], ["2", 68.5, 121, 83.5, 19.5], ["3", 68, 148.9, 63.5, 19.6],
    ["4", 68, 177, 82.5, 19.5], ["5", 68.5, 204.3, 135, 27.7], ["6", 68.5, 238.9, 75.5, 27.1],
    ["21", 329.5, 94, 48, 21], ["22", 329.5, 122.2, 132.5, 55.3], ["23", 329.5, 184.9, 153.5, 27.6],
    ["24", 329.5, 221.1, 69, 19.4], ["25", 329.5, 249.2, 116.5, 19.8], ["26", 329.5, 277, 157, 99]];
  assert.equal(order(fluency, 612), "1 2 3 4 5 6 21 22 23 24 25 26");
  const list = [["22", 82.5, 143.5, 22, 13.8], ["23", 82.5, 157.3, 22, 13.7], ["24", 82.5, 171, 22, 14], ["25", 82.5, 185, 22, 14.5],
    ["26", 334.5, 140.9, 22, 16.4], ["27", 334.5, 157.3, 22, 13.7], ["28", 334.5, 171, 22, 14], ["29", 334.5, 185, 22, 14.5]];
  assert.equal(order(list, 595.28), "22 23 24 25 26 27 28 29");
  // Questions set two to a row, tops level and room to work under each, are
  // read along the rows (IGCSE CIM Book 1 p. 31).
  assert.equal(order([["1", 81.5, 173.1, 152, 115.4], ["2", 303, 173.1, 175, 104.9], ["3", 81, 296.1, 155.5, 106.9],
                      ["4", 303, 296.1, 151.5, 104.9], ["5", 81, 414.7, 209, 109.8], ["6", 303, 414.7, 167.5, 111.3]], 595.28), "1 2 3 4 5 6");
  // Three columns numbered down each (IGCSE CIM Book 1 p. 18).
  assert.equal(order([["1", 87, 170, 79, 24.2], ["2", 86.5, 195, 87, 22.7], ["3", 86.5, 218.5, 89, 23.8],
                      ["8", 249, 170.5, 102, 23.7], ["9", 248.5, 202.6, 110, 15.1], ["10", 249.5, 226.1, 61, 16.2],
                      ["15", 411.5, 179, 67, 17.5], ["16", 412, 196.5, 20.5, 9.1], ["17", 412, 239.3, 92, 15.4]], 595.28),
               "1 2 3 8 9 10 15 16 17");
  // Bands: a stem across both columns above them, a wide question under them,
  // then two more columns (IGCSE CIM Book 1 p. 89).
  assert.equal(order([["s", 54.5, 113.3, 398.5, 30.6], ...list, ["30", 54.5, 209.9, 485.5, 141],
                      ["33", 82.5, 379, 163.5, 144.5], ["36", 298, 399.9, 135.5, 119.1], ["37", 298, 523, 230, 163], ["35", 74, 524, 185, 127.5]], 595.28),
               "s 22 23 24 25 26 27 28 29 30 33 35 36 37");
  // A line run long across the gutter, beside the next column, stays in its own (p. 18's 41 beside 51, as v2.2 drew it).
  assert.equal(order([["39", 249, 599.2, 63.5, 18.1], ["40", 248.5, 618.2, 93, 18], ["41", 248.5, 637.2, 184, 19.3],
                      ["48", 411, 564.8, 94, 18], ["49", 411, 583.3, 87.5, 18.5], ["50", 411.5, 602.3, 74, 18.5], ["51", 411.5, 621.5, 97.5, 19.5]], 595.28),
               "39 40 41 48 49 50 51");
  // A row of cells, one across the gutter, over a column of questions: a grid row, then the column (unit2-s3 p. 5).
  assert.equal(order([["1", 36, 374, 145.8, 25], ["2", 176, 374, 131.8, 25], ["3", 302, 374, 132, 25], ["4", 428.5, 374, 134, 25],
                      ["5", 33, 413, 206, 22], ["6", 33, 435, 136, 27], ["7", 33, 463, 149, 20], ["8", 33, 484, 197, 20], ["9", 33, 505, 261, 20]], 612),
               "1 2 3 4 5 6 7 8 9");
  // A gutter narrower than 1% of the page is still a gutter (question-bank-unit-1 p. 9).
  assert.equal(order([["1", 53, 74, 250, 212], ["2", 55, 290, 262, 386], ["3", 321, 74, 251, 234], ["4", 323, 314, 250, 305]], 611), "1 2 3 4");
  // A box across the gutter: one column, top to bottom.
  assert.equal(order([["0", 40, 10, 520, 30], ["1", 40, 50, 250, 80], ["2", 320, 60, 240, 90], ["3", 40, 200, 250, 80]]), "0 1 2 3");
  // One box a side is no column: top to bottom.
  assert.equal(order([["1", 320, 50, 240, 30], ["2", 40, 100, 250, 30]]), "1 2");
  // Displayed coordinates decide, so a /Rotate page reads the way it looks.
  const turned = { width: 792, view: (b) => ({ x: b.y0, y: b.x0, w: b.y1 - b.y0, h: b.x1 - b.x0 }) };
  const one = C.fromBank([
    { id: "q-a", topic_id: null, boxes: [{ id: "b-a", box_no: 1, page: 1, x0: 300, y0: 100, x1: 400, y1: 200, pos: 0 }] },
    { id: "q-b", topic_id: null, boxes: [{ id: "b-b", box_no: 1, page: 1, x0: 100, y0: 300, x1: 200, y1: 400, pos: 1 }] },
  ]);
  const moved = C.moveRect(one, "1:300:100:400:200", { x0: 300, y0: 100, x1: 400, y1: 201 });
  const call = C.diff(
    [
      { id: "q-a", topic_id: null, boxes: [{ id: "b-a", box_no: 1, page: 1, x0: 300, y0: 100, x1: 400, y1: 200, pos: 0 }] },
      { id: "q-b", topic_id: null, boxes: [{ id: "b-b", box_no: 1, page: 1, x0: 100, y0: 300, x1: 200, y1: 400, pos: 1 }] },
    ],
    moved,
    new Map([[1, turned]]),
  );
  assert.deepEqual(call.edit.map((e) => [e.id, e.boxes[0].pos]).sort(), [["q-a", 1], ["q-b", 0]]);
}
ok("reading order: two columns, a grid row by row, lists down aligned columns, questions two to a row, three columns, bands under a stem and a wide question, a long line, a grid row over a column, a narrow gutter, a box across the gutter, one box a side, and a rotated page as displayed");

// --- 16. a question's own box deleted under a shared stimulus ---------------------------------
{
  const S = rid(), QX = qid(), QY = qid();
  screen = C.makeStimulus(C.addQuestion(screen, { id: qid(), topic_id: null }, { id: S, page: 4, box: box(100, 120) }, null), S);
  screen = C.addQuestion(screen, { id: QX, topic_id: TOPIC }, { id: rid(), page: 4, box: box(130, 170) }, S);
  screen = C.addQuestion(screen, { id: QY, topic_id: null }, { id: rid(), page: 4, box: box(180, 220) }, S);
  commit("two under a stimulus");
  const xs = bank.find((q) => q.id === QX).boxes.map((b) => b.id);
  screen = C.removeRect(screen, rectOf(QX, 1));
  assert.equal(screen.questions.some((q) => q.id === QX), false, "QX holds only the shared stimulus now: it goes");
  sent = commit("remove QX's own box");
  assert.deepEqual(sent.edit.find((e) => e.id === QX), { id: QX, boxes: [] });
  assert.deepEqual(sent.remove.sort(), xs.sort(), "its own box and its copy of the stimulus");
  assert.equal(bank.some((q) => q.id === QX), false);
  assert.deepEqual(bank.find((q) => q.id === QY).boxes.map((b) => b.y1), [box(100, 120).y1, box(180, 220).y1]);
  assert.deepEqual([...C.duplicates(screen)], []);
}
ok("deleting a question's own box under a shared stimulus deletes the question, not leaves it as the stimulus alone");

// --- suggestions accepted (§4.3), as the page view accepts them ---------------------------------
// The finder's suggestions for pages 5-8 (propose.ts Suggestion), each with its
// box as displayed and in PDF space. Page 5 numbers two sections 1-2, so "the
// question 2 on p. 5" a continuation names is the second section's, the one
// left open at the foot, and the stem between the sections names the second's.
const sug = (type, n, top, bottom, extra = {}) =>
  ({ type, n, grid: false, view: { x: 40.12, y: top, w: 531.76, h: bottom - top }, box: box(top, bottom), ...extra });
const CONT = ["continues the question above it"];
const found = [
  [], [], [], [],
  [
    sug("question", 1, 60, 140), sug("question", 2, 150, 300), sug("question", 1, 400, 500), sug("question", 2, 520, 760),
    sug("stem", 1, 370, 395, { for: [{ page: 5, n: 1 }, { page: 5, n: 2 }] }),
  ],
  [
    sug("continuation", 2, 40, 200, { for: [{ page: 5, n: 2 }], boxNo: 2, check: CONT }),
    sug("question", 3, 300, 360),
    sug("question", 4, 370, 430),
    sug("stem", 3, 220, 290, { for: [{ page: 6, n: 3 }, { page: 6, n: 4 }, { page: 7, n: 5 }] }),
  ],
  [sug("question", 5, 50, 120), sug("continuation", 9, 200, 380, { for: [{ page: 4, n: 9 }], boxNo: 2, check: CONT })],
  [sug("continuation", 2, 40, 200, { for: [{ page: 5, n: 2 }], boxNo: 3, check: CONT })],
].map((proposals) => ({ proposals }));
const offer = (page, i) => C.offersOn(found, page)[i];
const how = { topic: null, stim: null, newId: (what) => (what === "question" ? qid() : rid()) };
const accept = (offers) => {
  const res = C.acceptOffers(screen, found, offers, how);
  screen = res.crops;
  return res;
};
const questionOf = (page, i) => C.questionAt(screen, page, offer(page, i).box);

// --- 17. a continuation onto a saved question ------------------------------------------------------
{
  accept(C.offersOn(found, 5).filter((s) => s.type === "question"));
  commit("p. 5's four questions");
  const open = questionOf(5, 3);
  assert.ok(open && open !== questionOf(5, 1), "two questions numbered 2 on p. 5, both saved");
  const cont = offer(6, 0);
  assert.deepEqual(C.namedOnScreen(screen, found, cont), [{ ref: { page: 5, n: 2 }, id: open }], "the last 2 on p. 5: the one open at its foot");
  const res = accept([cont]);
  assert.deepEqual([res.full, res.left, res.rects.length], [[], [], 1]);
  sent = commit("continuation accepted");
  assert.deepEqual(sent.edit, [{ id: open, boxes: [{ id: boxOf(open, 0).id }, { page: 6, ...box(40, 200), pos: 0 }] }]);
  assert.deepEqual(bank.find((q) => q.id === open).boxes.map((b) => `${b.box_no}/p${b.page}`), ["1/p5", "2/p6"]);
  assert.deepEqual(C.uncropped(screen, 6, [cont]), [], "and it is no longer offered");
  // A continuation whose question is not cropped is not taken: the page view
  // offers it as a question of its own instead, or to skip it.
  const orphan = offer(7, 1);
  assert.deepEqual(C.namedOnScreen(screen, found, orphan), [{ ref: { page: 4, n: 9 }, id: null }]);
  const before = screen;
  const left = accept([orphan]);
  assert.deepEqual([left.left.map((s) => s.id), left.rects], [[orphan.id], []]);
  assert.equal(screen, before, "nothing changes on screen");
}
ok("a continuation accepted onto the saved question it continues (the last of two numbered alike): an edit [{id}, its box on p. 6]; one whose question is not cropped is not taken");

// --- 18. a stem onto several questions -------------------------------------------------------------
{
  // Questions 3 and 4 on p. 6 accepted and saved first, without the stem.
  accept([offer(6, 1), offer(6, 2)]);
  commit("questions 3 and 4");
  const [q3, q4] = [questionOf(6, 1), questionOf(6, 2)];
  const own = [boxOf(q3).id, boxOf(q4).id];
  // The stem goes above both saved questions; question 5 on p. 7 goes under it once accepted.
  const stem = offer(6, 3);
  const res = accept([stem]);
  assert.deepEqual(res.full, []);
  assert.deepEqual(C.namedOnScreen(screen, found, stem).map((x) => x.id), [q3, q4, null]);
  const q5offer = offer(7, 0);
  assert.deepEqual(C.stimuliOver(screen, found, q5offer), [res.rects[0]], "question 5 is named by the accepted stem on p. 6");
  accept([q5offer]);
  sent = commit("stem above three questions");
  const q5 = questionOf(7, 0);
  assert.deepEqual(sent.edit.map((e) => e.id).sort(), [q3, q4].sort());
  for (const e of sent.edit) {
    assert.equal(e.boxes.length, 2);
    assert.deepEqual(e.boxes[0], { page: 6, ...box(220, 290), pos: 1 }, "the stem, with no id, in front, second on its page");
    assert.ok(own.includes(e.boxes[1].id));
  }
  assert.deepEqual(sent.add.find((a) => a.id === q5).boxes.map((b) => b.page), [6, 7]);
  for (const q of [q3, q4, q5]) {
    const b = boxOf(q, 0);
    assert.deepEqual([b.box_no, b.page, b.y0, b.y1], [1, 6, H - 290, H - 220]);
  }
  assert.equal(new Set([q3, q4, q5].map((q) => boxOf(q, 0).id)).size, 3, "copied into each, not shared");
  // On a page with two questions numbered 3, a stem names the one below it.
  const two = [{ proposals: [sug("question", 3, 40, 100), sug("stem", 3, 120, 160, { for: [{ page: 1, n: 3 }] }), sug("question", 3, 170, 230)] }];
  assert.equal(C.namedQuestion(two, C.offersOn(two, 1)[1], { page: 1, n: 3 }), two[0].proposals[2]);
}
ok("a stem accepted above two saved questions (edits, the stem in front with no id), and a question on the next page accepted under it (an add): box 1 of each, the same numbers, copied");

// --- 19. four boxes at most, for suggestions too ----------------------------------------------------
{
  // The open question 2 of p. 5 runs on by hand to pp. 7 and 8: four boxes.
  const open = questionOf(5, 3);
  screen = C.addBox(screen, open, { id: rid(), page: 7, box: box(600, 700) });
  screen = C.addBox(screen, open, { id: rid(), page: 8, box: box(600, 700) });
  commit("four boxes by hand");
  // Its continuation on p. 8 is refused on screen.
  const shown = screen;
  const res = accept([offer(8, 0)]);
  assert.deepEqual([res.full, res.rects], [[open], []]);
  assert.equal(screen, shown, "nothing changes");
  assert.ok(C.isEmpty(C.diff(bank, screen, PAGES)));
  // The stem between p. 5's sections goes above its question 1 only.
  const q1b = questionOf(5, 2);
  const stem = accept([offer(5, 4)]);
  assert.deepEqual(stem.full, [open]);
  sent = commit("stem with one question full");
  // The full question keeps its four boxes: it is sent only for its new reading order on p. 5.
  const resent = sent.edit.find((e) => e.id === open);
  assert.deepEqual(resent.boxes.map((b) => Object.keys(b).sort().join()), ["id,pos", "id", "id", "id"]);
  assert.deepEqual(bank.find((q) => q.id === open).boxes.map((b) => b.page), [5, 6, 7, 8]);
  assert.deepEqual(bank.find((q) => q.id === q1b).boxes.map((b) => b.y1), [H - 370, H - 400]);
  // save_crops refuses a fifth box sent anyway, and writes nothing.
  const kept = bank.find((q) => q.id === open).boxes.map((b) => ({ id: b.id }));
  const was = world();
  assert.match(save({ add: [], edit: [{ id: open, boxes: [...kept, { page: 8, ...box(40, 200), pos: 9 }] }], remove: [] }), /^23514 /);
  assert.equal(world(), was);
}
ok("four boxes at most: a continuation onto a full question is refused on screen, a stem goes above only the questions with room, and save_crops refuses a fifth box sent anyway");

// --- 20. continuations accepted out of order print in the bank's order -----------------------------
// Question 7 of p. 9 runs on to p. 10 (box 2) and p. 11 (box 3); question 8 of
// p. 10 to p. 12's left column (box 2) and right column (box 3). Each box 3 is
// accepted first (IM3 U4 booklet A's question 63, reached at p. 36 before p. 35).
{
  const half = (type, n, top, bottom, x0, x1, extra) =>
    ({ ...sug(type, n, top, bottom, extra), view: { x: x0, y: top, w: x1 - x0, h: bottom - top }, box: box(top, bottom, x0, x1) });
  const chain = [
    [], [], [], [], [], [], [], [],
    [sug("question", 7, 500, 760)],
    [sug("continuation", 7, 40, 300, { for: [{ page: 9, n: 7 }], boxNo: 2, check: CONT }), sug("question", 8, 400, 760)],
    [sug("continuation", 7, 40, 200, { for: [{ page: 9, n: 7 }], boxNo: 3, check: CONT })],
    [
      half("continuation", 8, 40, 700, 40.12, 300, { for: [{ page: 10, n: 8 }], boxNo: 2, check: CONT }),
      half("continuation", 8, 40, 300, 312, 571.88, { for: [{ page: 10, n: 8 }], boxNo: 3, check: CONT }),
    ],
  ].map((proposals) => ({ proposals }));
  const at = (page, i) => C.offersOn(chain, page)[i];
  const take = (offers) => {
    const res = C.acceptOffers(screen, chain, offers, how);
    screen = res.crops;
    return res;
  };
  const pagesOf = (q) => bank.find((x) => x.id === q).boxes.map((b) => `${b.box_no}/p${b.page}`);
  take([at(9, 0), at(10, 1)]);
  commit("questions 7 and 8");
  const [q7, q8] = [C.questionAt(screen, 9, at(9, 0).box), C.questionAt(screen, 10, at(10, 1).box)];
  // Box 3 first: it is box 2 for now, and the page view's button says so.
  assert.deepEqual(C.continuesAt(screen, chain, at(11, 0)), { id: q7, at: 1 });
  take([at(11, 0)]);
  commit("question 7's box 3, accepted first");
  assert.deepEqual(pagesOf(q7), ["1/p9", "2/p11"]);
  // Box 2 then goes in front of it, on the saved question: an edit with the new box between the kept ones.
  assert.deepEqual(C.continuesAt(screen, chain, at(10, 0)), { id: q7, at: 1 });
  take([at(10, 0)]);
  sent = commit("question 7's box 2");
  assert.deepEqual(sent.edit.find((e) => e.id === q7).boxes.map((b) => b.id ?? `new p${b.page}`), [boxOf(q7, 0).id, "new p10", boxOf(q7, 2).id]);
  assert.deepEqual(pagesOf(q7), ["1/p9", "2/p10", "3/p11"]);
  // On one page, the right column's box 3 before the left column's box 2, both drafts.
  take([at(12, 1)]);
  take([at(12, 0)]);
  commit("question 8's two columns");
  assert.deepEqual(bank.find((x) => x.id === q8).boxes.map((b) => [b.page, b.x0]), [[10, 40.12], [12, 40.12], [12, 312]]);
}
ok("continuations accepted out of order, box 3 before box 2, on a saved question and in two columns of a page, print in the bank's order");

// --- 21. a teacher reads what the in_charge saved -----------------------------------------------
assert.equal(shape(C.fromBank(read(T))), shape(C.fromBank(bank)));
ok("a teacher of the course reads the same bank");

console.log(`1..${n}`);
