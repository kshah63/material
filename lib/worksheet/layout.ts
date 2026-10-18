// The worksheet's layout (docs/WORKSHEETS.md §6.2, §6.5): the order picks print
// in, where each question's boxes and its source line go on the template's
// pages, the source line's text, and the file's name. Pure: no pdf.js, no
// pdf-lib and no DOM, so it is tested in Node (supabase/tests/worksheet.mjs).
// Every length is in PDF points; y grows upwards, as pdf-lib draws.

export const MM = 72 / 25.4;
/** Every crop is drawn at 300 dpi of the size it prints (§6.3). */
export const DPI = 300;
/**
 * A worksheet page: the templates' own size, which is what Chrome wrote, not
 * A4's nominal 595.28 × 841.89 (§6.1). The modal draws each box for this page
 * and the PDF is laid out on it, so the two always agree.
 */
export const PAGE: PageSize = { width: 594.96, height: 841.92 };

// The content area (§6.2): 15 to 195 mm across, from 26 mm below the top to
// 24 mm above the bottom of the template's page, which makes it 247 mm tall.
const LEFT = 15 * MM;
const WIDTH = 180 * MM;
const TOP = 26 * MM;
const BOTTOM = 24 * MM;
const MAX_SCALE = 1.25;
// A question this tall or less, boxes and source line, is short: two short ones
// in a row share a page.
const SHORT = 74 * MM;
// Lengths this close are equal, so that a box that exactly fits, fits.
const EPS = 0.01;

/** The source line (§6.1): 8 pt Helvetica in the template's label grey, 2 mm under the last box. */
export const LINE_SIZE = 8;
export const LINE_GREY = { r: 0xb4 / 255, g: 0xb8 / 255, b: 0xc5 / 255 };
const LINE_GAP = 2 * MM;
/** The room a source line takes under its box: the gap, then the line. */
const LINE_BLOCK = LINE_GAP + LINE_SIZE;

/** A box as displayed on its bank's page, at scale 1: after /Rotate, so the picture's shape. */
export interface BoxSize {
  w: number;
  h: number;
}

export interface PageSize {
  width: number;
  height: number;
}

/** A box placed on a worksheet page (0-based): its bottom-left corner and printed size. */
export interface Placed {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One question on the worksheet: its scale, its boxes in box_no order, and where its source line starts. */
export interface Placement {
  scale: number;
  boxes: Placed[];
  line: { page: number; x: number; y: number };
}

export interface Layout {
  pages: number;
  questions: Placement[];
}

/** The content area of a template page. */
export function contentArea(size: PageSize) {
  const top = size.height - TOP;
  return { x: LEFT, width: WIDTH, top, bottom: BOTTOM, height: top - BOTTOM };
}

/**
 * The one scale a question's boxes print at (§6.2), and whether it fits one page.
 * Its width sets it: min(1.25, 180 mm ÷ its widest box). Where that enlarges a
 * question that fits one page at the bank's own size, its source line included,
 * past a page, it prints at the largest scale that fits, 1 or more, so that the
 * enlargement never puts a stimulus on one page and its question on the next.
 * No page height shrinks it further, so a question a little under a page tall
 * prints at nearly the scale of one a little over. A question that does not fit
 * one page flows over pages. Only a box too tall for a page by itself brings its
 * question's scale down, until that box fits a page with the source line under
 * it, so no box is ever cut; a box no taller than an A4 page then still prints
 * at 81% of its size or more.
 */
export function scaleOf(boxes: BoxSize[], areaHeight: number): { scale: number; fits: boolean } {
  const widest = Math.max(...boxes.map((b) => b.w));
  const tallest = Math.max(...boxes.map((b) => b.h));
  const stacked = boxes.reduce((t, b) => t + b.h, 0);
  const scale = Math.min(MAX_SCALE, WIDTH / widest);
  if (stacked * scale + LINE_BLOCK <= areaHeight + EPS) return { scale, fits: true };
  const fit = (areaHeight - LINE_BLOCK) / stacked;
  if (fit >= 1) return { scale: fit, fits: true };
  return { scale: Math.min(scale, (areaHeight - LINE_BLOCK) / tallest), fits: false };
}

/**
 * Where every question goes, in print order (§6.2). A question's boxes stack in
 * box_no order, left-aligned, one under another with no gap (a box already
 * carries 4 pt of margin round its ink, §5.1 box edges), and its source line
 * follows 2 mm under the last box. Each question starts a page of its own, at
 * the top of the content area, except the second of two short questions in a
 * row, which starts at the area's midpoint. A box that does not fit under the
 * one before it starts the next page; the last box needs room for the source
 * line too, so the line always sits under it. The rest of the page after the
 * last box is the question's working space.
 */
export function layout(questions: BoxSize[][], size: PageSize): Layout {
  const area = contentArea(size);
  const placed: Placement[] = [];
  let page = -1;
  // The page so far holds one short question, and its lower half is free.
  let half = false;
  for (const boxes of questions) {
    const { scale, fits } = scaleOf(boxes, area.height);
    const short = fits && boxes.reduce((t, b) => t + b.h, 0) * scale + LINE_BLOCK <= SHORT + EPS;
    let y: number;
    if (short && half) {
      y = area.top - area.height / 2;
      half = false;
    } else {
      page += 1;
      y = area.top;
      half = short;
    }
    const out: Placed[] = [];
    boxes.forEach((b, i) => {
      const w = b.w * scale;
      const h = b.h * scale;
      const need = h + (i === boxes.length - 1 ? LINE_BLOCK : 0);
      if (y - need < area.bottom - EPS && y < area.top - EPS) {
        page += 1;
        y = area.top;
      }
      y -= h;
      out.push({ page, x: area.x, y, w, h });
    });
    // The baseline: the gap, then three quarters of the size, which clears
    // Helvetica's ascenders; its descenders stay inside LINE_BLOCK.
    placed.push({ scale, boxes: out, line: { page, x: area.x, y: y - LINE_GAP - 0.75 * LINE_SIZE } });
  }
  return { pages: page + 1, questions: placed };
}

// --- the source line (§6.1) -----------------------------------------------------

/** The pages a question's boxes are on, in order: "p. 12", "pp. 12–13", "pp. 4, 9", "pp. 4–5, 9". */
export function pagesText(pages: number[]): string {
  const ps = Array.from(new Set(pages)).sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < ps.length; ) {
    let j = i;
    while (j + 1 < ps.length && ps[j + 1] === ps[j] + 1) j++;
    runs.push(j > i ? `${ps[i]}–${ps[j]}` : `${ps[i]}`);
    i = j + 1;
  }
  return `${ps.length === 1 ? "p." : "pp."} ${runs.join(", ")}`;
}

// The characters of WinAnsi (Windows-1252), the only ones pdf-lib's standard
// fonts can draw: printable ASCII, Latin-1's upper half, and these.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
function drawable(ch: string): boolean {
  const n = ch.codePointAt(0)!;
  return (n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || WIN_ANSI_EXTRA.has(ch);
}

// Letters outside WinAnsi that no accent makes: Vietnamese "Đ" looks the same
// as Icelandic "Ð", which WinAnsi has.
const LOOK_ALIKE: Record<string, string> = { "Đ": "Ð", "đ": "d" };

/**
 * The text with every character Helvetica cannot draw replaced, since pdf-lib
 * throws on one: a letter outside WinAnsi keeps its letter and every accent
 * WinAnsi still has with it ("ố" prints as "ô", "ậ" as "â", "ő" as "o"), "Đ"
 * prints as "Ð", white space is a space, and anything else is "?".
 */
export function winAnsi(text: string): string {
  const all = (t: string) => Array.from(t).every(drawable);
  let out = "";
  for (const ch of text.normalize("NFC")) {
    if (drawable(ch)) out += ch;
    else if (LOOK_ALIKE[ch]) out += LOOK_ALIKE[ch];
    else if (/\s/u.test(ch)) out += " ";
    else {
      const parts = Array.from(ch.normalize("NFD"));
      let kept = parts.filter((p) => !/\p{M}/u.test(p)).join("");
      if (!kept || !all(kept)) {
        out += "?";
        continue;
      }
      // Its accents put back one at a time, in order, each only if the letter
      // with it can still be drawn.
      for (const mark of parts.filter((p) => /\p{M}/u.test(p))) {
        const tried = (kept + mark).normalize("NFC");
        if (all(tried)) kept = tried;
      }
      out += kept;
    }
  }
  return out;
}

/**
 * What prints under a question, so a teacher can find it in the bank's mark
 * scheme: the bank's file name without ".pdf", and the pages its boxes are on,
 * "U4 BOOKLET WORKSHEET 1 (L1-8) · p. 12". Only characters Helvetica can draw.
 * Given a width and the font's measure, a name too long for it is cut short
 * with "…", and the pages always stay.
 */
export function sourceLine(
  fileName: string,
  pages: number[],
  fit?: { width: number; measure: (text: string) => number },
): string {
  const name = winAnsi(fileName.replace(/\.pdf$/i, "").trim());
  const tail = ` · ${pagesText(pages)}`;
  if (!fit || fit.measure(name + tail) <= fit.width) return name + tail;
  const chars = Array.from(name);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fit.measure(`${chars.slice(0, mid).join("").trimEnd()}…${tail}`) <= fit.width) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join("").trimEnd()}…${tail}`;
}

// --- order and names ------------------------------------------------------------

/** A bank's label: its folder path and name, "Banks / Gr 5 / Fractions.pdf" (§4.2). */
export function bankPath(
  name: string,
  folderId: string | null,
  folders: { id: string; parent_id: string | null; name: string }[],
): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: string[] = [name];
  const seen = new Set<string>();
  for (let id = folderId; id !== null && !seen.has(id); ) {
    seen.add(id);
    const f = byId.get(id);
    if (!f) break;
    path.unshift(f.name);
    id = f.parent_id;
  }
  return path.join(" / ");
}

/**
 * Bank order (§2.2, §4.4): by bank (its label, then its id, so two banks with
 * one label never interleave), then by the questions' boxes compared one by one
 * in box_no order, by page and then reading order, then by id. Questions under
 * one stimulus share their first box, so their second decides.
 */
export function printOrder<
  Q extends { id: string; bank: string; file: string; boxes: { page: number; pos: number }[] },
>(questions: Q[]): Q[] {
  return [...questions].sort((a, b) => {
    const bank = a.bank.localeCompare(b.bank) || a.file.localeCompare(b.file);
    if (bank) return bank;
    for (let i = 0; i < Math.min(a.boxes.length, b.boxes.length); i++) {
      const d = a.boxes[i].page - b.boxes[i].page || a.boxes[i].pos - b.boxes[i].pos;
      if (d) return d;
    }
    return a.boxes.length - b.boxes.length || a.id.localeCompare(b.id);
  });
}

export type Label = "lesson" | "homework";

/**
 * The worksheet's name (§6.5): "MathVision Homework IM2T 2026-10-17 1430", in
 * the teacher's local time, so two made the same day for two children differ.
 * The course's code, else its name. Only letters, digits, spaces, hyphens and
 * brackets are kept. The file is this with ".pdf", and the PDF's Title is this.
 */
export function worksheetName(label: Label, course: { code: string | null; name: string }, at: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const when = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}${two(at.getMinutes())}`;
  const raw = `MathVision ${label === "lesson" ? "Lesson" : "Homework"} ${course.code?.trim() || course.name} ${when}`;
  return raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{Nd} \-()[\]]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
