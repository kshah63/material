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
import type { QuestionRef, Suggestion } from "./propose";
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

/**
 * A box to 0.01 pt, as source.ts toPdfBox makes a drawn one: what save_crops
 * stores (a real) and reads back. The finder's corners are unrounded, so a
 * suggestion's 49.039999999999964 is saved as 49.04, and a rectangle kept at
 * the first would never be found again by its corners (keyOf).
 */
const rounded = (b: PdfBox): PdfBox => {
  const r = (v: number) => Math.round(v * 100) / 100;
  return { x0: r(b.x0), y0: r(b.y0), x1: r(b.x1), y1: r(b.y1) };
};

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

/** A new question with one box of its own, under the stimulus `under` (or each of several, in order) if given. */
export function addQuestion(
  c: Crops,
  q: { id: string; topic_id: string | null },
  rect: { id: string; page: number; box: PdfBox },
  under: string | readonly string[] | null,
): Crops {
  const stim = (under === null ? [] : typeof under === "string" ? [under] : under)
    .filter((id) => c.rects[id])
    .slice(0, MAX_BOXES - 1);
  return {
    rects: { ...c.rects, [rect.id]: newRect(rect.id, rect.page, rect.box) },
    questions: [...c.questions, { id: q.id, topic_id: q.topic_id, rects: [...stim, rect.id] }],
  };
}

export const canAddBox = (q: CropQuestion | undefined) => !!q && q.rects.length < MAX_BOXES;

/**
 * A box added to a question, on any page: how a question continues. It goes at
 * the end, or at `at` in its list (an accepted continuation, continuesAt).
 */
export function addBox(
  c: Crops,
  questionId: string,
  rect: { id: string; page: number; box: PdfBox },
  at?: number,
): Crops {
  const q = c.questions.find((x) => x.id === questionId);
  if (!q || !canAddBox(q)) return c;
  const i = at ?? q.rects.length;
  return {
    rects: { ...c.rects, [rect.id]: newRect(rect.id, rect.page, rect.box) },
    questions: c.questions.map((x) =>
      x === q ? { ...x, rects: [...x.rects.slice(0, i), rect.id, ...x.rects.slice(i)] } : x,
    ),
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

// --- accepting suggestions (§4.3, §5.1) -------------------------------------------
// A continuation, stem or context names its questions by page and printed number
// (propose.ts QuestionRef). The screen finds each as boxes: the question suggested
// on that page with that number, then the question on screen, saved or accepted,
// with a box over it. Nothing is saved until the page is.

/** A suggestion as the screen offers it: its page, and an id of its own. */
export type Offer = Suggestion & { id: string; page: number };

/** Every page's suggestions, page 1 first (propose.ts FileSuggestions.pages). */
export type FoundPages = readonly { readonly proposals: readonly Suggestion[] }[];

/** A page's suggestions as offers, each id `s:{page}:{index in the page's list}`. */
export function offersOn(found: FoundPages, page: number): Offer[] {
  return (found[page - 1]?.proposals ?? []).map((s, i) => ({ ...s, id: `s:${page}:${i}`, page }));
}

const across = (a: ViewRect, b: ViewRect) => a.x < b.x + b.w && b.x < a.x + a.w;

/**
 * The suggested question a continuation, stem or context names: the question
 * suggested on that page with that number. A page can number two sections
 * alike: a continuation's is then the last of them, the question left open at
 * the page's foot (R51), and a stem's the first not above it in its column
 * (R52).
 */
export function namedQuestion(found: FoundPages, from: Offer, ref: QuestionRef): Suggestion | null {
  const alike = (found[ref.page - 1]?.proposals ?? []).filter((s) => s.type === "question" && s.n === ref.n);
  if (from.type === "continuation") return alike[alike.length - 1] ?? null;
  const below =
    ref.page === from.page ? alike.filter((s) => !(s.view.y < from.view.y && across(s.view, from.view))) : alike;
  return below[0] ?? alike[0] ?? null;
}

/** The rectangle on `page` most over `box`, if one is over it at all (IoU over 0.5, as uncropped hides a suggestion). */
function rectOver(c: Crops, page: number, box: PdfBox): CropRect | null {
  let best: { r: CropRect; v: number } | null = null;
  for (const r of Object.values(c.rects)) {
    const v = r.page === page ? iou(r.box, box) : 0;
    if (v > 0.5 && (!best || v > best.v)) best = { r, v };
  }
  return best?.r ?? null;
}

/**
 * The question on screen, saved or drawn here, with a box on `page` over this
 * box: a question's own box before a stimulus, then the one most over it.
 */
export function questionAt(c: Crops, page: number, box: PdfBox, users = usersOf(c)): string | null {
  let best: { q: string; own: boolean; v: number } | null = null;
  for (const r of Object.values(c.rects)) {
    const v = r.page === page ? iou(r.box, box) : 0;
    if (v <= 0.5) continue;
    const own = !isStimulus(c, r.id, users);
    for (const q of users.get(r.id) ?? []) {
      if (!best || (own && !best.own) || (own === best.own && v > best.v)) best = { q, own, v };
    }
  }
  return best?.q ?? null;
}

/** The questions a continuation, stem or context names, each with the question on screen it is, or null if not cropped yet. */
export function namedOnScreen(
  c: Crops,
  found: FoundPages,
  from: Offer,
): { ref: QuestionRef; id: string | null }[] {
  const users = usersOf(c);
  return (from.for ?? []).map((ref) => {
    const s = namedQuestion(found, from, ref);
    return { ref, id: s ? questionAt(c, ref.page, s.box, users) : null };
  });
}

/**
 * The question on screen a continuation continues, and where in its list the
 * continuation's box goes: by where it falls in the bank, not by when it was
 * accepted. It goes before the first of the question's boxes after its own that
 * comes later in the bank, on a later page or later in the same run on this
 * page (the finder's box number: a column's continuation before the next
 * column's), so a box 3 accepted before box 2 still prints third. Null when its
 * question is not cropped yet.
 */
export function continuesAt(c: Crops, found: FoundPages, s: Offer): { id: string; at: number } | null {
  const ref = s.for?.[0];
  const named = ref ? namedQuestion(found, s, ref) : null;
  const id = ref && named ? questionAt(c, ref.page, named.box) : null;
  const q = id === null ? undefined : c.questions.find((x) => x.id === id);
  if (!ref || !named || !q) return null;
  const own = rectOver(c, ref.page, named.box);
  // The box number of a box of this question that is an accepted continuation of it.
  const boxNoOf = (r: CropRect) => {
    const o = offersOn(found, r.page).find((x) => x.type === "continuation" && iou(x.box, r.box) > 0.5);
    const of = o?.for?.[0] ? namedQuestion(found, o, o.for[0]) : null;
    return of && sameBox(of.box, named.box) ? o!.boxNo : undefined;
  };
  for (let i = own ? q.rects.indexOf(own.id) + 1 : 0; i < q.rects.length; i++) {
    const r = c.rects[q.rects[i]];
    if (r.page > s.page || (r.page === s.page && (boxNoOf(r) ?? 0) > (s.boxNo ?? 2))) return { id: q.id, at: i };
  }
  return { id: q.id, at: q.rects.length };
}

/**
 * The stems and contexts accepted on screen that name this suggested question,
 * in the bank's order: each a rectangle on its own page over its suggested box.
 * The question goes under them when it is accepted, wherever they are.
 */
export function stimuliOver(c: Crops, found: FoundPages, q: Offer): string[] {
  const out: string[] = [];
  for (let page = 1; page <= found.length; page++) {
    for (const s of offersOn(found, page)) {
      if ((s.type !== "stem" && s.type !== "context") || !s.for) continue;
      const names = s.for.some((ref) => {
        const named = ref.page === q.page && ref.n === q.n ? namedQuestion(found, s, ref) : null;
        return !!named && sameBox(named.box, q.box);
      });
      const r = names ? rectOver(c, s.page, s.box) : null;
      if (r && !out.includes(r.id)) out.push(r.id);
    }
  }
  return out;
}

/** What accepting needs besides the suggestions. */
export interface Accepting {
  /** The topic for new questions. */
  topic: string | null;
  /** A new question's topic by the suggestion it is made from, in place of `topic`: its section's (sections.ts). */
  topicOf?: (s: Offer) => string | null;
  /** The stimulus in hand: a question no accepted stem names goes under it, as a drawn one does. */
  stim: string | null;
  /** A new id: a question's (a uuid, as save_crops takes it) or a rectangle's. */
  newId: (what: "question" | "rect") => string;
}

/**
 * Suggestions accepted (§4.3), as drafts:
 * - a question becomes a new question, under the accepted stems and contexts
 *   that name it, or else under the stimulus in hand;
 * - a stem or context becomes a stimulus, box 1 of each question it names that
 *   is on screen; the rest go under it when they are accepted;
 * - a continuation becomes a box of the question it continues, in the bank's
 *   order (continuesAt).
 * Stems and contexts are taken first, so the questions accepted with them go
 * under them. Four boxes stay the limit: a question with no room is left as it
 * is and returned in `full`, and a continuation whose question is not on screen
 * is not taken, and returned in `left`. `taken` is every suggestion that became
 * a box, in the order taken, with its rectangle at the same place in `rects`.
 * Each rectangle is its suggestion's box to 0.01 pt, as it is saved.
 */
export function acceptOffers(
  c: Crops,
  found: FoundPages,
  offers: readonly Offer[],
  how: Accepting,
): { crops: Crops; rects: string[]; taken: Offer[]; full: string[]; left: Offer[] } {
  let next = c;
  const rects: string[] = [];
  const taken: Offer[] = [];
  const full: string[] = [];
  const left: Offer[] = [];
  const rank = (s: Offer) => (s.type === "stem" || s.type === "context" ? 0 : 1);
  for (const s of [...offers].sort((a, b) => rank(a) - rank(b))) {
    const rect = { id: how.newId("rect"), page: s.page, box: rounded(s.box) };
    if (s.type === "stem" || s.type === "context") {
      const ids = namedOnScreen(next, found, s).flatMap((x) => (x.id ? [x.id] : []));
      next = {
        rects: { ...next.rects, [rect.id]: { ...newRect(rect.id, rect.page, rect.box), stimulus: true } },
        questions: next.questions,
      };
      for (const id of new Set(ids)) {
        const after = putAbove(next, id, rect.id);
        if (after === next) full.push(id);
        next = after;
      }
    } else if (s.type === "continuation") {
      const to = continuesAt(next, found, s);
      const q = to && next.questions.find((x) => x.id === to.id);
      if (!to || !q) {
        left.push(s);
        continue;
      }
      if (!canAddBox(q)) {
        full.push(q.id);
        continue;
      }
      next = addBox(next, q.id, rect, to.at);
    } else {
      const over = stimuliOver(next, found, s);
      next = addQuestion(
        next,
        { id: how.newId("question"), topic_id: how.topicOf ? how.topicOf(s) : how.topic },
        rect,
        over.length ? over : how.stim,
      );
    }
    rects.push(rect.id);
    taken.push(s);
  }
  return { crops: next, rects, taken, full, left };
}

// --- reading order (§5.1, Reading order) -----------------------------------------

// Tops this close, in points, are one row: the cells of a grid row, side by side.
const ROW = 6;
// Boxes this close across a gutter, in points, are cells of one table: a grid's
// cell ends at the next cell's label (§5.1, Box edges). Two columns' boxes end
// at their ink, and the centre's banks leave 16 pt or more between them.
const TOUCH = 8;
// Tops this close, in points, line up exactly: questions set two or three to a row.
const ALIGN = 3;
// A column whose tops are this far apart, in points, on the median, holds
// questions with room to work under them; a list down a column is closer set.
const PITCH = 40;

type Placed = { id: string; v: ViewRect };

/**
 * Reading order of the boxes on one page, as displayed: columns left to right,
 * each top to bottom, and left to right along a row. A page can have two
 * columns or three. A box across them (a stem over both, a wide question under
 * them) with nothing beside it in a column it reaches into is a band of its
 * own: what is above it is read first, columns and all, then it, then what is
 * below, each part read the same way. A box across a gutter with something
 * beside it there, a line run long, is read in the column it starts in.
 */
export function readingOrder(items: Placed[], width: number): Map<string, number> {
  const order = new Map<string, number>();
  for (const it of arrange(items, width)) order.set(it.id, order.size);
  return order;
}

const right = (v: ViewRect) => v.x + v.w;
const crosses = (v: ViewRect, g: number) => v.x < g && right(v) > g;

function arrange(items: Placed[], width: number): Placed[] {
  const gs = gutters(items, width);
  if (!gs.length) return byRows(items);
  // A box's column is the one its left edge is in.
  const col = (v: ViewRect) => gs.filter((g) => v.x >= g).length;
  const across = (v: ViewRect) => gs.some((g) => crosses(v, g));
  const beside = (a: ViewRect, b: ViewRect) =>
    col(b) > col(a) && b.x < right(a) && b.y < a.y + a.h && a.y < b.y + b.h;
  const bands = items
    .filter((a) => across(a.v) && !items.some((b) => !across(b.v) && beside(a.v, b.v)))
    .sort((a, b) => a.v.y - b.v.y);
  if (!bands.length) {
    return Array.from({ length: gs.length + 1 }, (_, k) => arrange(items.filter((i) => col(i.v) === k), width)).flat();
  }
  const out: Placed[] = [];
  let rest = items.filter((i) => !bands.includes(i));
  for (const b of bands) {
    out.push(...arrange(rest.filter((i) => i.v.y < b.v.y), width), b);
    rest = rest.filter((i) => i.v.y >= b.v.y);
  }
  return [...out, ...arrange(rest, width)];
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
const apart = (a: ViewRect, b: ViewRect) => Math.max(a.x - right(b), b.x - right(a));

/** The median distance between the tops of a column's boxes, one under the next. */
function pitch(columns: Placed[][]): number {
  const d = columns
    .flatMap((c) => {
      const ys = c.map((i) => i.v.y).sort((a, b) => a - b);
      return ys.slice(1).map((y, k) => y - ys[k]);
    })
    .sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] : 0;
}

/**
 * The column gutters, left to right. A gutter is in the middle 30-70% of the
 * page, where fewer boxes cross than on either side of it, and fewer than half
 * the page's: measured exactly between box edges (two columns' boxes can be
 * 2 pt apart), at the middle of the band, the emptiest bands first and then the
 * widest. Every column the gutters make holds two boxes or more wholly inside
 * it. Two columns either side of a gutter are read row by row instead, and the
 * gutter dropped, when they are a grid, a problem set printed as a table: boxes
 * side by side at the same height that all but touch across it, on most rows,
 * or a box across it that does. They are also read row by row when their tops
 * line up exactly on most rows and the questions have room to work under them:
 * questions set two to a row. Short boxes that line up are a list numbered down
 * each column, which they often are (§5.1, Reading order).
 */
function gutters(items: Placed[], width: number): number[] {
  const lo = 0.3 * width;
  const hi = 0.7 * width;
  const edges = items.flatMap((i) => [i.v.x, right(i.v)]).filter((x) => x > lo && x < hi);
  const xs = Array.from(new Set([lo, hi, ...edges])).sort((a, b) => a - b);
  // The bands between edges, each with how many boxes cross it, neighbours as full merged.
  const bands: { a: number; b: number; n: number }[] = [];
  for (let k = 0; k + 1 < xs.length; k++) {
    const m = (xs[k] + xs[k + 1]) / 2;
    const n = items.filter((i) => crosses(i.v, m)).length;
    const last = bands[bands.length - 1];
    if (last && last.n === n) last.b = xs[k + 1];
    else bands.push({ a: xs[k], b: xs[k + 1], n });
  }
  const valleys = bands
    .filter((d, k) => (k === 0 || bands[k - 1].n > d.n) && (k === bands.length - 1 || bands[k + 1].n > d.n))
    .filter((d) => d.n * 2 < items.length)
    .sort((p, q) => p.n - q.n || q.b - q.a - (p.b - p.a));
  const columnsOf = (gs: number[]) => {
    const bounds = [-Infinity, ...gs, Infinity];
    return bounds.slice(1).map((r, k) => items.filter((i) => i.v.x >= bounds[k] && right(i.v) <= r));
  };
  let gs: number[] = [];
  for (const d of valleys) {
    const next = [...gs, (d.a + d.b) / 2].sort((a, b) => a - b);
    if (columnsOf(next).every((c) => c.length >= 2)) gs = next;
  }
  // Then each gutter against the two columns either side of it, until none is dropped.
  for (;;) {
    const columns = columnsOf(gs);
    const k = gs.findIndex((g, k) => {
      const [few, many] =
        columns[k].length <= columns[k + 1].length ? [columns[k], columns[k + 1]] : [columns[k + 1], columns[k]];
      const beside = (dy: number, dx: number) =>
        few.filter((a) => many.some((b) => Math.abs(a.v.y - b.v.y) <= dy && apart(a.v, b.v) <= dx)).length * 2 >
        few.length;
      const cell = items.some(
        (a) =>
          crosses(a.v, g) &&
          items.some((b) => b !== a && b.v.x >= g && Math.abs(a.v.y - b.v.y) <= ROW && apart(a.v, b.v) <= TOUCH),
      );
      return (
        columns[k].length < 2 ||
        columns[k + 1].length < 2 ||
        cell ||
        beside(ROW, TOUCH) ||
        (pitch([few, many]) >= PITCH && beside(ALIGN, Infinity))
      );
    });
    if (k < 0) return gs;
    gs = gs.filter((_, i) => i !== k);
  }
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

/** How much one save_crops call carries at most: questions it touches, and bytes of JSON. */
export interface ChunkLimits {
  questions: number;
  bytes: number;
}

// 500 new questions take about 0.6 s of save_crops on local Postgres
// (supabase/tests/review.mjs); 512 KB stays well inside the 1 MB a Server
// Action's body may be by default (Next's serverActions.bodySizeLimit).
export const CHUNK: ChunkLimits = { questions: 500, bytes: 512 * 1024 };

/**
 * One save split into calls of at most `limits` each, for a change too big for
 * one (Accept all on a long bank, or its Undo). The split is only ever between
 * whole questions: an add with its boxes, and an edit with the removals of its
 * own boxes, since save_crops refuses an edit that neither lists nor removes
 * every box of its question. A question whose boxes are only removed travels
 * as its removals. The parts touch different questions, so each is a valid call
 * on its own against the bank as read, in any order, and together they are the
 * one call `changes` was. They are sent as they are, never diffed again: a page
 * saved by an earlier part no longer looks changed, and the reading order its
 * other boxes were given would be lost. Nothing to save is no part at all.
 */
export function chunks(bank: BankQuestion[], changes: SaveChanges, limits: ChunkLimits = CHUNK): SaveChanges[] {
  const owner = new Map<string, string>();
  for (const q of bank) for (const b of q.boxes) owner.set(b.id, q.id);
  const removed = new Map<string, string[]>();
  for (const id of changes.remove) {
    const q = owner.get(id) ?? id;
    const list = removed.get(q);
    if (list) list.push(id);
    else removed.set(q, [id]);
  }
  const units: SaveChanges[] = [];
  const edited = new Set(changes.edit.map((e) => e.id));
  for (const [q, ids] of removed) if (!edited.has(q)) units.push({ add: [], edit: [], remove: ids });
  for (const e of changes.edit) units.push({ add: [], edit: [e], remove: removed.get(e.id) ?? [] });
  for (const a of changes.add) units.push({ add: [a], edit: [], remove: [] });

  const parts: SaveChanges[] = [];
  let part: SaveChanges | null = null;
  let questions = 0;
  let bytes = 0;
  for (const u of units) {
    const size = JSON.stringify(u).length;
    if (!part || questions + 1 > limits.questions || bytes + size > limits.bytes) {
      part = { add: [], edit: [], remove: [] };
      parts.push(part);
      questions = 0;
      bytes = 0;
    }
    part.add.push(...u.add);
    part.edit.push(...u.edit);
    part.remove.push(...u.remove);
    questions += 1;
    bytes += size;
  }
  return parts;
}

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
