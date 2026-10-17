// The crop screen's state, its edits, and the one save_crops call that saves them
// (docs/WORKSHEETS.md §3.4, §4.3). Pure: no React, no pdf.js and no network, so
// the call it builds is tested in Node against the real save_crops
// (supabase/tests/crops.mjs).
//
// The screen works in rectangles. A stimulus printed once above several
// questions is one rectangle on screen and a box row in each question, with the
// same numbers (§3.1), so moving it moves every copy and deleting it removes
// every copy. The diff turns rectangles back into each question's box list.
import type { BankBox, BankQuestion } from "@/lib/queries";
import type { SaveBox, SaveChanges, SaveEdit } from "@/app/actions/questions";
import type { PdfBox, ViewRect } from "./source";

/** A question holds four boxes at most (§2.2). */
export const MAX_BOXES = 4;
/** A drag smaller than this, in points, is not a box (§4.3). */
export const MIN_BOX = 10;

/** One rectangle on a page: a box of one question, or a stimulus over several. */
export interface CropRect {
  id: string;
  page: number;
  box: PdfBox;
  /** The saved box row this rectangle is, by question id: one per copy. */
  rows: Record<string, string>;
  /** Made a stimulus on this screen. Kept while no question uses it, and never saved alone. */
  stimulus?: true;
}

/** A question, saved or drawn on this screen, with its rectangles in print order. */
export interface CropQuestion {
  id: string;
  topic_id: string | null;
  rects: string[];
}

export interface Crops {
  rects: Record<string, CropRect>;
  questions: CropQuestion[];
}

// --- reading the bank -----------------------------------------------------------

/**
 * The bank as the page view reads it (§3.5), from its two flat reads: each
 * question's boxes in box_no order, the first being where it starts whatever its
 * number. A question with no box read is dropped, and so is a box whose
 * question was not read: the two reads are separate snapshots.
 */
export function bankOf(
  questions: { id: string; topic_id: string | null }[],
  boxes: (BankBox & { question_id: string })[],
): BankQuestion[] {
  const byQuestion = new Map<string, BankBox[]>();
  for (const { question_id, ...box } of boxes) {
    const list = byQuestion.get(question_id);
    if (list) list.push(box);
    else byQuestion.set(question_id, [box]);
  }
  return questions.flatMap((q) => {
    const list = byQuestion.get(q.id);
    if (!list) return [];
    list.sort((a, b) => a.box_no - b.box_no || a.id.localeCompare(b.id));
    return [{ id: q.id, topic_id: q.topic_id, boxes: list }];
  });
}

/** A rectangle's identity on a page: boxes with the same numbers are one rectangle. */
export function keyOf(page: number, b: PdfBox): string {
  return `${page}:${b.x0}:${b.y0}:${b.x1}:${b.y1}`;
}

const sameBox = (a: PdfBox, b: PdfBox) =>
  a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;

/** The screen's state for a bank as saved: one rectangle per distinct page and corners. */
export function fromBank(bank: BankQuestion[]): Crops {
  const rects: Record<string, CropRect> = {};
  const questions = bank.map((q) => ({
    id: q.id,
    topic_id: q.topic_id,
    rects: q.boxes.map((b) => {
      const id = keyOf(b.page, b);
      rects[id] ??= { id, page: b.page, box: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, rows: {} };
      rects[id].rows[q.id] = b.id;
      return id;
    }),
  }));
  return { rects, questions };
}

/**
 * The screen after a save, from the bank as read back. Stimuli no question uses
 * yet are carried over, since they are never saved, and a box marked a
 * stimulus stays marked. `find` maps a rectangle of the old state to the same
 * rectangle in the new one (its id, or its page and corners), or null if it is
 * gone, so a selection survives the save.
 */
export function rebase(
  bank: BankQuestion[],
  before: Crops,
): { crops: Crops; find: (id: string | null) => string | null } {
  const next = fromBank(bank);
  const used = usersOf(before);
  for (const r of Object.values(before.rects)) {
    if (r.stimulus && !used.has(r.id) && !next.rects[keyOf(r.page, r.box)]) {
      next.rects[r.id] = r;
    }
  }
  const find = (id: string | null) => {
    if (id === null) return null;
    if (next.rects[id]) return id;
    const r = before.rects[id];
    return r && next.rects[keyOf(r.page, r.box)] ? keyOf(r.page, r.box) : null;
  };
  for (const r of Object.values(before.rects)) {
    const id = r.stimulus ? find(r.id) : null;
    if (id) next.rects[id] = { ...next.rects[id], stimulus: true };
  }
  return { crops: next, find };
}

// --- what the screen shows ------------------------------------------------------

/** Every rectangle in use, with the questions using it, in question order. */
export function usersOf(c: Crops): Map<string, string[]> {
  const users = new Map<string, string[]>();
  for (const q of c.questions) {
    for (const id of q.rects) {
      const list = users.get(id);
      if (list) list.push(q.id);
      else users.set(id, [q.id]);
    }
  }
  return users;
}

/** A stimulus: made one on this screen, or used by no question or by several. */
export function isStimulus(c: Crops, id: string, users = usersOf(c)): boolean {
  return c.rects[id]?.stimulus === true || (users.get(id)?.length ?? 0) !== 1;
}

/**
 * Questions cropped twice (§2.2, the screen's crop-once hint): a question with no
 * box of its own, because every box it has is another question's too.
 */
export function duplicates(c: Crops, users = usersOf(c)): Set<string> {
  return new Set(
    c.questions
      .filter((q) => q.rects.every((id) => (users.get(id)?.length ?? 0) > 1))
      .map((q) => q.id),
  );
}

/**
 * Rectangles not saved as they are shown, which the screen outlines as drafts:
 * new, moved, put above a question that did not have it, or a stimulus no
 * question uses yet.
 */
export function draftRects(bank: BankQuestion[], c: Crops, users = usersOf(c)): Set<string> {
  const rows = new Map<string, BankBox>();
  for (const q of bank) for (const b of q.boxes) rows.set(b.id, b);
  const drafts = new Set<string>();
  for (const r of Object.values(c.rects)) {
    const qs = users.get(r.id) ?? [];
    const saved =
      qs.length > 0 &&
      qs.every((q) => {
        const row = rows.get(r.rows[q]);
        return !!row && row.page === r.page && sameBox(row, r.box);
      });
    if (!saved) drafts.add(r.id);
  }
  return drafts;
}

/** Intersection over union of two boxes on one page. */
export function iou(a: PdfBox, b: PdfBox): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / ((a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter);
}

/**
 * The suggestions on a page not cropped yet (§4.3): one that overlaps a box on
 * the page (IoU over 0.5) is never shown, the screen's other hint toward "crop
 * once" (§2.2). Every box counts, saved or drawn here, so an accepted suggestion
 * goes, and comes back if its box is deleted.
 */
export function uncropped<T extends { box: PdfBox }>(c: Crops, page: number, suggestions: T[]): T[] {
  const here = Object.values(c.rects).filter((r) => r.page === page);
  return suggestions.filter((s) => !here.some((r) => iou(r.box, s.box) > 0.5));
}

// --- edits ----------------------------------------------------------------------
// Each returns a new state, or the same one when the edit is not allowed.

/** Drops rectangles nothing uses, except stimuli made on this screen. */
function prune(rects: Record<string, CropRect>, questions: CropQuestion[]): Crops {
  const used = new Set(questions.flatMap((q) => q.rects));
  const kept: Record<string, CropRect> = {};
  for (const [id, r] of Object.entries(rects)) if (used.has(id) || r.stimulus) kept[id] = r;
  return { rects: kept, questions };
}

const newRect = (id: string, page: number, box: PdfBox): CropRect => ({ id, page, box, rows: {} });

/** A new question with one box, under the stimulus `under` if one is given. */
export function addQuestion(
  c: Crops,
  q: { id: string; topic_id: string | null },
  rect: { id: string; page: number; box: PdfBox },
  under: string | null,
): Crops {
  const stim = under !== null && c.rects[under] ? [under] : [];
  return {
    rects: { ...c.rects, [rect.id]: newRect(rect.id, rect.page, rect.box) },
    questions: [...c.questions, { id: q.id, topic_id: q.topic_id, rects: [...stim, rect.id] }],
  };
}

export const canAddBox = (q: CropQuestion | undefined) => !!q && q.rects.length < MAX_BOXES;

/** A box added at the end of a question, on any page: how a question continues. */
export function addBox(
  c: Crops,
  questionId: string,
  rect: { id: string; page: number; box: PdfBox },
): Crops {
  const q = c.questions.find((x) => x.id === questionId);
  if (!canAddBox(q)) return c;
  return {
    rects: { ...c.rects, [rect.id]: newRect(rect.id, rect.page, rect.box) },
    questions: c.questions.map((x) => (x === q ? { ...x, rects: [...x.rects, rect.id] } : x)),
  };
}

export const canPutAbove = (q: CropQuestion | undefined, stimulus: string | null) =>
  !!q && stimulus !== null && !q.rects.includes(stimulus) && q.rects.length < MAX_BOXES;

/** A stimulus put above a question: its new box 1. */
export function putAbove(c: Crops, questionId: string, stimulus: string): Crops {
  const q = c.questions.find((x) => x.id === questionId);
  if (!canPutAbove(q, stimulus) || !c.rects[stimulus]) return c;
  return {
    rects: c.rects,
    questions: c.questions.map((x) => (x === q ? { ...x, rects: [stimulus, ...x.rects] } : x)),
  };
}

/** A rectangle moved or resized on its page. Every copy of a stimulus moves with it. */
export function moveRect(c: Crops, id: string, box: PdfBox): Crops {
  const r = c.rects[id];
  if (!r || sameBox(r.box, box)) return c;
  return { rects: { ...c.rects, [id]: { ...r, box } }, questions: c.questions };
}

/**
 * A rectangle deleted from every question that has it: a box from its question,
 * or a stimulus from every question under it. A question left with no box of its
 * own goes: with no box at all, or holding only a stimulus that other questions
 * hold too, which would be saved as a question that is only the stimulus.
 */
export function removeRect(c: Crops, id: string): Crops {
  const hit = new Set(c.questions.filter((q) => q.rects.includes(id)).map((q) => q.id));
  const left = c.questions.map((q) => (hit.has(q.id) ? { ...q, rects: q.rects.filter((r) => r !== id) } : q));
  const users = usersOf({ rects: c.rects, questions: left });
  const questions = left.filter(
    (q) => !hit.has(q.id) || q.rects.some((r) => (users.get(r)?.length ?? 0) === 1),
  );
  const rects = { ...c.rects };
  delete rects[id];
  return prune(rects, questions);
}

/** A question deleted, with every box it has. A stimulus it shares stays with the others. */
export function deleteQuestion(c: Crops, questionId: string): Crops {
  return prune(c.rects, c.questions.filter((q) => q.id !== questionId));
}

/**
 * A box made a stimulus, so that questions can be put under it. A question whose
 * only box it was is no longer a question: the box is just the stimulus now.
 */
export function makeStimulus(c: Crops, id: string): Crops {
  const r = c.rects[id];
  if (!r) return c;
  return prune(
    { ...c.rects, [id]: { ...r, stimulus: true } },
    c.questions.filter((q) => !(q.rects.length === 1 && q.rects[0] === id)),
  );
}

export function setTopic(c: Crops, questionId: string, topicId: string | null): Crops {
  return {
    rects: c.rects,
    questions: c.questions.map((q) => (q.id === questionId ? { ...q, topic_id: topicId } : q)),
  };
}

// --- reading order (§5.1 rule 9) ------------------------------------------------

// Tops this close, in points, are one row: the cells of a grid row, side by side.
const ROW = 6;
// Boxes this close across a gutter, in points, are cells of one table: a grid's
// cell ends at the next cell's label (§5.1 rule 7). Two columns' boxes end at
// their ink, and the centre's banks leave 16 pt or more between them.
const TOUCH = 8;

/**
 * Reading order of the boxes on one page, as displayed: columns left to right,
 * then top to bottom, and left to right along a row. A column gutter is the
 * widest band of the middle 30-70% of the page that no box crosses, however
 * narrow, and only if each side has two boxes or more. Boxes side by side at the
 * same height that all but touch across it, on most rows, are a grid, a problem
 * set printed as a table, which is read row by row and never split (§5.1 rule
 * 5). Rows that merely line up are not: two columns numbered down each column
 * often do.
 */
export function readingOrder(
  items: { id: string; v: ViewRect }[],
  width: number,
): Map<string, number> {
  const g = gutter(items, width);
  const columns =
    g === null
      ? [items]
      : [items.filter((i) => i.v.x + i.v.w <= g), items.filter((i) => i.v.x >= g)];
  const order = new Map<string, number>();
  for (const column of columns) for (const it of byRows(column)) order.set(it.id, order.size);
  return order;
}

function byRows<T extends { v: ViewRect }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.v.y - b.v.y || a.v.x - b.v.x);
  const out: T[] = [];
  let row: T[] = [];
  const flush = () => out.push(...row.sort((a, b) => a.v.x - b.v.x));
  for (const it of sorted) {
    if (row.length && it.v.y - row[0].v.y > ROW) {
      flush();
      row = [];
    }
    row.push(it);
  }
  flush();
  return out;
}

/** How far apart two boxes are across, in points: below zero when they overlap. */
const apart = (a: ViewRect, b: ViewRect) => Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));

function gutter(items: { v: ViewRect }[], width: number): number | null {
  // The widest band of the middle 30-70% that no box crosses, measured exactly:
  // a gutter between two columns' boxes can be 2 pt.
  const lo = 0.3 * width;
  const hi = 0.7 * width;
  let band: [number, number] | null = null;
  let from = lo; // the right edge of the boxes so far, left to right
  const spans = items
    .filter((i) => i.v.x < hi && i.v.x + i.v.w > lo)
    .map((i) => [i.v.x, i.v.x + i.v.w])
    .sort((a, b) => a[0] - b[0]);
  for (const [x0, x1] of [...spans, [hi, hi]]) {
    if (x0 > from && (!band || x0 - from > band[1] - band[0])) band = [from, x0];
    from = Math.max(from, x1);
  }
  if (!band) return null;
  const g = (band[0] + band[1]) / 2;
  const left = items.filter((i) => i.v.x + i.v.w <= g);
  const right = items.filter((i) => i.v.x >= g);
  if (left.length < 2 || right.length < 2) return null;
  const [few, many] = left.length <= right.length ? [left, right] : [right, left];
  const cells = few.filter((a) =>
    many.some((b) => Math.abs(a.v.y - b.v.y) <= ROW && apart(a.v, b.v) <= TOUCH),
  ).length;
  return cells * 2 > few.length ? null : g;
}

// --- the save -------------------------------------------------------------------

/** A page as displayed, for its reading order: pdf.js's viewport at scale 1. */
export interface PageGeometry {
  width: number;
  view: (box: PdfBox) => ViewRect;
}

/** Rectangles some question uses, by page. Stimuli no question uses are never saved. */
function usedByPage(c: Crops): Map<number, CropRect[]> {
  const users = usersOf(c);
  const byPage = new Map<number, CropRect[]>();
  for (const r of Object.values(c.rects)) {
    if (!users.has(r.id)) continue;
    const list = byPage.get(r.page);
    if (list) list.push(r);
    else byPage.set(r.page, [r]);
  }
  return byPage;
}

/**
 * Pages whose rectangles changed since the bank was read: one added, moved or
 * removed. Their reading order is set again when the bank is saved.
 */
export function changedPages(bank: BankQuestion[], c: Crops): number[] {
  const before = new Map<number, Set<string>>();
  for (const q of bank) {
    for (const b of q.boxes) {
      const set = before.get(b.page) ?? new Set<string>();
      set.add(keyOf(b.page, b));
      before.set(b.page, set);
    }
  }
  const after = new Map<number, Set<string>>();
  for (const [page, rects] of usedByPage(c)) after.set(page, new Set(rects.map((r) => keyOf(page, r.box))));
  const pages = new Set([...before.keys(), ...after.keys()]);
  return Array.from(pages)
    .filter((p) => {
      const a = before.get(p) ?? new Set<string>();
      const b = after.get(p) ?? new Set<string>();
      return a.size !== b.size || Array.from(a).some((k) => !b.has(k));
    })
    .sort((x, y) => x - y);
}

interface QuestionDiff {
  /** The edit's box list, or null for a question that has not changed at all. */
  boxes: SaveBox[] | null;
  topic: boolean;
  removed: string[];
  /** Pages where something of this question changed other than reading order. */
  pages: Set<number>;
}

/** One saved question against its state on screen; reading order too, if posOf is given. */
function compare(
  saved: BankQuestion,
  q: CropQuestion,
  c: Crops,
  posOf: ((r: CropRect) => number) | null,
): QuestionDiff {
  const rows = new Map(saved.boxes.map((b) => [b.id, b]));
  const pages = new Set<number>();
  const kept: string[] = [];
  let changed = false;
  const boxes: SaveBox[] = q.rects.map((id) => {
    const r = c.rects[id];
    const row = rows.get(r.rows[q.id]);
    const pos = posOf ? posOf(r) : 0;
    if (!row) {
      changed = true;
      pages.add(r.page);
      return { page: r.page, ...r.box, pos };
    }
    kept.push(row.id);
    const box: SaveBox = { id: row.id };
    // A kept box never changes page (a rectangle never does), so page is never sent.
    if (!sameBox(row, r.box)) {
      Object.assign(box, r.box);
      pages.add(r.page);
    }
    if (posOf && pos !== row.pos) box.pos = pos;
    if (Object.keys(box).length > 1) changed = true;
    return box;
  });
  const removed = saved.boxes.filter((b) => !kept.includes(b.id));
  for (const b of removed) pages.add(b.page);
  // Kept boxes in another order: only a box put in front of them moves them,
  // and that is a new box, but the list is the order either way.
  const savedOrder = saved.boxes.filter((b) => kept.includes(b.id)).map((b) => b.id);
  if (savedOrder.some((id, i) => kept[i] !== id)) {
    changed = true;
    for (const b of saved.boxes) pages.add(b.page);
  }
  const topic = q.topic_id !== saved.topic_id;
  if (topic) {
    for (const b of saved.boxes) pages.add(b.page);
    for (const id of q.rects) pages.add(c.rects[id].page);
  }
  // A box only removed needs no edit: save_crops closes the gap (§3.4 step 6).
  return { boxes: changed || topic ? boxes : null, topic, removed: removed.map((b) => b.id), pages };
}

/**
 * The one save_crops call for every change since the bank was read (§4.3):
 * - a new question is an add, box 1 first, a stimulus's numbers the same in
 *   each question under it;
 * - a saved question that changed is an edit with its whole box list: {id} for
 *   a box kept as it is, its corners only if it moved, its pos only if its
 *   reading order changed, and a box with no id for a new one; topic_id only
 *   if its topic changed (null clears it);
 * - a removed box is in remove; a deleted question is every box of it in
 *   remove plus an edit with no boxes, so that a box added elsewhere meanwhile
 *   refuses the save instead of surviving alone.
 * Every box on a page whose rectangles changed gets its reading order again,
 * from `pages`; copies of a stimulus get the same pos. A changed page missing
 * from `pages` keeps the order it had, with new boxes after it.
 */
export function diff(
  bank: BankQuestion[],
  c: Crops,
  pages: Map<number, PageGeometry>,
): SaveChanges {
  const savedPos = new Map<string, number>();
  for (const q of bank) {
    for (const b of q.boxes) {
      const k = keyOf(b.page, b);
      savedPos.set(k, Math.min(savedPos.get(k) ?? b.pos, b.pos));
    }
  }
  const pos = new Map<string, number>();
  const byPage = usedByPage(c);
  for (const p of changedPages(bank, c)) {
    const rects = byPage.get(p) ?? [];
    const g = pages.get(p);
    if (g) {
      // Read by page and corners, so that the same box in two questions (a box
      // cropped twice, not yet saved) gets one pos, as copies of a stimulus do.
      const distinct = new Map(rects.map((r) => [keyOf(p, r.box), r]));
      const order = readingOrder(
        Array.from(distinct, ([k, r]) => ({ id: k, v: g.view(r.box) })),
        g.width,
      );
      for (const r of rects) pos.set(r.id, order.get(keyOf(p, r.box))!);
    } else {
      let next = Math.max(-1, ...rects.map((r) => savedPos.get(keyOf(p, r.box)) ?? -1)) + 1;
      for (const r of rects) pos.set(r.id, savedPos.get(keyOf(p, r.box)) ?? next++);
    }
  }
  const posOf = (r: CropRect) => pos.get(r.id) ?? savedPos.get(keyOf(r.page, r.box)) ?? 0;

  const onScreen = new Map(c.questions.map((q) => [q.id, q]));
  const saved = new Set(bank.map((q) => q.id));
  const changes: SaveChanges = { add: [], edit: [], remove: [] };
  for (const s of bank) {
    const q = onScreen.get(s.id);
    if (!q) {
      changes.remove.push(...s.boxes.map((b) => b.id));
      changes.edit.push({ id: s.id, boxes: [] });
      continue;
    }
    const d = compare(s, q, c, posOf);
    changes.remove.push(...d.removed);
    if (d.boxes) {
      const edit: SaveEdit = { id: q.id, boxes: d.boxes };
      if (d.topic) edit.topic_id = q.topic_id;
      changes.edit.push(edit);
    }
  }
  for (const q of c.questions) {
    if (saved.has(q.id)) continue;
    changes.add.push({
      id: q.id,
      topic_id: q.topic_id,
      boxes: q.rects.map((id) => {
        const r = c.rects[id];
        return { page: r.page, ...r.box, pos: posOf(r) };
      }),
    });
  }
  return changes;
}

export const isEmpty = (s: SaveChanges) => !s.add.length && !s.edit.length && !s.remove.length;

/**
 * What is not saved yet, as the screen reports it: how many questions are new,
 * changed or deleted ("Save 3"), and the pages they changed on ("p. 12 · not
 * saved"). Reading order alone is not counted: it follows from the rest.
 */
export function unsaved(bank: BankQuestion[], c: Crops): { questions: number; pages: Set<number> } {
  const pages = new Set<number>();
  let questions = 0;
  const onScreen = new Map(c.questions.map((q) => [q.id, q]));
  const saved = new Set(bank.map((q) => q.id));
  for (const s of bank) {
    const q = onScreen.get(s.id);
    if (!q) {
      questions++;
      for (const b of s.boxes) pages.add(b.page);
      continue;
    }
    const d = compare(s, q, c, null);
    if (d.boxes || d.removed.length) {
      questions++;
      for (const p of d.pages) pages.add(p);
    }
  }
  for (const q of c.questions) {
    if (saved.has(q.id)) continue;
    questions++;
    for (const id of q.rects) pages.add(c.rects[id].page);
  }
  return { questions, pages };
}
