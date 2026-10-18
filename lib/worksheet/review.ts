// The crop screen's All pages view (docs/WORKSHEETS.md §4.3): Accept all over
// the whole bank, what it leaves to check, and its Undo. Pure, like crops.ts,
// so it is tested in Node against the real save_crops (supabase/tests/review.mjs).
import {
  acceptOffers,
  keyOf,
  offersOn,
  uncropped,
  type Accepting,
  type CropRect,
  type Crops,
  type FoundPages,
  type Offer,
} from "./crops";
import { CONTINUES, type Suggestion } from "./propose";
import type { PdfBox } from "./source";

/**
 * Why a suggestion needs a look before it is accepted: its "?", less the one
 * every continuation carries. A continuation is joined to its question by
 * Accept all, which finds that question itself (crops.ts continuesAt).
 */
export const toLookAt = (s: Suggestion): string[] => (s.check ?? []).filter((r) => r !== CONTINUES);

/** Every suggestion still offered in the bank: not under a box, not skipped; page 1 first, each page in the finder's order. */
export function offeredIn(c: Crops, found: FoundPages, skipped: ReadonlySet<string>): Offer[] {
  const byPage = new Map<number, CropRect[]>();
  for (const r of Object.values(c.rects)) {
    const list = byPage.get(r.page);
    if (list) list.push(r);
    else byPage.set(r.page, [r]);
  }
  const out: Offer[] = [];
  for (let page = 1; page <= found.length; page++) {
    const here = { rects: Object.fromEntries((byPage.get(page) ?? []).map((r) => [r.id, r])), questions: [] };
    for (const s of uncropped(here, page, offersOn(found, page))) if (!skipped.has(s.id)) out.push(s);
  }
  return out;
}

/** What Accept all added, to take away again: by question id, and boxes by page and corners, which survive a save. */
export interface Added {
  /** New questions. */
  questions: string[];
  /** Boxes added to questions that were there before: a continuation joined, or a stimulus put above. */
  boxes: { question: string; page: number; box: PdfBox }[];
  /** Every new rectangle, so a stimulus left with no question goes too. */
  rects: { page: number; box: PdfBox }[];
}

/** What `after` has that `before` did not, for Undo. */
export function addedBetween(before: Crops, after: Crops): Added {
  const was = new Map(before.questions.map((q) => [q.id, new Set(q.rects)]));
  const added: Added = { questions: [], boxes: [], rects: [] };
  for (const q of after.questions) {
    const had = was.get(q.id);
    if (!had) {
      added.questions.push(q.id);
      continue;
    }
    for (const id of q.rects) {
      if (!had.has(id)) added.boxes.push({ question: q.id, page: after.rects[id].page, box: after.rects[id].box });
    }
  }
  for (const r of Object.values(after.rects)) if (!before.rects[r.id]) added.rects.push({ page: r.page, box: r.box });
  return added;
}

/**
 * The screen with what Accept all added taken away again: its new questions
 * deleted, the boxes it added to other questions removed from them (from them
 * only: a stimulus another question had already stays with it), and any new
 * rectangle no question uses now dropped, so its suggestion is offered again.
 */
export function undoAdded(c: Crops, added: Added): Crops {
  const gone = new Set(added.questions);
  const boxes = new Map<string, Set<string>>();
  for (const b of added.boxes) {
    const set = boxes.get(b.question) ?? new Set<string>();
    set.add(keyOf(b.page, b.box));
    boxes.set(b.question, set);
  }
  const questions = c.questions
    .filter((q) => !gone.has(q.id))
    .map((q) => {
      const drop = boxes.get(q.id);
      if (!drop) return q;
      return { ...q, rects: q.rects.filter((id) => !drop.has(keyOf(c.rects[id].page, c.rects[id].box))) };
    });
  const used = new Set(questions.flatMap((q) => q.rects));
  const fresh = new Set(added.rects.map((r) => keyOf(r.page, r.box)));
  const rects: Crops["rects"] = {};
  for (const [id, r] of Object.entries(c.rects)) {
    if (used.has(id) || (r.stimulus && !fresh.has(keyOf(r.page, r.box)))) rects[id] = r;
  }
  return { rects, questions };
}

/** Accept all, as the screen runs it and as it counts it beforehand. */
export interface AcceptAll {
  crops: Crops;
  /** Every suggestion it takes, in the order taken (stems and contexts first). */
  taken: Offer[];
  /** What it leaves, in bank order: a "?" for any reason but continuing, and a continuation it could not join. */
  rest: Offer[];
  /** Questions it could not add a box to, for four boxes. */
  full: string[];
  /** How many of each kind it took. */
  counts: { questions: number; stimuli: number; continuations: number };
  added: Added;
}

/**
 * Every suggestion of the bank that needs no look, accepted in one go
 * (crops.ts acceptOffers, in bank order): each question, under the stems and
 * contexts that name it; each stem and context above the questions it names;
 * each continuation joined to the question it continues, in the bank's order,
 * four boxes at most. A continuation whose question is not cropped, or full,
 * is left. `offers` is offeredIn's list. The stimulus in hand is not used: it
 * is for questions drawn or tapped one at a time.
 */
export function acceptAll(c: Crops, found: FoundPages, offers: readonly Offer[], how: Accepting): AcceptAll {
  const sure = offers.filter((s) => toLookAt(s).length === 0);
  const res = acceptOffers(c, found, sure, { ...how, stim: null });
  const took = new Set(res.taken.map((s) => s.id));
  const counts = { questions: 0, stimuli: 0, continuations: 0 };
  for (const s of res.taken) {
    if (s.type === "question") counts.questions++;
    else if (s.type === "continuation") counts.continuations++;
    else counts.stimuli++;
  }
  return {
    crops: res.crops,
    taken: res.taken,
    rest: offers.filter((s) => !took.has(s.id)),
    full: res.full,
    counts,
    added: addedBetween(c, res.crops),
  };
}
