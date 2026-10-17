// Text-layer suggestions (docs/WORKSHEETS.md §5.1), as pure functions: the kind
// of page, the question numbers in its text layer, and each question's box from
// the page's ink. A port of docs/worksheets/textlayer/propose.mjs, the rules as
// measured on the centre's banks (§9.2.1), one function per rule so that a rule
// changed later changes one function. Nothing here touches pdf.js or the DOM:
// the caller hands over pdf.js's text content, the page's viewport at scale 1
// and the page drawn at INK_SCALE (lib/worksheet/source.ts suggestionsFor).
//
// Two of §5.1's rules are not here, as they are not in propose.mjs:
// - reading order (rule 9) is set when a page is saved, from its boxes
//   (crops.ts readingOrder);
// - the ink test that rejects invisible (render mode 3) text (kind of page,
//   step 2). None of the sample banks had any.
import type { PdfBox, ViewRect } from "./source";

/** The page is drawn for the ink tests at 2 canvas pixels per point: 144 dpi. */
export const INK_SCALE = 2;
const S = INK_SCALE;
const PAD = 4; // points round every box

export type PageKind = "digital" | "scanned" | "none";

/** The page's viewport at scale 1 (pdf.js PageViewport): the displayed page in points, y down. */
export interface Viewport {
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
  convertToPdfPoint(x: number, y: number): number[];
}

/** The page drawn at INK_SCALE, as a canvas's getImageData returns it. */
export interface Ink {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** A suggested question: its printed number, and its box on the page. */
export interface Proposal {
  n: number;
  /** A cell of a problem set printed as a table (rule 4). */
  grid: boolean;
  /** On the displayed page, in points, y down. */
  view: ViewRect;
  /** In PDF user space, y up, as save_crops stores a box. */
  box: PdfBox;
}

/** A text item on the displayed page: its text and its bounds, in points, y down. */
interface Item {
  s: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Line {
  y0: number;
  y1: number;
  items: Item[];
  text: string;
}

/** A question number found on a line (rule 3). */
interface Label {
  n: number;
  x: number;
  /** Its line's index in the lines it was found in. */
  li: number;
  line: Line;
  /** The line's first token. */
  first: boolean;
}

/** A page's text layer, read once: what every rule after the first works from. */
export interface PageText {
  items: Item[];
  chars: number;
  /** Body text's height: the median item height, weighted by characters. */
  bodyH: number;
  lines: Line[];
  /** The line of an answers heading, which ends the questions (rule 6). */
  answers: Line | null;
  /** A cover page (rule 6). */
  cover: boolean;
}

const last = <T>(a: T[]): T => a[a.length - 1];

// --- kind of page ---------------------------------------------------------------

/**
 * The share of the page its largest image covers, from pdf.js's
 * page.imageCoordinates after a render with recordImages: three corners per
 * image, as fractions of the canvas.
 */
export function imageCoverage(coords: ArrayLike<number> | null | undefined): number {
  let coverage = 0;
  if (coords) {
    for (let k = 0; k + 5 < coords.length; k += 6) {
      const xs = [coords[k], coords[k + 2], coords[k + 4]];
      const ys = [coords[k + 1], coords[k + 3], coords[k + 5]];
      coverage = Math.max(
        coverage,
        (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)),
      );
    }
  }
  return coverage;
}

/**
 * Kind of page, per page: scanned when one image covers half the page, checked
 * first so that an OCR layer over a scan never counts as text; otherwise digital
 * with 20 characters or more (not 100: a page of graphs under one printed
 * question still has its label line); otherwise neither, which is text turned
 * into outlines, or no text.
 */
export function pageKind(coverage: number, chars: number): PageKind {
  return coverage >= 0.5 ? "scanned" : chars >= 20 ? "digital" : "none";
}

// --- rule 1: coordinates --------------------------------------------------------

/**
 * Every text item with text, mapped onto the displayed page through the
 * viewport, which handles /Rotate and CropBox offsets. An item's box runs along
 * its baseline for its width and up 0.8 of its font size.
 */
function itemsOf(content: ReadonlyArray<object>, vp: Viewport): Item[] {
  const items: Item[] = [];
  for (const it of content) {
    if (!("str" in it)) continue;
    const run = it as { str: string; transform: number[]; width: number };
    if (!run.str.trim()) continue;
    const [a, b, c, d, e, f] = run.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const n1 = Math.hypot(a, b) || 1;
    const n2 = Math.hypot(c, d) || 1;
    const ux = a / n1;
    const uy = b / n1;
    const vx = c / n2;
    const vy = d / n2;
    const pts = [
      [e, f],
      [e + ux * run.width, f + uy * run.width],
      [e + vx * size * 0.8, f + vy * size * 0.8],
      [e + ux * run.width + vx * size * 0.8, f + uy * run.width + vy * size * 0.8],
    ].map(([x, y]) => vp.convertToViewportPoint(x, y));
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    items.push({
      s: run.str.trim(),
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
    });
  }
  return items;
}

// --- rule 2: lines --------------------------------------------------------------

/** The median item height, each item counted once per character, up to 50. */
function bodyHeight(items: Item[]): number {
  const hs = items
    .flatMap((it) => Array<number>(Math.min(it.s.length, 50)).fill(it.y1 - it.y0))
    .sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)] ?? 0;
}

/** Items grouped by vertical centre, within half a glyph height; each line read left to right. */
function linesOf(items: Item[]): Line[] {
  const sorted = items.slice().sort((m, n) => m.y0 - n.y0 || m.x0 - n.x0);
  const lines: Line[] = [];
  for (const it of sorted) {
    const h = it.y1 - it.y0;
    const ln = lines.find((l) => Math.abs((l.y0 + l.y1) / 2 - (it.y0 + it.y1) / 2) < h * 0.5);
    if (ln) {
      ln.items.push(it);
      ln.y0 = Math.min(ln.y0, it.y0);
      ln.y1 = Math.max(ln.y1, it.y1);
    } else lines.push({ y0: it.y0, y1: it.y1, items: [it], text: "" });
  }
  lines.sort((a, b) => a.y0 - b.y0);
  for (const l of lines) {
    l.items.sort((m, n) => m.x0 - n.x0);
    l.text = l.items.map((i) => i.s).join(" ");
  }
  return lines;
}

/**
 * Lines from body-size items only: Word's maths sets every sub- and superscript
 * as a separate small item, and as lines of their own they shrink the gap above
 * a label to nothing. Each small item then joins the nearest line beside it, so
 * that line's top and bottom take in a fraction's numerator; left out, the next
 * question's dy/dx reads as the last ink of the one above.
 */
function bodyLines(items: Item[], bodyH: number): Line[] {
  const lines = linesOf(items.filter((it) => it.y1 - it.y0 >= bodyH * 0.75));
  for (const it of items.filter((it) => it.y1 - it.y0 < bodyH * 0.75)) {
    const cy = (it.y0 + it.y1) / 2;
    let best: Line | null = null;
    let bestD = bodyH;
    for (const l of lines) {
      const d = cy < l.y0 ? l.y0 - cy : cy > l.y1 ? cy - l.y1 : 0;
      if (d < bestD && it.x0 < last(l.items).x1 + 20 && it.x1 > l.items[0].x0 - 20) {
        best = l;
        bestD = d;
      }
    }
    if (best) {
      best.y0 = Math.min(best.y0, it.y0);
      best.y1 = Math.max(best.y1, it.y1);
    }
  }
  return lines;
}

// --- rule 3: labels -------------------------------------------------------------

// A label is a line's first token. A bare number needs a prefix ("Q2", "EX 1");
// unprefixed it must be followed by . ) or :, or every table of data with
// consecutive values down its first column is a run of questions.
const FIRST = /^(?:(?:Q(?:uestion)?|EX|Example)\s*(\d{1,3})(?:\s*[.):](?!\d)|$)|(\d{1,3})[.):](?!\d))/i;
const FIRST_MERGED = /^(?:(?:Q(?:uestion)?|EX|Example)\s*)?(\d{1,3})[.):]\s+\S/i;
// Later in a line, only as the next cell of a grid row: "2." or "2. y = ...".
const INLINE = /^(\d{1,3})[.)](?:\s+\S.*)?$/;

/**
 * The question number an item is, as its line's first token or a later one, or
 * null. Sub-parts never match, so they never split a question (rule 8): a.–z.,
 * (a)–(h) and (i)–(viii) carry no digits.
 */
function labelOf(s: string, first: boolean): number | null {
  const m = first ? s.match(FIRST) || s.match(FIRST_MERGED) : s.match(INLINE);
  return m ? +(m[1] ?? m[2]) : null;
}

// --- rule 4: runs ---------------------------------------------------------------

/**
 * Labels chained into runs of consecutive numbers. Every run is kept, because a
 * bank page restarts its numbering for each section (AP MCQ 1-6, then AP FRQ
 * 1-3). A run needs no gap above its labels; a lone label does, measured against
 * body text height, since a line holding a big fraction is tall. Labels at or
 * below `limit` are not read.
 */
function runsOf(lines: Line[], limit: number, bodyH: number): Label[][] {
  const toks: Label[] = [];
  lines.forEach((l, li) =>
    l.items.forEach((it, k) => {
      if (it.y0 >= limit) return;
      const n = labelOf(it.s, k === 0);
      if (n !== null) toks.push({ n, x: it.x0, li, line: l, first: k === 0 });
    }),
  );
  const gapAbove = (t: Label) => (t.li === 0 ? Infinity : t.line.y0 - lines[t.li - 1].y1);
  const spaced = (t: Label) => gapAbove(t) > bodyH;
  const runs: Label[][] = [];
  for (const t of toks) {
    const open = runs.filter((r) => {
      const prev = last(r);
      if (prev.n !== t.n - 1) return false;
      if (prev.li === t.li) return true; // side by side: the next cell of a grid row
      return r.some((u) => Math.abs(u.x - t.x) < 6); // under the run's own left edge
    });
    // Two runs can both want it: after "Question 3: Arrange in order: 1. 2. 3.",
    // a spaced-out "4." continues the spaced-out questions, not the list. Else
    // the latest run, the section this page is in now.
    let run: Label[] | undefined;
    for (let i = open.length - 1; i >= 0 && !run; i--) {
      if (spaced(t) === open[i].every(spaced)) run = open[i];
    }
    run ??= open[open.length - 1];
    if (run) run.push(t);
    else if (t.first) runs.push([t]);
  }
  // A run that sits wholly between two labels of another is a list inside that
  // question, never questions of its own.
  const inside = (r: Label[]) =>
    runs.some(
      (o) =>
        o !== r &&
        o.some(
          (a, k) =>
            k + 1 < o.length &&
            a.line.y1 <= r[0].line.y0 &&
            o[k + 1].line.y0 >= last(r).line.y1 &&
            Math.abs(a.x - r[0].x) < 6,
        ),
    );
  return runs.filter((r) => (r.length >= 2 || spaced(r[0])) && !inside(r));
}

// --- rule 5: columns ------------------------------------------------------------

/**
 * The page's columns, as [left, right] in points. An empty band in the middle
 * 30-70% of the width is a gutter only if each side carries a run of its own. A
 * grid's cells, read one side at a time, are odd and even numbers, which is no
 * run, so a grid never splits.
 */
function columnsOf(page: PageText, W: number, limit: number): [number, number][] {
  const { items, bodyH } = page;
  const bins = new Array<number>(100).fill(0);
  for (const it of items) {
    for (let k = Math.floor((it.x0 / W) * 100); k <= Math.min(99, Math.floor((it.x1 / W) * 100)); k++) bins[k]++;
  }
  const tol = Math.max(1, items.length * 0.03);
  let band: [number, number] | null = null;
  for (let k = 30; k <= 70; k++) {
    if (bins[k] <= tol) {
      let j = k;
      while (j + 1 <= 70 && bins[j + 1] <= tol) j++;
      if (!band || j - k > band[1] - band[0]) band = [k, j];
      k = j;
    }
  }
  if (band) {
    const g = ((band[0] + band[1] + 1) / 2 / 100) * W;
    const side = (keep: (i: Item) => boolean) =>
      runsOf(bodyLines(items.filter(keep), bodyH), limit, bodyH).some((r) => r.length >= 2);
    if (side((i) => i.x1 <= g + 1) && side((i) => i.x0 >= g - 1)) {
      return [
        [0, g],
        [g, W],
      ];
    }
  }
  return [[0, W]];
}

// --- rule 6: where questions are not --------------------------------------------

// "Answers", "Answer Key", or a title ending "(Answers)". Not any line ending in
// "answer": "Justify your answer" wraps onto lines of its own.
const ANSWERS =
  /^(?:answers?|answer key|mark scheme|solutions?)\s*:?$|\((?:answers?|answer key|mark scheme|solutions?)\)\s*$/i;

/** The page's answers heading, if it has one. */
function answersLine(lines: Line[]): Line | null {
  return lines.find((l) => l.text.length < 80 && ANSWERS.test(l.text.trim())) ?? null;
}

/**
 * A cover: a "Name:" line and a "School:" line. It holds a contents list and the
 * rules for students, both numbered, and never a question.
 */
function isCover(lines: Line[]): boolean {
  return lines.some((l) => /^name\s*:/i.test(l.text)) && lines.some((l) => /^school\s*:/i.test(l.text));
}

/** Where the page's questions end: its answers heading, or the footer band (the outer 6%). */
function questionsEnd(page: PageText, vp: Viewport): number {
  return page.answers ? page.answers.y0 - 1 : vp.height * 0.94;
}

/**
 * Whether this page ends the bank's questions: a digital page with an answers
 * heading. Nothing is proposed below it, nor on any page after it.
 */
export function endsQuestions(kind: PageKind, page: PageText): boolean {
  return kind === "digital" && page.answers !== null;
}

// --- rule 7: the box ------------------------------------------------------------

interface Column {
  x0: number;
  x1: number;
  /** Every label kept in the column. */
  all: Label[];
  limit: number;
  /** The page's width. */
  W: number;
}

/**
 * One question's box on the displayed page, [left, top, right, bottom]:
 * - top: the label's line, less PAD;
 * - left: the label less PAD, or ink within 30 pt left of it on its own line,
 *   which is a calculator icon and part of the question;
 * - right: on a grid, the next cell's label; otherwise a label at least a
 *   quarter of the page to the right inside this question's span, which is a
 *   second column and never a list indented inside the question; otherwise the
 *   column's edge;
 * - bottom: the last inked row above the next label below that starts inside
 *   the box's width, or above the footer band or the answers heading;
 * - sides: shrunk to the ink, plus PAD.
 * Ink, not text, sets the bottom: diagrams and answer lines stay inside, and
 * the blank working space a lesson page leaves under an example stays out.
 */
function boxOf(t: Label, grid: boolean, col: Column, ink: Ink): [number, number, number, number] {
  const { all, limit, W } = col;
  const img = ink.data;
  const dark = (x: number, y: number) => {
    const o = (y * ink.width + x) * 4;
    return img[o] + img[o + 1] + img[o + 2] < 600;
  };
  // Left: the label, or ink just left of it on its own line (a calculator icon).
  let left = t.x - PAD;
  const ly0 = Math.floor(t.line.y0 * S);
  const ly1 = Math.ceil(t.line.y1 * S);
  for (let x = Math.floor((t.x - 2) * S); x >= Math.max(Math.floor(col.x0 * S), Math.floor((t.x - 30) * S)); x--) {
    let found = false;
    for (let y = ly0; y <= ly1 && !found; y++) found = dark(x, y);
    if (found) left = Math.min(left, x / S - PAD);
  }
  left = Math.max(left, col.x0);
  // Bottom, first: the next label under this one.
  let bottom = Math.min(
    limit,
    ...all.filter((u) => u !== t && u.line.y0 > t.line.y1 - 1 && Math.abs(u.x - t.x) < 6).map((u) => u.line.y0 - 1),
  );
  // Right: on a grid, the next cell along the line. Otherwise a label at least
  // a quarter of the page to the right, inside this question's span: never a
  // list indented inside the question itself.
  const beside = all.filter(
    (u) =>
      u !== t &&
      u.line.y1 > t.line.y0 &&
      (grid ? u.x > t.x + 20 && u.line.y0 < t.line.y1 : u.x > t.x + W / 4 && u.line.y0 < bottom),
  );
  const right = beside.length ? Math.min(...beside.map((u) => u.x)) - PAD : col.x1;
  // Bottom, then: any label below that starts inside this width, such as the
  // first of the next section further left.
  bottom = Math.min(
    bottom,
    ...all
      .filter((u) => u !== t && u.line.y0 > t.line.y1 - 1 && u.x < right - 20 && (grid || u.x > left - 200))
      .map((u) => u.line.y0 - 1),
  );
  // Ink sets the box: the last inked row above the bottom, found from the
  // label's own column rightwards (the strip left of it holds the next
  // question's icon, which stands taller than its line), then the sides.
  const X0 = Math.max(0, Math.floor(left * S));
  const X1 = Math.min(ink.width - 1, Math.ceil(right * S) - 1);
  const XL = Math.max(X0, Math.floor((t.x - PAD) * S));
  const Y0 = Math.floor((t.line.y0 - 1) * S);
  let Y1 = Math.floor(bottom * S);
  const rowInk = (y: number) => {
    for (let x = XL; x <= X1; x++) if (dark(x, y)) return true;
    return false;
  };
  while (Y1 > Y0 && !rowInk(Y1)) Y1--;
  let minX = X1;
  let maxX = X0;
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      if (dark(x, y)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }
  return [
    Math.max(left, minX / S - PAD),
    Math.max(0, t.line.y0 - PAD),
    Math.min(right, maxX / S + PAD),
    Math.min(bottom, Y1 / S + PAD),
  ];
}

// --- the page -------------------------------------------------------------------

/** A page's text layer, read once (rules 1, 2 and 6), from pdf.js's getTextContent items. */
export function readText(content: ReadonlyArray<object>, vp: Viewport): PageText {
  const items = itemsOf(content, vp);
  const chars = items.reduce((n, it) => n + it.s.length, 0);
  const bodyH = bodyHeight(items);
  const lines = bodyLines(items, bodyH);
  return { items, chars, bodyH, lines, answers: answersLine(lines), cover: isCover(lines) };
}

/**
 * The questions proposed on a digital page that no earlier page's answers
 * heading has ended (endsQuestions), in the order propose.mjs finds them:
 * column by column, run by run. `ink` is the page drawn at INK_SCALE.
 */
export function propose(page: PageText, vp: Viewport, ink: Ink): Proposal[] {
  if (page.cover) return [];
  const limit = questionsEnd(page, vp);
  const W = vp.width;
  const columns = columnsOf(page, W, limit);
  const proposals: Proposal[] = [];
  for (const [x0, x1] of columns) {
    const lines =
      columns.length > 1
        ? bodyLines(page.items.filter((i) => i.x0 >= x0 - 1 && i.x1 <= x1 + 1), page.bodyH)
        : page.lines;
    const kept = runsOf(lines, limit, page.bodyH);
    const col: Column = { x0, x1, all: kept.flat(), limit, W };
    for (const r of kept) {
      const grid = new Set(r.map((t) => t.li)).size < r.length; // two labels on one line
      for (const t of r) {
        const [l, tp, rt, b] = boxOf(t, grid, col, ink);
        const [ax, ay] = vp.convertToPdfPoint(l, tp);
        const [bx, by] = vp.convertToPdfPoint(rt, b);
        proposals.push({
          n: t.n,
          grid,
          view: { x: Math.min(l, rt), y: Math.min(tp, b), w: Math.abs(rt - l), h: Math.abs(b - tp) },
          box: { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) },
        });
      }
    }
  }
  return proposals;
}
