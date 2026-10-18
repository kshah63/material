// The crop screen's All pages view (lib/worksheet/review.ts, sections.ts, and
// crops.ts chunks) against the real save_crops: Accept all over a whole bank,
// what it leaves to check, its Undo, sections and their topics, and a save too
// big for one call sent in parts. Each save is sent as the page view sends it
// and the bank read back as the in_charge, as crops.mjs does.
//   node review.mjs <scratch database with every migration>   (run.sh runs it)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { register } from "node:module";

// review.ts and sections.ts import crops.ts and propose.ts without an
// extension, as the app's bundler reads them; Node needs the ".ts" (as
// docs/worksheets/textlayer/compare.mjs does for source.ts).
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) {
  const bare = /^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]s$/.test(s);
  return next(bare && c.parentURL && c.parentURL.endsWith(".ts") ? s + ".ts" : s, c);
}`),
);
const C = await import("../../lib/worksheet/crops.ts");
const R = await import("../../lib/worksheet/review.ts");
const S = await import("../../lib/worksheet/sections.ts");

const DB = process.argv[2];
if (!DB) throw new Error("usage: node review.mjs <database>");
// SQL on stdin: a save of 500 questions is longer than one argument may be.
const psql = (sql) =>
  execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", DB, "-f", "-"], {
    encoding: "utf8",
    input: sql,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

// Fixtures of their own, so this runs after crops.mjs whatever it left.
const IC = "c0000000-0000-0000-0000-0000000000ca";
const COURSE = "cccccccc-0000-0000-0000-00000000000a";
const FILE = "c1111111-0000-0000-0000-00000000000a";
const BIG = "c1111111-0000-0000-0000-00000000000b";
const DRIFT = "c1111111-0000-0000-0000-00000000000c";
const ALG = "c7000000-0000-0000-0000-00000000000a";
const GEO = "c7000000-0000-0000-0000-00000000000b";
psql(`
insert into auth.users (id, email) values ('${IC}', 'review-incharge');
insert into public.courses (id, name) values ('${COURSE}', 'Review');
insert into public.course_memberships (course_id, user_id, role) values ('${COURSE}', '${IC}', 'in_charge');
insert into public.folders (id, course_id, name, teacher_only) values ('cf000000-0000-0000-0000-00000000000a', '${COURSE}', 'Banks', true);
insert into public.files (id, course_id, folder_id, name, storage_path) values
  ('${FILE}', '${COURSE}', 'cf000000-0000-0000-0000-00000000000a', 'booklet.pdf', 'courses/c/a.pdf'),
  ('${BIG}', '${COURSE}', 'cf000000-0000-0000-0000-00000000000a', 'book.pdf', 'courses/c/b.pdf'),
  ('${DRIFT}', '${COURSE}', 'cf000000-0000-0000-0000-00000000000a', 'drift.pdf', 'courses/c/c.pdf');
insert into public.question_topics (id, course_id, name, position) values ('${ALG}', '${COURSE}', 'Algebra', 1), ('${GEO}', '${COURSE}', 'Geometry', 2);
`);

/** One save_crops call as the in_charge: "OK" and how long it took, or the SQLSTATE and the message. */
function save(file, changes) {
  const j = (v) => `$j$${JSON.stringify(v)}$j$`;
  const out = psql(`
create function pg_temp.try() returns text language plpgsql as $f$
declare r text; t timestamptz := clock_timestamp();
begin
  perform set_config('request.jwt.claim.sub', '${IC}', true);
  set local role authenticated;
  begin
    perform public.save_crops('${file}', ${j(changes.add)}::jsonb, ${j(changes.edit)}::jsonb,
                              array(select jsonb_array_elements_text(${j(changes.remove)}::jsonb))::uuid[]);
    r := 'OK ' || round(extract(epoch from clock_timestamp() - t) * 1000);
  exception when others then r := sqlstate || ' ' || sqlerrm;
  end;
  reset role;
  return r;
end $f$;
select pg_temp.try();`);
  return out.split("\n").at(-1);
}

/** The bank as the page view reads it, under the in_charge's RLS. */
function read(file) {
  const out = psql(`
select set_config('request.jwt.claim.sub', '${IC}', false);
set role authenticated;
select json_build_object(
  'questions', (select coalesce(json_agg(json_build_object('id', id, 'topic_id', topic_id) order by id), '[]')
                  from public.questions where file_id = '${file}'),
  'boxes', (select coalesce(json_agg(json_build_object('id', id, 'question_id', question_id, 'box_no', box_no,
                     'page', page, 'x0', x0, 'y0', y0, 'x1', x1, 'y1', y1, 'pos', pos) order by page, pos, id), '[]')
              from public.question_boxes where file_id = '${file}'));`);
  const { questions, boxes } = JSON.parse(out.split("\n").at(-1));
  return C.bankOf(questions, boxes);
}

// US Letter pages as displayed, unrotated: y grows downwards from the top.
const H = 792;
const geometry = { width: 612, view: (b) => ({ x: b.x0, y: H - b.y1, w: b.x1 - b.x0, h: b.y1 - b.y0 }) };
const PAGES = new Map(Array.from({ length: 80 }, (_, i) => [i + 1, geometry]));
const box = (top, bottom, x0 = 40.12, x1 = 571.88) => ({ x0, y0: H - bottom, x1, y1: H - top });
const sug = (type, n, top, bottom, extra = {}) =>
  ({ type, n, grid: false, view: { x: 40.12, y: top, w: 531.76, h: bottom - top }, box: box(top, bottom), ...extra });
const CONT = ["continues the question above it"];

// What a question is, independent of ids: its topic and its boxes in print order, with their reading order.
const shape = (bank) =>
  bank
    .map((q) => `${q.topic_id ? q.topic_id.slice(-1) : "-"}:` + q.boxes.map((b) => `${C.keyOf(b.page, b)}@${b.pos}`).join(","))
    .sort()
    .join(" ");
const screenShape = (crops) =>
  crops.questions
    .map((q) => `${q.topic_id ? q.topic_id.slice(-1) : "-"}:` + q.rects.map((id) => C.keyOf(crops.rects[id].page, crops.rects[id].box)).join(","))
    .sort()
    .join(" ");
const bare = (bank) => shape(bank).replace(/@\d+/g, "");

let n = 0;
const ok = (msg) => console.log(`ok ${++n} - ${msg}`);
let ids = 0;
const newId = (what) => (what === "question" ? `ca000000-0000-0000-0000-${String(++ids).padStart(12, "0")}` : `n:${++ids}`);
const how = (topicOf) => ({ topic: null, stim: null, newId, ...(topicOf ? { topicOf } : {}) });

/** Every part of a save sent in turn, as the page view sends them; the bank read back after. */
function commit(file, bank, crops, limits = C.CHUNK) {
  const parts = C.chunks(bank, C.diff(bank, crops, PAGES), limits);
  const ms = [];
  for (const part of parts) {
    const res = save(file, part);
    assert.match(res, /^OK /, `${res}\n${JSON.stringify(part).slice(0, 400)}`);
    ms.push(+res.split(" ")[1]);
  }
  const after = read(file);
  const { crops: next } = C.rebase(after, crops);
  assert.equal(bare(after), screenShape(crops), "the bank is what the screen showed");
  assert.ok(C.isEmpty(C.diff(after, next, PAGES)), "nothing left to save");
  for (const q of after) assert.deepEqual(q.boxes.map((b) => b.box_no), q.boxes.map((_, i) => i + 1));
  return { bank: after, crops: next, parts, ms };
}

// --- the booklet --------------------------------------------------------------------
// p. 1 a cover. p. 2 under "PART A": a stem over questions 1 and 2, then 3,
// which runs onto p. 3 (a continuation). p. 3: 4, and 5 with a "?" (it
// overlaps). p. 4 under "PART B": 6, which runs onto p. 5, where the heading
// is printed again; 7 there. p. 6: 8 with a "?", and its continuation on p. 7,
// which Accept all cannot join while 8 is not cropped.
const found = [
  [],
  [
    sug("stem", 1, 60, 90, { for: [{ page: 2, n: 1 }, { page: 2, n: 2 }] }),
    sug("question", 1, 100, 200, { section: "PART A" }),
    sug("question", 2, 210, 400, { section: "PART A" }),
    sug("question", 3, 420, 760, { section: "PART A" }),
  ],
  [
    sug("continuation", 3, 40, 160, { for: [{ page: 2, n: 3 }], boxNo: 2, check: CONT }),
    sug("question", 4, 200, 400),
    sug("question", 5, 380, 600, { check: ["overlaps another question's box"] }),
  ],
  [sug("question", 6, 300, 760, { section: "PART B" })],
  [
    sug("continuation", 6, 40, 200, { for: [{ page: 4, n: 6 }], boxNo: 2, check: CONT }),
    sug("question", 7, 260, 500, { section: "PART B" }),
  ],
  [sug("question", 8, 100, 700, { check: ["holds a numbered list that is not proposed"] })],
  [sug("continuation", 8, 40, 300, { for: [{ page: 6, n: 8 }], boxNo: 2, check: CONT })],
].map((proposals) => ({ proposals }));
const offer = (page, i) => C.offersOn(found, page)[i];

let bank = read(FILE);
let screen = C.fromBank(bank);

// --- 1. what Accept all takes and leaves ------------------------------------------------
{
  // A box drawn by hand on the cover, not saved yet: Accept all saves it in the same call.
  screen = C.addQuestion(screen, { id: newId("question"), topic_id: null }, { id: newId("rect"), page: 1, box: box(300, 400) }, null);
  const offers = R.offeredIn(screen, found, new Set());
  assert.equal(offers.length, 12);
  assert.deepEqual(R.toLookAt(offer(3, 0)), [], "a continuation's own ? is not a reason to look");
  assert.deepEqual(R.toLookAt(offer(3, 2)), ["overlaps another question's box"]);
  const plan = R.acceptAll(screen, found, offers, how());
  assert.deepEqual(plan.counts, { questions: 6, stimuli: 1, continuations: 2 });
  assert.deepEqual(plan.rest.map((s) => s.id), [offer(3, 2).id, offer(6, 0).id, offer(7, 0).id], "two ? and the continuation of one, in bank order");
  assert.deepEqual(plan.full, []);
  const q1 = plan.crops.questions.find((q) => q.rects.some((id) => C.keyOf(2, plan.crops.rects[id].box) === C.keyOf(2, box(100, 200))));
  assert.equal(q1.rects.length, 2, "question 1 under the stem");
  const q3 = C.questionAt(plan.crops, 2, offer(2, 3).box);
  assert.deepEqual(plan.crops.questions.find((q) => q.id === q3).rects.map((id) => plan.crops.rects[id].page), [2, 3], "question 3 joined to its continuation");
  const before = screen;
  screen = plan.crops;
  const res = commit(FILE, bank, screen);
  assert.equal(res.parts.length, 1, "one call: the drawn box and everything accepted");
  assert.equal(res.parts[0].add.length, 7);
  bank = res.bank;
  screen = res.crops;
  assert.equal(R.offeredIn(screen, found, new Set()).length, 3, "only what it left is offered still");
  // Skipped suggestions are no longer offered.
  assert.deepEqual(R.offeredIn(screen, found, new Set([offer(3, 2).id])).map((s) => s.id), [offer(6, 0).id, offer(7, 0).id]);

  // --- 2. Undo: exactly what it added goes, in one call, and the bank is as it was ---------
  const kept = bank;
  const undone = R.undoAdded(screen, plan.added);
  const u = commit(FILE, bank, undone);
  assert.equal(u.parts.length, 1, "one call");
  assert.equal(u.bank.length, 1);
  assert.equal(bare(u.bank), screenShape(before), "the hand-drawn question alone, as before Accept all");
  assert.equal(R.offeredIn(u.crops, found, new Set()).length, 12, "every suggestion offered again, the stem included");
  // And again, for the rest of the tests.
  const again = R.acceptAll(u.crops, found, R.offeredIn(u.crops, found, new Set()), how());
  const a = commit(FILE, u.bank, again.crops);
  assert.equal(shape(a.bank), shape(kept), "Accept all again saves the same bank, reading order included");
  bank = a.bank;
  screen = a.crops;
}
ok("Accept all takes every suggestion but a ? (stems above their questions, continuations joined), saves a box drawn meanwhile in the same call, and leaves the rest to check in bank order; Undo takes exactly that away in one call");

// --- 3. a continuation left, and one onto a full question ----------------------------------
{
  // Question 8 taken from Next to check: its continuation is joined at the next Accept all.
  screen = C.acceptOffers(screen, found, [offer(6, 0)], how()).crops;
  const plan = R.acceptAll(screen, found, R.offeredIn(screen, found, new Set()), how());
  assert.deepEqual(plan.counts, { questions: 0, stimuli: 0, continuations: 1 });
  assert.deepEqual(plan.rest.map((s) => s.id), [offer(3, 2).id]);
  const q8 = C.questionAt(screen, 6, offer(6, 0).box);
  // Four boxes by hand first: then the continuation has no room, and is left to check.
  let full = screen;
  for (const p of [8, 9, 10]) full = C.addBox(full, q8, { id: newId("rect"), page: p, box: box(100, 200) });
  const stuck = R.acceptAll(full, found, R.offeredIn(full, found, new Set()), how());
  assert.deepEqual(stuck.full, [q8]);
  assert.deepEqual(stuck.rest.map((s) => s.id), [offer(3, 2).id, offer(7, 0).id]);
  const res = commit(FILE, bank, plan.crops);
  bank = res.bank;
  screen = res.crops;
  assert.deepEqual(bank.find((q) => q.id === q8).boxes.map((b) => b.page), [6, 7]);
}
ok("a continuation whose question is not cropped is left to check, and joined by the next Accept all once it is; one onto a question with four boxes is left too");

// --- 4. sections -------------------------------------------------------------------------
{
  const secs = S.sectionsFor(screen, found, PAGES);
  assert.deepEqual(secs.list.map((s) => [s.id, s.heading, s.page]), [["start", null, 1], ["s:2:1", "PART A", 2], ["s:4:0", "PART B", 4]],
    "the cover's question before the first heading; PART B printed again on p. 5 is still one section");
  const of = (page, i) => secs.ofQuestion.get(C.questionAt(screen, page, offer(page, i).box));
  assert.deepEqual([of(2, 1), of(2, 3), of(3, 1), of(3, 2) ?? "none", of(4, 0), of(5, 1), of(6, 0)], [1, 1, 1, "none", 2, 2, 2]);
  // A box drawn by hand where nothing is suggested goes by its place.
  assert.equal(S.sectionOfBox(secs, found, PAGES, 4, box(100, 200)), 1, "above PART B's first question on p. 4: still PART A");
  assert.equal(S.sectionOfBox(secs, found, PAGES, 4, box(600, 700)), 2);
  let rows = S.sectionRows(secs, screen, new Map());
  assert.deepEqual(rows.map((r) => [r.shows, r.questions.length, r.suggested, r.pages.join("-")]),
    [[null, 1, 0, "1-1"], ["same", 4, 5, "2-3"], ["same", 3, 3, "4-6"]]);

  // PART A tagged: its four questions, and PART B's (Same as above), in one call.
  const topic = (id) => screen.questions.find((q) => q.id === id)?.topic_id ?? null;
  let picks = new Map();
  let pick = S.chooseTopic(rows, 1, ALG, topic);
  assert.equal(pick.retag.size, 7);
  picks.set(rows[1].section.id, pick.pick);
  let next = screen;
  for (const [q, t] of pick.retag) next = C.setTopic(next, q, t);
  let res = commit(FILE, bank, next);
  assert.equal(res.parts.length, 1);
  assert.equal(res.parts[0].edit.length, 7);
  for (const e of res.parts[0].edit) assert.deepEqual(e.boxes.map((b) => Object.keys(b).join()), e.boxes.map(() => "id"), "a re-tag sends each box as {id}");
  bank = res.bank;
  screen = res.crops;
  assert.deepEqual(bank.map((q) => q.topic_id).sort(), [ALG, ALG, ALG, ALG, ALG, ALG, ALG, null].sort());
  rows = S.sectionRows(S.sectionsFor(screen, found, PAGES), screen, picks);
  assert.deepEqual(rows.map((r) => r.shows), [null, ALG, "same"]);

  // PART B its own: then PART A again leaves it, though it showed Same as above until chosen.
  pick = S.chooseTopic(rows, 2, ALG, topic);
  assert.equal(pick.retag.size, 0, "the same topic: nothing to save");
  picks.set(rows[2].section.id, pick.pick);
  rows = S.sectionRows(S.sectionsFor(screen, found, PAGES), screen, picks);
  assert.deepEqual(rows.map((r) => r.shows), [null, ALG, ALG], "chosen, so shown, not Same as above");
  pick = S.chooseTopic(rows, 1, GEO, topic);
  assert.equal(pick.retag.size, 4, "PART A only");
  const was = Array.from(pick.retag.keys(), (q) => [q, topic(q)]);
  next = screen;
  for (const [q, t] of pick.retag) next = C.setTopic(next, q, t);
  res = commit(FILE, bank, next);
  bank = res.bank;
  screen = res.crops;
  assert.equal(bank.filter((q) => q.topic_id === GEO).length, 4);
  // Undo of the re-tag: each question's topic back, in one call.
  next = was.reduce((c, [q, t]) => C.setTopic(c, q, t), screen);
  res = commit(FILE, bank, next);
  assert.equal(res.parts.length, 1);
  bank = res.bank;
  screen = res.crops;
  assert.equal(bank.filter((q) => q.topic_id === ALG).length, 7);

  // "mixed" when one is changed by hand, and Same as above under it changes nothing.
  const one = C.questionAt(screen, 2, offer(2, 1).box);
  next = C.setTopic(screen, one, GEO);
  rows = S.sectionRows(S.sectionsFor(next, found, PAGES), next, new Map());
  assert.equal(rows[1].shows, "mixed");
  assert.equal(rows[1].topic, undefined);
  assert.equal(S.chooseTopic(rows, 2, "same", (id) => next.questions.find((q) => q.id === id)?.topic_id ?? null).retag.size, 0);
}
ok("sections start at the finder's headings, a repeated one is not a new section, questions go by the suggestion they cover or their place; a topic tags a section and those under it at Same as above, saved ones too, in one call with every box as {id}; a section chosen keeps its topic; a re-tag is undone in one call");

// --- 5. topics chosen before accepting, No topic among them, and a section started by hand -------------
{
  const fresh = { rects: {}, questions: [] };
  const secs = S.sectionsFor(fresh, found, PAGES, [{ page: 3, y: 200, name: "From question 4" }]);
  assert.deepEqual(secs.list.map((s) => s.heading), ["PART A", "From question 4", "PART B"]);
  assert.equal(secs.list[1].started, true);
  assert.deepEqual([secs.ofOffer.get(offer(2, 3).id), secs.ofOffer.get(offer(3, 1).id), secs.ofOffer.get(offer(3, 2).id)], [0, 1, 1]);
  // PART A Algebra, the started section No topic, PART B left at Same as above: it follows No topic.
  const picks = new Map([[secs.list[0].id, ALG], [secs.list[1].id, null]]);
  const rows = S.sectionRows(secs, fresh, picks);
  assert.deepEqual(rows.map((r) => [r.shows, r.topic]), [[ALG, ALG], [null, null], ["same", null]], "No topic is a choice, not none");
  const topicOf = (s) => rows[secs.ofOffer.get(s.id) ?? S.sectionOfBox(secs, found, PAGES, s.page, s.box)]?.topic ?? null;
  const plan = R.acceptAll(fresh, found, R.offeredIn(fresh, found, new Set()), how(topicOf));
  const topics = plan.crops.questions.map((q) => {
    const r = q.rects.map((id) => plan.crops.rects[id]).find((x) => !x.stimulus) ?? plan.crops.rects[q.rects.at(-1)];
    return `${r.page}:${q.topic_id === ALG ? "A" : "-"}`;
  });
  assert.deepEqual(topics.sort(), ["2:A", "2:A", "2:A", "3:-", "4:-", "5:-"].sort());
}
ok("topics chosen before Accept all go to the questions it makes, No topic included; a section started at a question takes the questions after it in bank order, up to the next");

// --- 6. a save too big for one call, sent in parts ----------------------------------------------
{
  // 1,200 questions, 20 a page on 60 pages, every tenth running onto the next page.
  const pages = Array.from({ length: 61 }, (_, i) => {
    if (i === 60) return { proposals: [] };
    const list = [];
    if (i > 0) list.push(sug("continuation", i * 20, 2, 20, { for: [{ page: i, n: i * 20 }], boxNo: 2, check: CONT }));
    for (let k = 0; k < 20; k++) list.push(sug("question", i * 20 + k + 1, 30 + k * 37, 30 + k * 37 + 30));
    return { proposals: list };
  });
  let big = read(BIG);
  const plan = R.acceptAll(C.fromBank(big), pages, R.offeredIn(C.fromBank(big), pages, new Set()), how());
  assert.deepEqual(plan.counts, { questions: 1200, stimuli: 0, continuations: 59 });
  const changes = C.diff(big, plan.crops, PAGES);
  const parts = C.chunks(big, changes);
  assert.equal(parts.length, 3);
  for (const p of parts) {
    assert.ok(p.add.length + p.edit.length <= C.CHUNK.questions);
    assert.ok(JSON.stringify(p).length <= C.CHUNK.bytes);
  }
  const res = commit(BIG, big, plan.crops);
  big = res.bank;
  assert.equal(big.length, 1200);
  console.log(`# 1,200 questions in ${res.parts.length} calls of ${res.parts.map((p) => p.add.length).join(", ")}: ${res.ms.join(", ")} ms in save_crops`);
  // Undo in parts of 50, edits travelling with their own removals.
  const undo = C.diff(big, R.undoAdded(res.crops, plan.added), PAGES);
  const owner = new Map(big.flatMap((q) => q.boxes.map((b) => [b.id, q.id])));
  // In parts of 3 too, where a part's end falls between any two units: still never between an edit and its removals.
  for (const limits of [{ questions: 50, bytes: 16000 }, { questions: 3, bytes: C.CHUNK.bytes }]) {
    const small = C.chunks(big, undo, limits);
    assert.ok(small.length >= 24);
    for (const p of small) {
      const edited = new Set(p.edit.map((e) => e.id));
      for (const id of p.remove) {
        const q = owner.get(id);
        assert.ok(edited.has(q) || !undo.edit.some((e) => e.id === q), "a removal goes with its question's edit");
      }
    }
  }
  const u = commit(BIG, big, R.undoAdded(res.crops, plan.added), { questions: 50, bytes: 16000 });
  assert.equal(u.bank.length, 0);
  // A part already sent, sent again (a reply lost), is refused and writes nothing.
  const again = R.acceptAll(u.crops, pages.slice(0, 3), R.offeredIn(u.crops, pages.slice(0, 3), new Set()), how());
  const two = C.chunks(u.bank, C.diff(u.bank, again.crops, PAGES), { questions: 25, bytes: C.CHUNK.bytes });
  assert.equal(two.length, 3);
  assert.match(save(BIG, two[0]), /^OK /);
  assert.match(save(BIG, two[0]), /^23505 /);
  assert.match(save(BIG, two[1]), /^OK /);
  assert.match(save(BIG, two[2]), /^OK /);
  assert.equal(bare(read(BIG)), screenShape(again.crops));
}
ok("a save of 1,200 questions goes in 3 calls of at most 500 questions and 512 KB, each valid alone; its Undo in parts of 50, each edit with its own removals; a part sent twice is refused the second time");

// --- 7. Undo, with corners as the finder gives them ---------------------------------------------
// The finder turns each displayed edge back into PDF space unrounded, so a
// corner can be 49.039999999999964 where save_crops stores and reads back
// 49.04 (a real). Questions 2 and 3 are accepted one at a time and saved
// first; Accept all then puts the stem above question 2 and joins question
// 3's continuation; its Undo takes exactly those boxes off them again.
{
  const found = [
    [],
    [
      sug("stem", 1, 60, 90.5, { for: [{ page: 2, n: 1 }, { page: 3, n: 2 }] }),
      sug("question", 1, 100, 742.96),
    ],
    [sug("question", 2, 60, 200), sug("question", 3, 300, 600.33)],
    [sug("continuation", 3, 40, 210.29, { for: [{ page: 3, n: 3 }], boxNo: 2, check: CONT })],
  ].map((proposals) => ({ proposals }));
  assert.equal(found[1].proposals[1].box.y0, 792 - 742.96);
  assert.notEqual(found[1].proposals[1].box.y0, 49.04, "a corner as the finder gives it, not as it is saved");
  let bank = read(DRIFT);
  let screen = C.acceptOffers(C.fromBank(bank), found, C.offersOn(found, 3), how()).crops;
  let res = commit(DRIFT, bank, screen);
  bank = res.bank;
  screen = res.crops;
  const before = read(DRIFT);
  assert.equal(before.length, 2);
  const plan = R.acceptAll(screen, found, R.offeredIn(screen, found, new Set()), how());
  assert.deepEqual(plan.counts, { questions: 1, stimuli: 1, continuations: 1 });
  assert.equal(plan.added.boxes.length, 2, "the stem above question 2, and question 3's continuation");
  res = commit(DRIFT, bank, plan.crops);
  assert.deepEqual(res.bank.map((q) => q.boxes.map((b) => b.page).join()).sort(), ["2,2", "2,3", "3,4"]);
  const u = commit(DRIFT, res.bank, R.undoAdded(res.crops, plan.added));
  assert.equal(u.parts.length, 1, "one call");
  assert.deepEqual(read(DRIFT), before, "every row as it was before Accept all, ids and reading order included");
  assert.equal(R.offeredIn(u.crops, found, new Set()).length, 3, "the stem, question 1 and the continuation offered again");
}
ok("with corners as the finder gives them (49.039999999999964 for 49.04), what Accept all saves is what it accepted, and its Undo takes the stem off a question saved before it and the continuation off another, leaving every row as it was");

console.log(`1..${n}`);
