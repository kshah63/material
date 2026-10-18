// The crop screen's sections (docs/WORKSHEETS.md §4.3, All pages): the bank cut
// at the section headings the finder reads (propose.ts R29, Suggestion.section),
// each with one topic, which tags every question in it. Pure, like crops.ts, and
// tested in Node with the save they make (supabase/tests/review.mjs). Sections
// are never saved: they are worked out again from the suggestions each time the
// bank is opened, and what is saved is each question's topic.
import { iou, usersOf, type Crops, type FoundPages, type PageGeometry } from "./crops";
import type { PdfBox } from "./source";

export interface Section {
  /**
   * Its first suggested question's offer id (crops.ts offersOn), "start" for
   * what comes before the first heading, or "m:{page}:{y}" for one the
   * in-charge started.
   */
  id: string;
  /** The heading's words, as the finder read them, or a started section's name; null before the first heading. */
  heading: string | null;
  /** Where it starts: a page, and the top of its first question there as displayed (points, y down). */
  page: number;
  y: number;
  /** Started on this screen (New section here), where the finder read no heading. Never saved. */
  started?: true;
}

/** A section the in-charge starts at a question, where the finder read no heading (IM3's LOGARITHMS). */
export interface Start {
  page: number;
  /** The question's top as displayed, in points. */
  y: number;
  name: string;
}

export interface Sections {
  list: Section[];
  /** Each suggested question's section, by offer id. */
  ofOffer: Map<string, number>;
  /** Each question on screen's section, by question id. */
  ofQuestion: Map<string, number>;
}

const START: Section = { id: "start", heading: null, page: 1, y: 0 };

/** The last section starting at or before this place, or -1 before the first. */
function sectionAt(list: readonly Section[], page: number, y: number): number {
  let k = -1;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.page < page || (s.page === page && s.y <= y)) k = i;
  }
  return k;
}

/**
 * The bank's sections, and which section each question is in. A section starts
 * at the first suggested question under a heading the finder reads, in bank
 * order (page by page, each page in the finder's reading order), whose heading
 * differs from the section before: a heading is read only on the page it is
 * printed on, so the questions after it on later pages, which have none, are
 * still its section, and a heading repeated at the top of the next page is not
 * a new one. A question on screen, saved or drawn here, is in the section of the
 * suggested question its own box covers (IoU over 0.5, as uncropped hides a
 * suggestion), or else of its place on the page; a stimulus is box 1 of several
 * questions, so its own box decides. Questions before the first heading, or in
 * a bank where none is read (a scan), are one section of their own, first.
 * `starts` are sections started on this screen, each at a question's top: one
 * holds the questions from there in bank order, up to the next section.
 */
export function sectionsFor(
  c: Crops,
  found: FoundPages,
  geometry: ReadonlyMap<number, PageGeometry>,
  starts: readonly Start[] = [],
): Sections {
  const list: Section[] = [];
  const ofOffer = new Map<string, number>();
  const started = [...starts].sort((a, b) => a.page - b.page || a.y - b.y);
  let m = 0;
  const startUpTo = (page: number, y: number) => {
    for (; m < started.length && (started[m].page < page || (started[m].page === page && started[m].y <= y + 0.5)); m++) {
      const t = started[m];
      list.push({ id: `m:${t.page}:${t.y}`, heading: t.name, page: t.page, y: t.y, started: true });
    }
  };
  let heading: string | null = null;
  let before = false; // a question before the first heading
  for (let page = 1; page <= found.length; page++) {
    found[page - 1].proposals.forEach((s, i) => {
      if (s.type !== "question") return;
      const id = `s:${page}:${i}`;
      startUpTo(page, s.view.y);
      if (s.section && s.section !== heading) {
        heading = s.section;
        list.push({ id, heading, page, y: s.view.y });
      }
      if (!list.length) before = true;
      ofOffer.set(id, list.length - 1);
    });
  }
  startUpTo(Infinity, 0);

  const users = usersOf(c);
  const ofQuestion = new Map<string, number>();
  for (const q of c.questions) {
    const own = q.rects.find((id) => users.get(id)?.length === 1) ?? q.rects[0];
    const r = own ? c.rects[own] : undefined;
    if (!r) continue;
    ofQuestion.set(q.id, sectionOfBox({ list, ofOffer }, found, geometry, r.page, r.box));
  }

  if (before || list.length === 0 || Array.from(ofQuestion.values()).some((k) => k < 0)) {
    list.unshift(START);
    for (const [id, k] of ofOffer) ofOffer.set(id, k + 1);
    for (const [id, k] of ofQuestion) ofQuestion.set(id, k + 1);
  }
  return { list, ofOffer, ofQuestion };
}

/** The section of a box on a page: the suggested question it covers, or else its place. -1 before the first section. */
export function sectionOfBox(
  s: Pick<Sections, "list" | "ofOffer">,
  found: FoundPages,
  geometry: ReadonlyMap<number, PageGeometry>,
  page: number,
  box: PdfBox,
): number {
  const proposals = found[page - 1]?.proposals ?? [];
  let best: { k: number; v: number } | null = null;
  for (let i = 0; i < proposals.length; i++) {
    if (proposals[i].type !== "question") continue;
    const v = iou(proposals[i].box, box);
    const k = s.ofOffer.get(`s:${page}:${i}`);
    if (k !== undefined && v > 0.5 && (!best || v > best.v)) best = { k, v };
  }
  if (best) return best.k;
  const y = geometry.get(page)?.view(box).y ?? 0;
  const k = sectionAt(s.list, page, y);
  // Before the first heading, which sectionsFor makes a section of its own.
  return s.list[0] === START ? Math.max(k, 0) : k;
}

/** A section's topic choice: a topic id, No topic (null), or Same as above. */
export type Choice = string | null | "same";

export interface SectionRow {
  section: Section;
  /** The questions on screen in it, saved or drawn here. */
  questions: string[];
  /** Suggested questions in it, accepted or not. */
  suggested: number;
  /** Its first and last page with a question in it. */
  pages: [number, number];
  /** What its picker shows: a choice, or "mixed" when its questions have different topics. */
  shows: Choice | "mixed";
  /**
   * The topic its questions take: what it shows, the section above's for Same
   * as above, and undefined for "mixed" or under it, where a question keeps the
   * topic it has (a new one takes none).
   */
  topic: string | null | undefined;
}

/**
 * Each section's picker and topic, top to bottom. A section with questions
 * shows what they are: their one topic, "Same as above" when that is the
 * topic of the section above (so it follows that section when it changes), or
 * "mixed". The first section's base is No topic, so untagged questions under
 * no tagged section are "Same as above" too, and choosing the first section's
 * topic then tags the whole run. `picks` are the choices made on this screen:
 * a section given a topic shows it, and keeps it when the section above
 * changes, even when the two are the same; one with no question yet shows its
 * choice, Same as above by default, which is the topic its questions take
 * when they are accepted or drawn. A pick its questions no longer agree with
 * (one changed by hand) gives way to what they are.
 */
export function sectionRows(
  s: Sections,
  c: Crops,
  picks: ReadonlyMap<string, Choice>,
): SectionRow[] {
  const topicOf = new Map(c.questions.map((q) => [q.id, q.topic_id]));
  const pageOf = new Map<string, number>();
  for (const q of c.questions) {
    const pages = q.rects.map((id) => c.rects[id].page);
    if (pages.length) pageOf.set(q.id, Math.min(...pages));
  }
  const questions: string[][] = s.list.map(() => []);
  for (const [id, k] of s.ofQuestion) questions[k]?.push(id);
  const suggested = s.list.map(() => 0);
  const lo = s.list.map(() => Infinity);
  const hi = s.list.map(() => -Infinity);
  for (const [id, k] of s.ofOffer) {
    suggested[k]++;
    const p = Number(id.split(":")[1]);
    lo[k] = Math.min(lo[k], p);
    hi[k] = Math.max(hi[k], p);
  }
  for (let k = 0; k < s.list.length; k++) {
    for (const id of questions[k]) {
      const p = pageOf.get(id) ?? s.list[k].page;
      lo[k] = Math.min(lo[k], p);
      hi[k] = Math.max(hi[k], p);
    }
  }

  const rows: SectionRow[] = [];
  let above: string | null | undefined = null;
  s.list.forEach((section, k) => {
    let shows: Choice | "mixed";
    let topic: string | null | undefined;
    // No topic is a choice (null), so a pick is told apart by has(), not by ??.
    const pick = picks.has(section.id) ? picks.get(section.id) : undefined;
    if (!questions[k].length) {
      shows = pick !== undefined ? pick : k === 0 ? null : "same";
      topic = shows === "same" ? above : shows;
    } else {
      const ts = new Set(questions[k].map((id) => topicOf.get(id) ?? null));
      if (ts.size > 1) {
        shows = "mixed";
        topic = undefined;
      } else {
        const t = ts.values().next().value as string | null;
        shows = pick !== undefined && pick !== "same" && pick === t ? t : k > 0 && t === above ? "same" : t;
        topic = t;
      }
    }
    const pages: [number, number] = lo[k] <= hi[k] ? [lo[k], hi[k]] : [section.page, section.page];
    rows.push({ section, questions: questions[k], suggested: suggested[k], pages, shows, topic });
    above = topic;
  });
  return rows;
}

/**
 * Choosing section k's topic: every question in it takes it, and so does every
 * question of each section under it that shows Same as above, down to the
 * first that does not, saved questions included. `retag` holds each question
 * whose topic changes, with its new topic; `pick` is the choice to keep, for
 * sectionRows. Same as above under "mixed" changes nothing.
 */
export function chooseTopic(
  rows: readonly SectionRow[],
  k: number,
  choice: Choice,
  topicOf: (question: string) => string | null,
): { retag: Map<string, string | null>; pick: Choice | undefined } {
  const retag = new Map<string, string | null>();
  const row = rows[k];
  if (!row) return { retag, pick: undefined };
  const topic = choice === "same" ? (k > 0 ? rows[k - 1].topic : null) : choice;
  const pick = choice;
  if (topic === undefined) return { retag, pick };
  for (let j = k; j < rows.length && (j === k || rows[j].shows === "same"); j++) {
    for (const q of rows[j].questions) if (topicOf(q) !== topic) retag.set(q, topic);
  }
  return { retag, pick };
}
