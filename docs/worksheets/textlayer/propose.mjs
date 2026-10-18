// The text-layer suggestions of docs/WORKSHEETS.md §5.1, as measured on the
// centre's banks (§9.2.1): finder v2.2, the lab finder that
// lib/worksheet/propose.ts was ported from, with the rules the port leaves out
// taken out the same way: R28 and R54-R56 (off by default, each waiting on an
// owner question), R57 (on, but it changed nothing on any of the 219 banks) and
// R53's prose-page form (iii) (off since v2.1). R58-R66 were never built. Added
// after the finished branch's review: R67-R69, and stems and contexts that end
// at a section heading (docs/WORKSHEETS.md §5.1). v1, the finder of the first
// ten banks, is this file before finder v2.2 in git.
// Each page is classified, its question numbers found in its text layer, and
// each box drawn from the rendered page's ink. Writes p<N>.png with the boxes
// drawn on (orange: a question, green: a grid cell, blue: a continuation box,
// purple: a shared stem or context box) and prints one JSON array, a row per
// page, in v1's shape with fields added.
//
// Usage, from the repository root, so that pdf.js, its assets and
// @napi-rs/canvas come from this checkout's node_modules:
//   node docs/worksheets/textlayer/propose.mjs <bank.pdf> <outDir>
// A bank is only ever an argument: nothing runs from its directory.
// docs/worksheets/textlayer/compare.mjs runs this beside the port and says
// whether they agree.
// Flags (environment):
//   V2_OFF=R3,R7   turn listed rules off. V2_OFF=all is v1, output for output.
//   V2_TEST_NOWASM=1  lab only: leave wasmUrl out, to show R6 on a scan.
//   V2_TEST_NOANS=1   lab only: no answers heading at all, to show R14/R15 alone.
//   V2_PAGES=3,7      lab only: read only these pages (state from the others is lost).
//   V2_DEBUG=1        lab only: print each page's labels, runs and drops to stderr.
//   V2_NOPNG=1        lab only: write no overlay PNGs (stdout is the same).
// Added fields. Page: rules_fired (rules that changed anything on the page,
// suppressing included), ai (where Suggest boxes would be offered, §5.2: not
// built), cover, invisible_items. Proposal: type ("question", "continuation",
// "stem", "context"), rules (rules that created it or moved one of its edges by
// 0.5 pt or more), and when they apply: for (the questions a non-question box
// belongs to), box_no, check ("?"), why, tags, section, label.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// pdf.js and its assets resolve from the directory this runs in, as v1's do.
const LIB = path.resolve("node_modules/pdfjs-dist");
const pdfjs = await import(pathToFileURL(LIB + "/legacy/build/pdf.mjs").href);
const OPS = pdfjs.OPS;

// ---------------------------------------------------------------- rules ---
const RULES = {
  R1: "visible text over a page-size image makes the page digital when it yields a question",
  R2: "a text item counts only where the render has ink in its box",
  R3: "a page under 20 characters is digital when it yields a question",
  R4: "a page with no proposals whose ink lies 90% inside placed images is scanned",
  R5: "a page with no ink inside its margins and no body text is blank",
  R6: "a page that paints images but renders white is render-failed",
  R7: "a Name/School line in a test header is not a cover",
  R8: "a Contents or Index page proposes nothing",
  R9: "answers heading forms: Markscheme, '(topic)' suffix, ': Mark scheme', 'Mark scheme for', Suggested/Model/Sample",
  R10: "answers in a dash title: '- Answer Key', '- Answers & Explanations', ': Solutions'",
  R11: "an answers heading must look like a heading",
  R12: "the answers heading is looked for on every page, whatever its kind",
  R13: "answers end at the sheet: a later page with a Name: line starts a new one",
  R14: "a run whose lines hold only answer letters is an answer key",
  R15: "an unheaded answer key: the section lengths, or two once-printed headings, repeat later on fewer pages with short entries",
  R16: "a label split across abutting items is read joined (and a split decimal is a number)",
  R17: "two labels painted on one spot: keep the one on top",
  R18: "0 is never a label",
  R19: "a colon before a digit is a ratio, not a label stop",
  R20: "'*2.' and '6 .' are labels",
  R21: "'4a)', '7a.', '2 a)' are labels when they continue a run",
  R22: "an answer blank before the number does not hide it ('____8.')",
  R23: "'FRQ n', 'Short/Long FRQ n', and 'Q n - Title' are labels",
  R24: "a bare number in a hanging column left of the text margin, before a stem, is a label",
  R25: "a hanging number alone on its line, with ink to its right, is a label in a run of ordinary labels",
  R26: "a number with no stop that continues a run exactly is a label ('55 The...')",
  R27: "a number set 1.25x body size is a chapter title (one or two, among body-size labels), not a label",
  R29: "a label-free heading line ends the box above it, and a run after one is a new section, not a nested list",
  R30: "a lone label under a heading, or under only the running header, is kept",
  R31: "a run starting at N+1 a quarter-page right of a run ending at N is the next column",
  R32: "column-major cells start runs, and a same-line label bounds the box on its left",
  R33: "a run from 1 indented inside a question's span is a list in that question",
  R34: "a run from 1 under a sub-part line or an FRQ heading is a list in that part",
  R35: "in a file of 'Question N' labels, indented bare runs after one are lists",
  R36: "a run 6-10 pt off its column still chains; an off-x N+1 is not a nested list",
  R37: "a box that holds a dropped list gets '?'",
  R38: "the gutter is the widest empty run of bins, not the middle of the sparse band",
  R39: "no gutter through a placed image or between the columns of a table",
  R40: "the gutter sits on a drawn divider; a column's edge covers its own text",
  R41: "the footer is the page's own: its page-number line or the frame's bottom rule",
  R42: "the footer band never cuts a line, and a drawing that crosses it stays whole",
  R43: "footer furniture (repeated foot lines, 'turn over') ends the questions",
  R44: "page frames and page-long rules (not a table's crossed column rules) are not ink",
  R45: "the box top takes raised ink and stops at the line above's ink",
  R46: "neighbouring boxes never overlap: the gap is split in the middle",
  R47: "the left edge takes outdented ink anywhere in the question's span",
  R48: "a placed image is never cut by a box edge",
  R49: "a grid's last row, or a drill column's last cell, is one row pitch tall",
  R50: "a marks-only line just above a label starts that question",
  R51: "an open question's continuation on the next page or column is proposed",
  R52: "a 'questions N-M' header ends the box above and is box 1 of N..M",
  R53: "an instruction block above a run, or a Model heading, is a shared box",
  R67: "two questions' boxes that overlap by more than 3 pt each way, not grid cells, get '?'",
  R68: "a box holding only its number, one line tall and no wider than its label, gets '?'",
  R69: "ink 1-2 px tall at a box's top edge, the line above's tail, does not widen it",
};
const envSet = (v) => new Set((v || "").split(",").map((s) => s.trim()).filter(Boolean));
const OFF = envSet(process.env.V2_OFF);
const on = (id) => !OFF.has(id) && !OFF.has("all");
const ENABLED = Object.keys(RULES).filter(on);
process.stderr.write(`propose-v2: rules on: ${ENABLED.join(",") || "none (v1)"}\n`);

const [bankPath, outDir] = process.argv.slice(2);
const assets = LIB + "/";
const needBold = ["R11", "R29", "R30", "R53"].some(on);
const docOpts = {
  data: new Uint8Array(fs.readFileSync(bankPath)),
  standardFontDataUrl: assets + "standard_fonts/", cMapUrl: assets + "cmaps/",
  wasmUrl: assets + "wasm/", iccUrl: assets + "iccs/", verbosity: 0,
};
if (process.env.V2_TEST_NOWASM === "1") delete docOpts.wasmUrl;
if (needBold) docOpts.fontExtraProperties = true; // the font's own name, for "Bold"
const doc = await pdfjs.getDocument(docOpts).promise;

// ------------------------------------------------------------- patterns ---
// v1's label patterns, unchanged.
const FIRST = /^(?:(?:Q(?:uestion)?|EX|Example)\s*(\d{1,3})(?:\s*[.):](?!\d)|$)|(\d{1,3})[.):](?!\d))/i;
const FIRST_MERGED = /^(?:(?:Q(?:uestion)?|EX|Example)\s*)?(\d{1,3})[.):]\s+\S/i;
const INLINE = /^(\d{1,3})[.)](?:\s+\S.*)?$/;
const ANSWERS = /^(?:answers?|answer key|mark scheme|solutions?)\s*:?$|\((?:answers?|answer key|mark scheme|solutions?)\)\s*$/i;
// R20: a leading "*" (a harder question) and one space before the stop.
const FIRST_V = /^\*?(?:(?:Q(?:uestion)?|EX|Example)\s*(\d{1,3})(?:\s*[.):](?!\d)|$)|(\d{1,3}) ?[.):](?!\d))/i;
const FIRST_MERGED_V = /^\*?(?:(?:Q(?:uestion)?|EX|Example)\s*)?(\d{1,3}) ?[.):]\s+\S/i;
// R21: the number fused with its first part. Only ever as a run's next number.
const FUSED = /^(\d{1,3})(?:[a-h][.)]|\s?\(?(?:[a-h]|i{1,3}|iv|vi{0,3}|ix|x)\))(?=\s|$|[A-Za-z(])/;
// R23: AP chemistry's "FRQ 2", "Long FRQ 1", and a prefixed number then " - Title".
const FIRST_FRQ = /^(?:(?:Short|Long)\s+)?FRQ\s*(\d{1,3})(?:\s*[.):](?!\d)|\s+[-–—]\s|$)|^(?:Q(?:uestion)?|EX|Example)\s*(\d{1,3})\s+[-–—]\s/i;
const FIRST_MERGED_FRQ = /^(?:(?:Short|Long)\s+)?FRQ\s*(\d{1,3})[.):]\s+\S/i;
// R24: a bare hanging number, "2", "1a", "4 a ii".
const HANG = /^(\d{1,3})(?:\s*[a-h](?:\s*(?:i{1,3}|iv|vi{0,3}))?)?$/;
// R26: a number whose stop was lost, then a capitalised word.
const NOSTOP = /^(\d{1,3})\s?(?=[A-Z][a-z]|[AI]\s+[a-z])/;
// R9: the answers words, as the measured economics, maths-word and biology runs had them.
const KW = "answers?|answer key|mark(?:ing)?[\\s-]*schemes?|solutions?";
const MSW = "mark(?:ing)?[\\s-]*schemes?";
const ANSWERS_V = new RegExp(`^(?:${KW})\\s*:?\\s*(?:\\([^()]*\\))?\\s*$|\\((?:${KW})\\)\\s*$|^[^:]{0,60}(?::|\\s[-–—])\\s*(?:${MSW})\\s*$|^${MSW}\\b|^marking\\s+guide\\b`, "i");
const ANSWERS_PREFIXED = new RegExp(`^(?:suggested|model|sample)\\s+(?:${KW})\\s*:?$`, "i"); // needs size or page-top
// R10: a separator, then an answers word, at the end of a title: after a spaced
// dash (U+2212 included) with any title before it, or after a colon with no
// other colon before it (so "Expressions: Answers: Expressions: Answers:" is not one).
const DKW = "(?:answers?(?:\\s*(?:&|and)\\s*explanations?)?|answer key|(?:worked\\s+)?solutions?)\\s*:?$";
const ANSWERS_DASH = new RegExp(`^.{0,110}\\s[-–—−]\\s*${DKW}|^[^:]{0,75}:\\s*${DKW}`, "i");
const NAME_LINE = /^(?:student\s+)?name\s*:/i;
// R29: section-heading words. Only as a whole label-free line of 60 characters or fewer.
const SECTION = /^(?:exercises?\s*\d*[a-z]?(?:\s*[:.]|\s*$|\s+[-–—]\s)|part\s+(?:[A-Z]|\d+|[IVX]+)\b|section\s+(?:[A-Z]|\d+|[IVX]+)\b|topic\s+\d+|unit\s+\d+|lesson\s+\d+|chapter\s+\d+|class\s*work\b|home\s*work\b|exam\s*st\w*\s+questions|mixed\s+questions|problem\s+set\b|structured\s+questions?|essay\s+questions?|mcqs?\b|multiple[\s-]choice\b|free[\s-]response\b|ap\s+(?:mcq|frq)s?\b|(?:short\s+|long\s+)?frqs?\b|extension\s+questions)/i;
const ROMAN = /^[IVXL]+[.)]\s+\S/;
const SUBPART = /^\(?(?:[a-z]|i{1,3}|iv|vi{0,3}|ix)\)|^[a-h][.)]\s/;
// R52: a line naming the questions a stimulus serves.
const STEM_RANGE = [
  /^(?:please\s+)?(?:use|refer to|study|look at|consider)\b.*\b(?:figure|table|graph|diagram|matrix|scenario|extract|data|information|case|following)\b.*?\bquestions?\s*\(?(\d{1,3})(?:\s*(?:-|–|—|to|and)\s*(?:questions?\s*)?(\d{1,3}))?\)?/i,
  /^the following\b.*?\bquestions?\s+(\d{1,3})\s*(?:-|–|—|to|and)\s*(\d{1,3})/i,
  /^\(?(?:for\s+)?(?:questions?|exercises?)\s+(\d{1,3})\s*(?:-|–|—|to|and)\s*(\d{1,3})\b/i,
  /^use the following (?:\w+\s+)?for\s+(?:questions?\s+)?(\d{1,3})\s*(?:-|–|—|to)\s*(\d{1,3})/i,
  // v2.1: "... to answer the questions 4 – 6", "For questions (208-217)", anywhere in the line.
  /\b(?:to answer|for)\s+(?:the\s+)?questions?\s*\(?(\d{1,3})\s*(?:-|–|—|to)\s*(\d{1,3})\)?/i,
];
// v2.1 (R51): what a continuation's first or last line may be.
const PAGE_NO = /^(?:page\s*)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$|^\d{1,3}\s*\|\s*page$|^page\s*\|\s*\d{1,3}$/i;
const MARKS_ONLY = /^[([]\s*\d{1,2}\s*(?:marks?)?\s*[)\]]$|^\d{1,2}\s*marks?$/i;
const SOURCE_TAG = /^\[[^\]]{2,40}\]$/;
// v2.2 (R51): a question's closing marks line, "(Total 6 marks)" as well as "(3)" or "[2]".
const TOTAL_MARKS = /^\(\s*total\s*:?\s*\d{1,3}\s*marks?\s*\)$/i;
const marksLine = (t) => MARKS_ONLY.test(t) || TOTAL_MARKS.test(t);
// v2.2 (R51): a line ending in a part's marks ("[3]", "(Total 6 marks)") closes a part; no title does.
const ENDS_MARKS = /(?:\[\s*\d{1,2}\s*(?:marks?)?\s*\]|\(\s*total\s*:?\s*\d{1,3}\s*marks?\s*\))$/i;
const BARE_SUB = /^\(?(?:[a-h]|i{1,3}|iv|vi{0,3}|ix|x)\)?(?:\s+\(?(?:i{1,3}|iv|vi{0,3}|ix|x)\)?)?$/;
const S = 2, PAD = 4; // render at 144 dpi; 4 pt round every box

// ------------------------------------------------------- text and lines ---
// v1's items, keeping each item's place in content order and its font.
function itemsOf(tc, vp) {
  const items = [];
  tc.items.forEach((it, idx) => {
    if (!("str" in it) || !it.str.trim()) return;
    const [a, b, c, d, e, f] = it.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const n1 = Math.hypot(a, b) || 1, n2 = Math.hypot(c, d) || 1;
    const ux = a / n1, uy = b / n1, vx = c / n2, vy = d / n2;
    const pts = [[e, f], [e + ux * it.width, f + uy * it.width], [e + vx * size * 0.8, f + vy * size * 0.8],
      [e + ux * it.width + vx * size * 0.8, f + uy * it.width + vy * size * 0.8]].map(([x, y]) => vp.convertToViewportPoint(x, y));
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    // v2.1 (R29): text that runs up or down the page as drawn (a table's side label).
    const rot = Math.abs(pts[1][1] - pts[0][1]) > Math.abs(pts[1][0] - pts[0][0]) + 0.5;
    items.push({ s: it.str.trim(), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), idx, font: it.fontName, rot });
  });
  return items;
}

function linesOf(items) {
  items = items.slice().sort((m, n) => m.y0 - n.y0 || m.x0 - n.x0);
  const lines = [];
  for (const it of items) {
    const h = it.y1 - it.y0;
    const ln = lines.find((l) => Math.abs((l.y0 + l.y1) / 2 - (it.y0 + it.y1) / 2) < h * 0.5);
    if (ln) { ln.items.push(it); ln.y0 = Math.min(ln.y0, it.y0); ln.y1 = Math.max(ln.y1, it.y1); }
    else lines.push({ y0: it.y0, y1: it.y1, items: [it] });
  }
  lines.sort((a, b) => a.y0 - b.y0);
  for (const l of lines) { l.items.sort((m, n) => m.x0 - n.x0); l.text = l.items.map((i) => i.s).join(" "); }
  return lines;
}

// v1: lines from body-size items only; each small item joins the nearest line
// beside it.
function bodyLines(items, bodyH) {
  const big = (it) => it.y1 - it.y0 >= bodyH * 0.75;
  const lines = linesOf(items.filter(big));
  for (const it of items.filter((it) => !big(it))) {
    const cy = (it.y0 + it.y1) / 2;
    let best = null, bestD = bodyH;
    for (const l of lines) {
      const d = cy < l.y0 ? l.y0 - cy : cy > l.y1 ? cy - l.y1 : 0;
      if (d < bestD && it.x0 < l.items.at(-1).x1 + 20 && it.x1 > l.items[0].x0 - 20) { best = l; bestD = d; }
    }
    if (best) { best.y0 = Math.min(best.y0, it.y0); best.y1 = Math.max(best.y1, it.y1); }
  }
  return lines;
}

// R29: a label-free line of 60 characters or fewer set large, in section words,
// or wholly bold on a page whose body is not bold.
// v2.1 (R29): words, bold and caps lines need a gap above them of half a body
// height, bold and caps one wider than the column's usual leading too, unless
// set 1.1x body (a wrapped stem line or a wrapped bold tail is not a heading;
// an upper-Roman line has its own tests below); an option line "D. QRWU" is
// never a bold or caps heading; an upper-Roman line is one only when bold or set
// large, and never as an item of a I./II./III. list; "exercise" needs a capital
// or a number; no heading inside a placed image, in a ruled table, or drawn up
// the page. A bold line with gaps above and below may run to 80 characters.
function headingKind(l, bodyH, P, lines, li, medGap, underHead) {
  if (l.hasToken) return null;
  // v2.2 (R27, R29): text of an OCR layer (fonts the page paints only invisibly) is
  // a reading of handwriting or a scan, never a heading.
  if (P.ocrFonts && l.items.some((i) => P.ocrFonts.has(i.font))) return null;
  const s = l.text.trim();
  const v21 = on("R29") && lines;
  const gapA = v21 && li > 0 ? l.y0 - lines[li - 1].y1 : Infinity;
  const gapB = v21 && li + 1 < lines.length ? lines[li + 1].y0 - l.y1 : Infinity;
  // A line set 1.1x body or larger is a heading's size whatever the gap above it.
  const raised = v21 && Math.max(...l.items.map((i) => i.y1 - i.y0)) >= 1.1 * bodyH;
  const needGap = raised ? -Infinity : Math.max(0.5 * bodyH, (medGap ?? 0) + 0.1 * bodyH);
  let bold_;   // read only when asked: the ink test scans the line's pixels
  const isBold = () => (bold_ ??= P.boldShare < 0.5 && (l.items.every((i) => i.bold) || inkBold(l, P)));
  // v2.2: never a line naming the questions it serves ("Use the following figure to answer the question 26 to question 28"): that is a stem.
  const maxLen = v21 && s.length > 60 && s.length <= 80 && gapA > needGap && gapB > needGap && !STEM_RANGE.some((rx) => rx.test(s)) && isBold() ? 80 : 60;
  if (!s || s.length > maxLen || /^(?:claim|evidence|reasoning)\s*:/i.test(s)) return null;
  if (!/[A-Za-z]{2}/.test(s)) return null;   // a heading has words; a bold page number is not one
  const inImage = P.rects.some((r) => l.items[0].x0 >= r.x0 - 1 && l.items.at(-1).x1 <= r.x1 + 1 && l.y0 >= r.y0 - 1 && l.y1 <= r.y1 + 1);
  // Set large, it must read as a title (three letters or more, not a number or
  // an axis label inside a figure).
  const large = Math.max(...l.items.map((i) => i.y1 - i.y0)) >= 1.25 * bodyH;
  if (!v21) {
    if (large && /[A-Za-z]{3}/.test(s) && !/\d\s*$/.test(s) && !inImage) return "size";
    if (SECTION.test(s) || ROMAN.test(s)) return "words";
    if (P.boldShare < 0.5 && (l.items.every((i) => i.bold) || inkBold(l, P))) return "bold";
    // A short all-caps line ("INDICES", "HALF-LIFE"), four letters or more.
    if (s.length <= 40 && /[A-Z]{4}/.test(s) && !/[a-z]/.test(s) && /^[A-Z]/.test(s)) return "caps";
    return null;
  }
  let kind = null;
  if (large && /[A-Za-z]{3}/.test(s) && !/\d\s*$/.test(s) && !inImage) kind = "size";
  // An upper-Roman line: set large or in bold (its numeral at least, whatever the page's body), never a list item.
  else if (ROMAN.test(s)) kind = (large || l.items.every((i) => i.bold) || (/^[IVXL]+[.)]/.test(l.items[0].s) && l.items[0].bold) || inkBold(l, P)) && !romanListItem(lines, li) ? "words" : null;
  // v2.2: section words straight under a heading line ("Inverse functions" / "Exercise 5") need no gap.
  else if (gapA <= 0.5 * bodyH && !raised && !(underHead && SECTION.test(s))) kind = null;
  else if (SECTION.test(s) && !(/^exercises?\b/i.test(s) && !/^E/.test(s) && !/^exercises?\s*\d/i.test(s))) kind = "words";
  // An option line, or a bold question sentence ("How does ...?"), is no bold or caps heading.
  else if (/^\(?[A-E][.)]\s/.test(s) || /\?\s*$/.test(s) || gapA <= needGap || inImage) kind = null;
  else if (isBold()) kind = "bold";
  else if (s.length <= 40 && /[A-Z]{4}/.test(s) && !/[a-z]/.test(s) && /^[A-Z]/.test(s)) kind = "caps";
  // Never a side label drawn up the page, nor a line inside a ruled table.
  if (kind && (l.items.some((i) => i.rot) || inRuledTable(l, P, bodyH))) return null;
  return kind;
}

// v2.1 (R29): an upper-Roman line that is an item of a I./II./III. list: the
// next numeral on the same line, or the next or previous one opening one of the
// three lines below or above with no question label between.
const romanVal = (r) => { const v = { I: 1, V: 5, X: 10, L: 50 }; let n = 0; for (let i = 0; i < r.length; i++) n += v[r[i]] < (v[r[i + 1]] || 0) ? -v[r[i]] : v[r[i]]; return n; };
function romanListItem(lines, li) {
  const m = lines[li].text.trim().match(/^([IVXL]+)[.)]/), n = romanVal(m[1]);
  const at = (l) => { const k = l.text.trim().match(/^([IVXL]+)[.)]\s/); return k ? romanVal(k[1]) : null; };
  if (lines[li].items.slice(1).some((it) => { const k = it.s.match(/^([IVXL]+)[.)]/); return k && romanVal(k[1]) === n + 1; })) return true;
  for (const d of [1, -1]) for (let j = li + d, k = 0; k < 3 && j >= 0 && j < lines.length; j += d, k++) {
    if (lines[j].hasToken) break;
    if (at(lines[j]) === n + d) return true;
  }
  return false;
}

// v2.1 (R29): a line in a ruled table: two vertical rules (ink columns running a
// line and a half beyond the line's own height) cross its band within 12 pt of
// its ends. A heading bar's edges are only as tall as its padding.
function inRuledTable(l, P, bodyH) {
  const ya = Math.floor(l.y0 * S), yb = Math.ceil(l.y1 * S), need = Math.ceil((l.y1 - l.y0 + 1.5 * bodyH) * S);
  const x0 = Math.max(0, Math.floor((l.items[0].x0 - 12) * S)), x1 = Math.min(P.cw - 1, Math.ceil((l.items.at(-1).x1 + 12) * S));
  let rules = 0, inRule = false;
  for (let x = x0; x <= x1; x++) {
    let hit = true;
    for (let y = ya; y <= yb && hit; y++) hit = P.dark(x, y);
    if (hit) {
      let a = ya, b = yb;
      while (a > 0 && P.dark(x, a - 1)) a--;
      while (b < P.ch - 1 && P.dark(x, b + 1)) b++;
      hit = b - a + 1 >= need;
    }
    if (hit && !inRule) rules++;
    inRule = hit;
  }
  return rules >= 2;
}

// Bold by ink, for fonts whose names say nothing ("CambriaMath" for every
// weight): a line of mostly letters whose ink per unit of its boxes is 1.3x the
// page's median line. Only ever asked of a label-free heading candidate.
function lineDensity(l, P) {
  if (l._dens != null) return l._dens;
  let dark = 0, area = 0;
  for (const it of l.items) {
    const X0 = Math.max(0, Math.floor(it.x0 * S)), X1 = Math.min(P.cw - 1, Math.ceil(it.x1 * S)), Y0 = Math.max(0, Math.floor(it.y0 * S)), Y1 = Math.min(P.ch - 1, Math.ceil(it.y1 * S));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (P.dark0(x, y)) dark++;
    area += (X1 - X0 + 1) * (Y1 - Y0 + 1);
  }
  return (l._dens = area ? dark / area : 0);
}
function inkBold(l, P) {
  const letters = (l.text.match(/[A-Za-z]/g) || []).length;
  if (letters < 8 || letters < 0.7 * l.text.replace(/\s/g, "").length) return false;
  if (P.medDensity == null) {
    const ds = P.allLines.filter((q) => (q.text.match(/[A-Za-z]/g) || []).length >= 10).map((q) => lineDensity(q, P)).sort((a, b) => a - b);
    P.medDensity = ds.length >= 3 ? ds[Math.floor(ds.length / 2)] : Infinity;
  }
  return lineDensity(l, P) >= 1.3 * P.medDensity;
}

// Set large or in section words: a heading wherever it stands. Bold or all-caps
// lines count only next to a label (see effective in runsOf).
const strongHead = (h) => h.kind === "size" || h.kind === "words";
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// R24: the page's text margin is the line-start x carrying the most characters;
// a line that itself opens with a hanging number votes with its text's x.
function marginOf(lines) {
  const c = new Map();
  for (const l of lines) {
    const it = l.items[0], nx = l.items[1];
    const hangs = nx && nx.x0 - it.x1 >= 12 && HANG.test(it.s) && /^[A-Za-z(]/.test(nx.s);
    const x = Math.round((hangs ? nx.x0 : it.x0) / 2) * 2;
    c.set(x, (c.get(x) || 0) + l.text.length);
  }
  return [...c].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

// ------------------------------------------------------------- labels ---
// A line's first token as a label: v1's patterns first, then each rule's form
// in turn, so a label carries the one rule that found it (via).
function firstLabel(l, k, lines, bodyH, margin, P, col) {
  const it = l.items[k];
  let s = it.s, via = null;
  if (k === 1) via = "R22";                                  // "_____" "8."
  if (on("R22") && /^_{3,}\s*\d/.test(s)) { s = s.replace(/^_{3,}\s*/, ""); via = "R22"; }
  const v1 = s.match(FIRST) || s.match(FIRST_MERGED);
  let m = v1, needsRun = false, hangAlone = false, gapNeed = 0;
  if (on("R16")) {
    // R16: the label and its stop as abutting items ("7" bold, ". Examine").
    let s0 = s;
    // Abutting, not overlapping: an item painted over this one is an overprint (R17), not its stop.
    for (let j = k + 1; j < l.items.length && l.items[j].x0 - l.items[j - 1].x1 < (it.y1 - it.y0) * 0.15 && l.items[j].x0 > l.items[j - 1].x1 - 1; j++) s0 += l.items[j].s;
    const m0 = s0.match(FIRST) || s0.match(FIRST_MERGED);
    if (v1 && !m0) return { drop: "R16" };                    // "0." then "3": a split decimal
    if (!v1 && m0) { m = m0; via = via || "R16"; }
    s = s0;
  }
  if (!m && on("R20")) { m = s.match(FIRST_V) || s.match(FIRST_MERGED_V); if (m) via = via || "R20"; }
  if (!m && on("R23")) { m = s.match(FIRST_FRQ) || s.match(FIRST_MERGED_FRQ); if (m) via = via || "R23"; }
  if (!m && on("R21")) { m = s.match(FUSED); if (m) { via = via || "R21"; needsRun = true; } }
  // The text after it starts with a letter or "(": a table's first column of values does not.
  // ... and is a stem: 12 characters or more with a word of three letters (an axis value beside its title is not).
  const rest = l.items.slice(k + 1).map((i) => i.s).join(" ");
  let stemX = null, band = false;
  // v2.1 (R24): a hanging label in the top band is a candidate too (kept only when it lines
  // up with the page's or file's other hanging labels); (R51) on the column's first body
  // line, under a question left open on the page before, the band is no bar at all.
  const inBand = l.y0 <= P.H * 0.06;
  const openTop = inBand && on("R51") && P.state.open && lines.find((q) => !P.isFurniture(q)) === l;
  // v2.2: a wider number ("13 a") may stand 6 pt from its stem when the stem starts on the text margin.
  if (!m && on("R24") && k === 0 && l.items[1] && (l.items[1].x0 - it.x1 >= 12 || (l.items[1].x0 - it.x1 >= 6 && Math.abs(l.items[1].x0 - margin) <= 2)) && it.x0 <= margin - 12 && /^[A-Za-z(]/.test(l.items[1].s) && rest.length >= 12 && /[A-Za-z]{3}/.test(rest)) {
    m = it.s.match(HANG); if (m) { via = via || "R24"; stemX = l.items[1].x0; band = inBand && !openTop; }
  }
  if (!m && on("R25") && k === 0 && l.items.length === 1 && /^\d{1,3}$/.test(it.s) &&
      (it.x0 <= margin - 12 || it.x0 <= P.minX + 2) && (l.y0 > P.H * 0.06 || openTop) && l.y0 < P.H * 0.94 &&
      inkCount(P, Math.max(it.x1 + 4, margin), l.y0, col[1], l.y1 + 2 * bodyH, P.dark) >= 20) {
    m = [it.s, it.s]; via = via || "R25"; hangAlone = true;
    const nl = lines[lines.indexOf(l) + 1];
    stemX = nl ? nl.items[0].x0 : margin;
  }
  if (!m && on("R26") && k === 0) {
    m = l.items.slice(k).map((i) => i.s).join(" ").match(NOSTOP);
    if (m) { via = via || "R26"; needsRun = true; gapNeed = 0.5 * bodyH; }
  }
  if (!m) return null;
  const n = +(m[1] ?? m[2]);
  if (on("R18") && n === 0) return { drop: "R18" };
  if (on("R19") && colonRatio(s, l, k)) return { drop: "R19" };
  return { big: on("R27") && it.y1 - it.y0 >= 1.25 * bodyH && !P.fewChars, n, via, needsRun, hangAlone, gapNeed, stemX, band, prefixed: /^\*?Q(?:uestion)?\s*\d/i.test(s), frq: /^(?:(?:Short|Long)\s+)?FRQ\s*\d/i.test(s) };
}

// R19: "2: 10" and "3 : 15" are ratios. A colon stops a bare number only when a
// letter or the end of the line follows it.
function colonRatio(s, l, k) {
  const mm = s.match(/^\*?(\d{1,3})( ?)([.):])/);
  if (!mm || mm[3] !== ":") return false;
  const rest = s.slice(mm[0].length);
  if (/^\s*\d/.test(rest)) return true;
  if (!rest.trim()) { const nx = l.items[k + 1]; if (nx && /^\d/.test(nx.s)) return true; }
  return false;
}

function inkCount(P, x0, y0, x1, y1, dk) {
  let n = 0;
  const X0 = Math.max(0, Math.floor(x0 * S)), X1 = Math.min(P.cw - 1, Math.ceil(x1 * S)), Y0 = Math.max(0, Math.floor(y0 * S)), Y1 = Math.min(P.ch - 1, Math.ceil(y1 * S));
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (dk(x, y)) n++;
  return n;
}

// --------------------------------------------------------------- runs ---
// v1's runs, with each rule's change to what makes a token, a chain or a keep.
// Returns the kept runs, the dropped ones (with the rule that dropped them), the
// tokens rules removed, and the column's heading lines.
function runsOf(lines, limit, bodyH, P, col) {
  const W = P.W;
  const toks = [], removed = [];
  const margin = on("R24") ? marginOf(lines) : 0;
  lines.forEach((l, li) => {
    const f = on("R22") && l.items.length > 1 && /^_{3,}$/.test(l.items[0].s) ? 1 : 0;
    l.items.forEach((it, k) => {
      if (it.y0 >= limit) return;
      if (k < f) return;
      let tok;
      if (k === f) tok = firstLabel(l, k, lines, bodyH, margin, P, col);
      else {
        const m = it.s.match(INLINE);
        tok = m ? { n: +m[1], big: on("R27") && it.y1 - it.y0 >= 1.25 * bodyH && !P.fewChars } : null;
        if (tok && on("R18") && tok.n === 0) tok = { drop: "R18" };
      }
      if (!tok) return;
      const t = { ...tok, x: it.x0, li, line: l, first: k === f, item: it, k };
      if (tok.drop) { removed.push({ t, rule: tok.drop }); return; }
      toks.push(t);
    });
  });
  // v2.1 (R24): a hanging label in the top band stays only within 3 pt of another
  // hanging label's x, on this page or an earlier page of the file.
  for (const t of toks.filter((u) => u.band)) {
    const near = (x) => Math.abs(x - t.x) <= 3;
    if (!toks.some((u) => u !== t && !u.band && (u.via === "R24" || u.via === "R25") && near(u.x)) && !(P.state.hangXs || []).some(near)) { toks.splice(toks.indexOf(t), 1); removed.push({ t, rule: null }); }
  }
  // R27: a number set 1.25x body size is a chapter title, when body-size labels share the column with it.
  // Only a title or two among body-size labels: a page whose every number is set large keeps them.
  const bigs = toks.filter((t) => t.big);
  if (bigs.length && bigs.length <= 2 && toks.length - bigs.length >= bigs.length) for (const t of bigs) { toks.splice(toks.indexOf(t), 1); removed.push({ t, rule: "R27" }); }
  // R17: two labels on one spot (an old number under its replacement): keep the later in content order.
  if (on("R17")) for (const t of toks.slice()) {
    const twin = toks.find((u) => u !== t && Math.abs(u.item.x0 - t.item.x0) < 2 && Math.abs(u.item.y1 - t.item.y1) < 2);
    if (twin && twin.item.idx > t.item.idx) { toks.splice(toks.indexOf(t), 1); removed.push({ t, rule: "R17" }); }
  }
  for (const l of lines) l.hasToken = false;
  for (const t of toks) t.line.hasToken = true;
  // R29: heading lines of this column, and what lies between two labels.
  // v2.1: the column's usual gap between lines, for the gap a heading needs above it.
  const lgaps = lines.slice(1).map((l, i) => l.y0 - lines[i].y1).filter((g) => g > 0 && g < 1.5 * bodyH).sort((a, b) => a - b);
  const medGap = lgaps.length ? lgaps[Math.floor(lgaps.length / 2)] : 0.3 * bodyH;
  const heads = [];
  const title27 = new Set(on("R27") ? removed.filter((x) => x.rule === "R27").map((x) => x.t.line) : []);
  lines.forEach((l, li) => {
    const h = headingKind(l, bodyH, P, lines, li, medGap, heads.length > 0 && heads.at(-1).li === li - 1);
    // v2.1 (R27): the line of a heading-size number taken out as a label is a size heading.
    // v2.2: not a number in an OCR layer (a large handwritten "2.").
    if (title27.has(l) && !l.hasToken && !(P.ocrFonts && l.items.some((i) => P.ocrFonts.has(i.font)))) heads.push({ l, li, kind: "size", title27: true });
    else if (h) heads.push({ l, li, kind: h, roman: on("R29") && h === "words" && ROMAN.test(l.text.trim()) && !SECTION.test(l.text.trim()) });
  });
  // A bold or all-caps line counts only directly above a label or outdented left of it.
  const effective = (h, above) => (h.kind !== "bold" && h.kind !== "caps") || (above && lines[h.li + 1] === above.line) || (above && h.l.items[0].x0 < above.x - 6);
  const headingBetween = (a, t) => heads.some((h) => h.l.y0 >= a.line.y1 - 0.5 && h.l.y1 <= t.line.y0 + 0.5 && effective(h, t) && h.l.items[0].x0 <= Math.max(a.x, t.x) + 6);
  const gapAbove = (t) => (t.li === 0 ? Infinity : t.line.y0 - lines[t.li - 1].y1);
  const spaced = (t) => gapAbove(t) > bodyH;
  const runs = [];
  for (const t of toks) {
    const cont = (tol) => runs.filter((r) => {
      const last = r.at(-1);
      if (last.n !== t.n - 1) return false;
      if (last.li === t.li) return !t.needsRun;                 // side by side: the next cell of a grid row
      if (t.needsRun && (t.li <= last.li || gapAbove(t) <= t.gapNeed)) return false;
      return r.some((u) => Math.abs(u.x - t.x) < tol);          // under the run's own left edge
    });
    let open = cont(6);
    if (!open.length && on("R36")) { open = cont(10); if (open.length) t.chainBy = "R36"; }
    const run = open.findLast((r) => spaced(t) === r.every(spaced)) ?? open.at(-1);
    if (run) run.push(t);
    else if (t.needsRun) removed.push({ t, rule: null });
    else if (t.first) runs.push([t]);
    else if (on("R32") && toks.some((u) => u.n === t.n + 1 && u.li > t.li && Math.abs(u.x - t.x) < 6)) { t.startBy = "R32"; runs.push([t]); }
  }
  const overlapY = (r, o) => r[0].line.y0 < o.at(-1).line.y1 && o[0].line.y0 < r.at(-1).line.y1;
  // R31: a run that starts where another ended, a quarter-page to its right, beside it: the next column.
  const nextColumn = (r) => on("R31") && runs.some((o) => o !== r && o.at(-1).n === r[0].n - 1 && r[0].x >= o[0].x + W / 4 && overlapY(r, o));
  // v1: a run wholly between two labels of another is a list inside that question.
  // R36: not when it continues that label's number; R29: not when a section
  // heading separates it from that label (a new section starting again at 1).
  const inside = (r) => runs.some((o) => o !== r && o.some((a, k) => k + 1 < o.length &&
    a.line.y1 <= r[0].line.y0 && o[k + 1].line.y0 >= r.at(-1).line.y1 && Math.abs(a.x - r[0].x) < 6 &&
    !(on("R36") && r[0].n === a.n + 1) && !(on("R29") && headingBetween(a, r[0]) && (r.sectionBy = "R29"))));
  const underHeading = (t) => {
    const above = lines[t.li - 1];
    if (!above) return false;
    // At the label margin: a centred "Question 6" under "Part B" is a title.
    if (!(t.x <= P.minX + 20 || toks.some((u) => u !== t && Math.abs(u.x - t.x) < 6))) return false;
    const h = heads.find((h) => h.l === above);
    if (h && (h.kind === "size" || h.kind === "words")) return true;
    if (h) { const a2 = lines[t.li - 2]; return !a2 || above.y0 - a2.y1 > bodyH; }
    return lines.slice(0, t.li).every((l) => P.isFurniture(l) || l.y1 < P.H * 0.06);
  };
  const keep1 = (r) => r.length >= 2 || spaced(r[0]) || (on("R30") && underHeading(r[0]) && (r.keptBy = "R30"));
  const cand = runs.filter((r) => r.length >= 2 || spaced(r[0]) || (on("R30") && underHeading(r[0])));
  const kept = [], dropped = [];
  for (const r of runs) {
    if (!keep1(r)) continue;
    // R25: a number alone on its line counts only beside ordinary labels in its run;
    // a run of nothing else is a table's row numbers.
    // v2.2: except one alone straight under a section heading ("FRQ" / "1").
    if (r.every((t) => t.hangAlone) && !(on("R29") && r.length === 1 && heads.some((h) => h.li === r[0].li - 1 && strongHead(h)))) { for (const t of r) removed.push({ t, rule: null }); continue; }
    if (inside(r)) {
      if (nextColumn(r)) r.keptBy = "R31";
      else { dropped.push({ r, rule: null }); continue; }
    }
    if (on("R14") && answerList(r, lines, P)) { dropped.push({ r, rule: "R14" }); P.answerKeyPage = true; continue; }
    if (on("R33") && indentedList(r, cand, bodyH, heads)) { dropped.push({ r, rule: "R33" }); continue; }
    if (on("R34") && underSubpart(r, lines, cand, heads)) { dropped.push({ r, rule: "R34" }); continue; }
    if (on("R35") && prefixedList(r, toks, P)) { dropped.push({ r, rule: "R35" }); continue; }
    kept.push(r);
  }
  for (const r of dropped) for (const t of r.r) removed.push({ t, rule: r.rule });
  return { kept, dropped, removed, heads, toks, effective };
}

// R14: an answer key's lines hold nothing after the number but answer letters.
// v2.1: only the text on the label's own baseline counts, never a letter inside a
// placed image or on a drawing (a triangle's vertex), and the run has 3 labels or more.
function answerList(r, lines, P) {
  const onBaseline = (t, it) => Math.abs(it.y1 - t.item.y1) <= 0.25 * (t.item.y1 - t.item.y0) && !onDrawing(it, P, t.line.items);
  const restOf = (t) => {
    const l = t.line, items = l.items.slice(t.k + 1).filter((it) => onBaseline(t, it));
    const stop = items.findIndex((i) => INLINE.test(i.s) && /^\d/.test(i.s));
    const after = (stop < 0 ? items : items.slice(0, stop)).map((i) => i.s).join(" ");
    const own = t.item.s.replace(/^\*?(?:(?:Q(?:uestion)?|EX|Example)\s*)?\d{1,3}\s?[.):]?\s*/i, "");
    return (own + " " + after).trim();
  };
  const hits = r.filter((t) => /^[A-E](?:\s*,\s*[A-E])*$/.test(restOf(t)) || /^(?:\([a-z]\)\s*[A-E]\s*)+$/.test(restOf(t))).length;
  return r.length >= 3 && hits >= 0.8 * r.length;
}

// v2.1 (R14): a text item inside a placed image, or with drawn ink close round it
// (2 pt to 4 pt out, other text left out): a letter on a figure.
function onDrawing(it, P, others) {
  if (P.rects.some((r) => it.x0 >= r.x0 - 1 && it.x1 <= r.x1 + 1 && it.y0 >= r.y0 - 1 && it.y1 <= r.y1 + 1)) return true;
  const h = it.y1 - it.y0;
  const X0 = Math.max(0, Math.floor((it.x0 - 4) * S)), X1 = Math.min(P.cw - 1, Math.ceil((it.x1 + 4) * S));
  const Y0 = Math.max(0, Math.floor((it.y0 - 4) * S)), Y1 = Math.min(P.ch - 1, Math.ceil((it.y1 + 0.3 * h + 4) * S));
  const inside = (x, y, a, m) => x >= (a.x0 - m) * S && x <= (a.x1 + m) * S && y >= (a.y0 - m) * S && y <= (a.y1 + 0.3 * (a.y1 - a.y0) + m) * S;
  let n = 0;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    if (inside(x, y, it, 2) || !P.dark(x, y) || others.some((o) => o !== it && inside(x, y, o, 1))) continue;
    if (++n >= 6) return true;
  }
  return false;
}

// v2.1 (R29): a table row: three items or more, two of the gaps between them 1.5 body heights or wider.
const tableRow = (l, bodyH) => l.items.length >= 3 && l.items.slice(1).filter((it, k) => it.x0 - l.items[k].x1 >= 1.5 * bodyH).length >= 2;

// A section heading for a list at x: it starts left of the list and none of its
// items stands over the list (a table's header row has a cell there).
const sectionHeadFor = (h, x) => h.l.items[0].x0 <= x - 6 && !h.l.items.some((i) => Math.abs(i.x0 - x) < 6 || (i !== h.l.items[0] && i.x0 >= x - 6));

// R33: a run from 1 indented more than 12 pt right of the label above it, ending
// before that run's next label (or the page's end), level with none of that
// run's labels, and with no heading line between: a list inside that question.
function indentedList(r, cand, bodyH, heads) {
  if (r[0].n !== 1) return false;
  let a = null;
  for (const o of cand) if (o !== r) for (const u of o) if (u.line.y1 <= r[0].line.y0 + 0.5 && u.li < r[0].li && (!a || u.line.y1 > a.line.y1)) a = u;
  if (!a || !(r[0].x > a.x + 12)) return false;
  // A section heading between (starting left of the list; a table's header row over it does not count).
  if (heads.some((h) => h.l.y0 >= a.line.y1 - 0.5 && h.l.y1 <= r[0].line.y0 + 0.5 && sectionHeadFor(h, r[0].x))) return false;
  const o = cand.find((q) => q.includes(a)), next = o[o.indexOf(a) + 1];
  if (next && next.line.y0 < r.at(-1).line.y1) return false;
  if (o.some((b) => r.some((u) => Math.abs(b.line.y0 - u.line.y0) < bodyH * 0.5))) return false;
  // v2.1: labels level (2 pt) with another run's labels, numbered in the style of
  // the label above ("1." under "1."), are a table's row, not a nested list. A
  // "1)" list under a "1." question stays a list however it is laid out.
  const stopOf = (t) => (t.item.s.match(/^\*?(?:(?:Q(?:uestion)?|EX|Example)\s*)?\d{1,3}\s?([.):])/i) || [])[1];
  if (stopOf(r[0]) && stopOf(r[0]) === stopOf(a) && cand.some((q) => q !== r && q.some((b) => r.some((u) => u !== b && Math.abs(b.line.y0 - u.line.y0) <= 2)))) return false;
  return true;
}

// R34: a run from 1 below a sub-part line or an FRQ/Exercise/Prompt heading,
// with no question label or section heading between: a list in that part.
function underSubpart(r, lines, cand, heads) {
  if (r[0].n !== 1) return false;
  const others = new Set(cand.filter((o) => o !== r).flat());
  for (let li = r[0].li - 1; li >= 0; li--) {
    const l = lines[li];
    const tok = [...others].find((u) => u.line === l);
    if (tok) return !!tok.frq;
    if (heads.some((h) => h.l === l && sectionHeadFor(h, r[0].x) && !/^(?:(?:short|long)\s+)?frq\b/i.test(l.text))) return false;
    const it = l.items[0];
    if (SUBPART.test(it.s) && r[0].x >= it.x0 + 6) return true;
    if (/^(?:(?:Short|Long)\s+)?FRQ\b|^Exercise\b|^Prompt\b/i.test(l.text) && r[0].x >= it.x0 + 6) return true;
  }
  return false;
}

// R35: once a file numbers its questions "Question N", an unprefixed run 20 pt
// or more right of those labels, after one and before the next, is a list.
function prefixedList(r, toks, P) {
  if (r.some((t) => t.prefixed)) return false;
  const pref = toks.filter((t) => t.prefixed);
  const px = Math.min(P.state.prefixX ?? Infinity, ...pref.map((t) => t.x));
  if (!Number.isFinite(px) || r[0].x < px + 20) return false;
  const above = pref.some((t) => t.line.y1 <= r[0].line.y0);
  const between = pref.some((t) => t.line.y0 > r[0].line.y0 && t.line.y0 < r.at(-1).line.y1);
  return (above || (P.state.prefixX != null && !pref.some((t) => t.line.y1 <= r[0].line.y0))) && !between;
}

// -------------------------------------------------------------- boxes ---
// v1's box, edge by edge, with each rule's change. E is the set of edge rules
// in force: the real box passes every enabled one, and the reference box (what
// v1's edges would be for the same labels) passes none. act records which rule
// changed which intermediate edge, so the comparison can name it.
const EDGE_RULES = ["R27", "R29", "R32", "R40", "R42", "R44", "R45", "R47", "R48", "R49", "R50", "R52", "R53"];
function boxFor(t, C, E) {
  const { P, all, grid, r, cx0, cx1, colLines, bodyH } = C;
  const dk = E.has("R44") ? P.dark : P.dark0;
  const lim = E.size ? C.limit : C.limitRef;
  const act = { top: new Set(), left: new Set(), right: new Set(), bottom: new Set() };
  const W = P.W;
  const topOf = (u) => (E.has("R50") && u.markLine ? u.markLine.y0 : u.line.y0);
  // Left: the label, or ink just left of it on its own line (a calculator icon).
  let left = t.x - PAD;
  const ly0 = Math.floor(t.line.y0 * S), ly1 = Math.ceil(t.line.y1 * S);
  for (let x = Math.floor((t.x - 2) * S); x >= Math.max(Math.floor(cx0 * S), Math.floor((t.x - 30) * S)); x--) {
    let ink = false;
    for (let y = ly0; y <= ly1 && !ink; y++) ink = dk(x, y);
    if (ink) left = Math.min(left, x / S - PAD);
  }
  left = Math.max(left, cx0);
  // Bottom, first: the next label under this one.
  let bottom = lim, bindBy = null;
  for (const u of all) if (u !== t && u.line.y0 > t.line.y1 - 1 && Math.abs(u.x - t.x) < 6 && topOf(u) - 1 < bottom) { bottom = topOf(u) - 1; bindBy = u; }
  // Right: on a grid, the next cell along the line. Otherwise a label at least a
  // quarter of the page to the right, inside this question's span.
  const beside = all.filter((u) => u !== t && u.line.y1 > t.line.y0 &&
    (grid ? u.x > t.x + 20 && u.line.y0 < t.line.y1 : u.x > t.x + W / 4 && u.line.y0 < bottom));
  let right = beside.length ? Math.min(...beside.map((u) => u.x)) - PAD : cx1;
  let rightBind = beside.length ? beside.reduce((a, b) => (b.x < a.x ? b : a)) : null;
  if (E.has("R32")) {
    // R32: any label further along the same line bounds this box.
    const sl = all.filter((u) => u !== t && u.line === t.line && u.x > t.x + 10);
    if (sl.length) { const r2 = Math.min(...sl.map((u) => u.x)) - PAD; if (r2 < right - 0.01) { right = r2; act.right.add("R32"); rightBind = sl.reduce((a, b) => (b.x < a.x ? b : a)); } }
  }
  // Bottom, then: any label below that starts inside this width.
  for (const u of all) if (u !== t && u.line.y0 > t.line.y1 - 1 && u.x < right - 20 && (grid || u.x > left - 200) && topOf(u) - 1 < bottom) { bottom = topOf(u) - 1; bindBy = u; }
  const labelBottom = bottom;
  // R29 / R52 / R53: a heading, a "questions N-M" header or another run's
  // instruction block below the label ends the box above it.
  const stop = (h, rule) => {
    if (h.y0 > t.line.y1 - 0.5 && h.y0 - 1 < bottom && h.x1 > left && h.x0 < right) { bottom = h.y0 - 1; act.bottom.add(rule); bindBy = null; }
  };
  // v2.1 (R29): at or left of the label (a hanging label's stem margin), or centred
  // in the column, any kind but an upper-Roman line, which must
  // stand at or left of the label itself; and only a heading that ends something
  // (C.headEnds): one followed only by lettered parts or a table is the question's.
  if (E.has("R29")) for (const h of C.heads) if (!h.title27 && (C.effective(h, t) || C.headAboveToken(h) || C.headAboveHead(h))) {
    const hx0 = h.l.items[0].x0, hx1 = h.l.items.at(-1).x1;
    const ref = h.roman ? t.x : Math.max(t.x, t.stemX ?? t.x);
    // Centred: over the column's middle, and not starting where the lines around
    // it start (a stem line that happens to sit mid-page continues its paragraph).
    const nb = [C.colLines[h.li - 1], C.colLines[h.li + 1]].filter(Boolean);
    const centred = !h.roman && Math.abs((hx0 + hx1) / 2 - (cx0 + cx1) / 2) < 0.1 * (cx1 - cx0) && !nb.some((l) => Math.abs(l.items[0].x0 - hx0) < 3);
    if ((hx0 <= ref + 6 || centred) && C.headEnds(h)) stop({ y0: h.l.y0, x0: hx0, x1: hx1 }, "R29");
  }
  // v2.1 (R27): a chapter title taken out as a label ends the box above it, wherever it stands.
  if (E.has("R27")) for (const h of C.heads) if (h.title27) stop({ y0: h.l.y0, x0: h.l.items[0].x0, x1: h.l.items.at(-1).x1 }, "R27");
  if (E.has("R52")) for (const h of C.stemLines) stop(h, "R52");
  if (E.has("R53")) for (const b of C.blocks) if (b.run !== r) stop(b, "R53");
  // v2.1 (R32): a label bounds the right edge only from a line inside the box's
  // final height: one below its bottom (a column of cells starting under it) does not.
  if (E.has("R32") && rightBind && rightBind.line.y0 >= bottom - 0.5) {
    const ok = all.filter((u) => u !== t && u.line.y1 > t.line.y0 && u.line.y0 < bottom - 0.5 &&
      (u.line === t.line ? u.x > t.x + 10 : grid ? u.x > t.x + 20 && u.line.y0 < t.line.y1 : u.x > t.x + W / 4));
    const nb = ok.length ? ok.reduce((a, b) => (b.x < a.x ? b : a)) : null;
    // v2.2: and only as far as the question's own text lines run: lines inside the
    // box that start left of the old edge, up to any other label along them. Ink
    // past the old edge that no such line reaches (another cell's expression, a
    // figure beside the question) stays out.
    let reach = -Infinity;
    for (const L of colLines) {
      if (L.y0 < t.line.y0 - 0.5 || L.y1 > bottom + 0.5 || L.items[0].x0 >= right || L.items.at(-1).x1 <= left) continue;
      const stopX = Math.min(Infinity, ...all.filter((u) => u !== t && u.line === L && u.x > t.x).map((u) => u.x));
      for (const it of L.items) if (it.x0 >= left - 1 && it.x0 < stopX) reach = Math.max(reach, it.x1);
    }
    const nr = Math.min(nb ? nb.x - PAD : cx1, reach + PAD);
    if (nr > right + 0.01) { right = nr; rightBind = nb; act.right.add("R32"); }
  }
  // R49: a grid's last row is one row pitch (plus a body height) tall; so is the
  // last cell of a column of drill cells (four or more short lines, evenly spaced).
  const ys = [...new Set(r.map((u) => u.line.y0))].sort((a, b) => a - b);
  const pitches = ys.slice(1).map((y, i) => y - ys[i]);
  // A label's own cell: its items up to the next label along the line.
  const cell = (u) => { const its = u.line.items, k0 = its.indexOf(u.item); let k1 = its.length; for (const v of all) if (v !== u && v.line === u.line && v.x > u.x) k1 = Math.min(k1, its.indexOf(v.item)); return its.slice(k0, k1 < 0 ? its.length : k1).map((i) => i.s).join(" "); };
  const drill = !grid && ys.length >= 4 && r.every((u) => cell(u).length <= 25) && Math.max(...pitches) <= 1.3 * Math.min(...pitches);
  // v2.1 (R49, R32): past the cap, the question's own lines still belong to it:
  // lines starting right of the label (or opening a lettered part), until one at
  // or left of it, a heading, or a blank gap.
  const capLast = (rule) => {
    const d = pitches.slice().sort((a, b) => a - b), pitch = d[Math.floor(d.length / 2)];
    let nb = t.line.y0 + pitch + bodyH, lastY = t.line.y1, grown = false;
    if (!(nb < bottom)) return;
    for (const L of C.colLines) {
      if (L.y0 <= t.line.y1 + 0.5 || !(L.items.at(-1).x1 > left && L.items[0].x0 < right)) continue;
      if (L.y0 >= bottom) break;
      // Contiguous: a gap over 1.5 body heights must hold ink (a figure) to be crossed.
      if (L.y0 - lastY > 1.5 * bodyH && inkCount(P, left, lastY + 1, right, L.y0 - 1, dk) < 10) break;
      lastY = L.y1;
      if (L.y1 <= nb) continue;
      // At or left of the label it is the next thing, unless it opens a lettered part ("a) Show that").
      if ((L.items[0].x0 <= t.x + 2 && !SUBPART.test(L.items[0].s)) || L.hasToken || C.heads.some((h) => h.l === L)) break;
      // Text of its own (a word of three letters); a figure's labels ("A", "30°") do not extend it.
      if (/[A-Za-z]{3}/.test(L.text)) { nb = Math.max(nb, L.y1 + 0.3 * bodyH); grown = true; }
    }
    // Grown over its own lines, it takes the ink touching the last of them (a
    // table's bottom rule, descenders), up to a body height more.
    if (grown) {
      const X0 = Math.max(0, Math.floor(left * S)), X1 = Math.min(P.cw - 1, Math.ceil(right * S) - 1), Ye = Math.min(Math.floor(bottom * S), Math.ceil((nb + bodyH) * S));
      let y = Math.ceil(nb * S);
      const inked = (yy) => { for (let x = X0; x <= X1; x++) if (dk(x, yy)) return true; return false; };
      while (y < Ye && inked(y)) y++;
      nb = Math.max(nb, y / S);
    }
    if (nb < bottom) { bottom = nb; act.bottom.add(rule); bindBy = null; }
  };
  if (E.has("R49") && (grid || drill)) {
    if (ys.length >= 2 && t.line.y0 === ys.at(-1)) capLast("R49");
  }
  // v2.1 (R32): a column-major run's last cell is capped like a grid's last row:
  // a run R32 started, or one whose every label is level with another run's (a table's column).
  const tableColumn = () => r.every((u) => all.some((v) => !r.includes(v) && Math.abs(v.line.y0 - u.line.y0) <= 2));
  if (E.has("R32") && !grid && !drill && ys.length >= 2 && t === r.at(-1) && (r[0].startBy === "R32" || tableColumn())) capLast("R32");
  // R48: a placed image straddling the bottom goes to the question holding most of it.
  let top = t.line.y0 - PAD, topRow = Math.floor((t.line.y0 - 1) * S), split = false;
  // v2.1: a heading ending this box is never crossed; the bottom is never raised
  // over this question's own text; a speck (under 2 source px or 5 pt drawn) is no image.
  const headStop = act.bottom.has("R29") || act.bottom.has("R27") ? bottom : Infinity;
  const ownTextBelow = (y) => C.colLines.some((L) => L.y0 > y && L.y1 <= bottom + 1 && L.y0 > t.line.y1 - 0.5 && !L.hasToken && L.items.at(-1).x1 > left && L.items[0].x0 < right);
  if (E.has("R48")) for (const im of P.rects) {
    if (im.x1 <= left || im.x0 >= right || im.x1 - im.x0 > 0.9 * (cx1 - cx0) || im.y1 - im.y0 < 12) continue;
    if (im.tiny) continue;
    const span0 = t.line.y0, span1 = labelBottom;
    const inside = Math.max(0, Math.min(im.y1, span1) - Math.max(im.y0, span0)) / (im.y1 - im.y0);
    if (im.y0 < bottom && im.y1 > bottom) {
      // Split between two questions only when the next question's label is what it crosses.
      if (inside >= 0.5) { if (im.y1 > headStop) continue; if (im.y1 > labelBottom && labelBottom < lim - 0.01) split = true; bottom = Math.max(bottom, Math.min(P.H, im.y1)); act.bottom.add("R48"); bindBy = null; }
      else if (im.y0 > t.line.y1 && !ownTextBelow(im.y0 - 1)) { bottom = im.y0 - 1; act.bottom.add("R48"); bindBy = null; }
    }
    // An image that holds the label's own line, rising above it, raises the top.
    if (im.y0 < top && im.y1 > t.line.y0 && inside >= 0.5) {
      const prev = C.prevLine(t);
      const nt = Math.max(im.y0, prev ? prev.y1 : 0);
      if (nt < top - 0.01) { top = nt; topRow = Math.floor(nt * S); act.top.add("R48"); }
    }
  }
  // R50: a marks-only line just above the label is this question's first line.
  if (E.has("R50") && t.markLine) { top = Math.min(top, t.markLine.y0 - PAD); topRow = Math.min(topRow, Math.floor((t.markLine.y0 - 1) * S)); act.top.add("R50"); }
  // Ink sets the box: the last inked row above the bottom, found from the
  // label's own column rightwards, then the sides.
  let X0 = Math.max(0, Math.floor(left * S));
  const X1 = Math.min(P.cw - 1, Math.ceil(right * S) - 1);
  const XL = Math.max(X0, Math.floor((t.x - PAD) * S));
  const Y0 = Math.floor((t.line.y0 - 1) * S);
  let Y1 = Math.floor(bottom * S);
  const rowInk = (y) => { for (let x = XL; x <= X1; x++) if (dk(x, y)) return true; return false; };
  while (Y1 > Y0 && !rowInk(Y1)) Y1--;
  const capByLimit = bottom >= lim - 0.01;
  // R42: a drawing that crosses the footer band is kept whole.
  if (E.has("R42") && capByLimit && !C.footerFound && Y1 >= Math.floor(bottom * S) - 1) {
    let y = Y1 + 1;
    while (y < Math.floor(P.H * 0.985 * S) && rowInk(y)) y++;
    if (y - 1 > Y1) { Y1 = y - 1; bottom = Math.max(bottom, Y1 / S + 1); act.bottom.add("R42"); }
  }
  // R47: ink left of the label anywhere in the question's span (an outdented
  // stem, a table border, option letters), never on another label's line.
  if (E.has("R47")) {
    let lo = Math.max(Math.floor(cx0 * S), Math.floor((t.x - 40) * S));
    // Never into a neighbouring cell: a label on this line to the left owns everything up to this one.
    if (all.some((u) => u !== t && u.x < t.x - 1 && u.line.y0 < t.line.y1 && u.line.y1 > t.line.y0)) lo = Math.max(lo, Math.floor((t.x - PAD) * S));
    const banned = all.filter((u) => u !== t).map((u) => [Math.floor((u.line.y0 - bodyH) * S), Math.ceil(u.line.y1 * S)]);
    const rows = [];
    for (let y = Math.ceil(t.line.y1 * S) + 1; y <= Y1; y++) if (!banned.some(([a, b]) => y >= a && y <= b)) rows.push(y);
    // A vertical rule through the span with ink beyond it is a cell divider:
    // never cross it. One with nothing beyond it is the question's own frame.
    const isRule = (x) => { let n = 0; for (const y of rows) if (dk(x, y)) n++; return n >= 0.8 * rows.length; };
    for (let x = X0 - 1; x >= lo && rows.length; x--) {
      if (!isRule(x)) continue;
      let x0r = x; while (x0r - 1 >= lo && isRule(x0r - 1)) x0r--;   // the rule's whole width
      let beyond = false;
      for (let xx = lo; xx < x0r - 1 && !beyond; xx++) for (const y of rows) if (dk(xx, y)) { beyond = true; break; }
      // A rule running on two body heights above and below this question is the page's divider or border.
      const ya2 = Math.floor((t.line.y0 - 2 * bodyH) * S), yb2 = Math.ceil(Y1 + 2 * bodyH * S);
      const pageLong = ya2 > 0 && yb2 < P.ch && dk(x, ya2) && dk(x, yb2);
      if (beyond || pageLong) lo = x + 1;
      break;
    }
    // A row whose ink from there runs on unbroken for 20 pt is a ruled line, not content.
    let minX = X0;
    for (const y of rows) for (let x = lo; x < minX; x++) if (dk(x, y)) {
      let run = x; while (run < X1 && dk(run + 1, y)) run++;
      if (run - x < 20 * S) minX = x;
      break;
    }
    if (minX < X0) { const nl = Math.max(cx0, minX / S - PAD); if (nl < left - 0.01) { left = nl; X0 = Math.max(0, Math.floor(left * S)); act.left.add("R47"); } }
  }
  // R45: the top takes ink rising straight from the label line (a numerator, an
  // overbar), then up to 4 pt of blank rows, and stops at the line above's ink.
  let topY0 = Math.min(Y0, topRow);
  if (E.has("R45")) {
    // Over the label line's own text, leaving out vertical rules (a column inked
    // all the way from a body height above the line to its foot); a row whose ink
    // runs unbroken for 20 pt is a ruled line and stops the climb.
    const XE = Math.min(X1, Math.ceil((Math.max(...t.line.items.map((i) => i.x1)) + PAD) * S));
    const ya = Math.max(0, Math.floor((t.line.y0 - bodyH) * S)), yb = Math.ceil(t.line.y1 * S);
    const vert = new Uint8Array(XE + 1);
    for (let x = XL; x <= XE; x++) { let n = 0; for (let y = ya; y <= yb; y++) if (dk(x, y)) n++; if (n >= 0.9 * (yb - ya + 1)) vert[x] = 1; }
    // v2.1: a run of 20 to 60 pt just over the label line (0.3 body height at
    // most), that starts inside its text and ends within 6 pt of its end (a
    // radical's bar over the numbers), is not a ruled line.
    const textEnd = Math.ceil((Math.max(...t.line.items.map((i) => i.x1)) + 6) * S), barY = Math.floor((t.line.y0 - 0.3 * bodyH) * S);
    const ruled = (y) => {
      let run = 0;
      for (let x = XL; x <= XE + 1; x++) {
        if (x <= XE && dk(x, y)) { run++; continue; }
        if (run >= 20 * S) {
          let e = x - 1; while (e + 1 < P.cw && e < textEnd + 4 * S && dk(e + 1, y)) e++;
          if (!(y >= barY && x - run > XL + 2 && e <= textEnd && e - (x - run) < 60 * S)) return true;
        }
        run = 0;
      }
      return false;
    };
    const rowHas = (y) => { if (ruled(y)) return true; for (let x = XL; x <= XE; x++) if (!vert[x] && dk(x, y)) return true; return false; };
    // Climbing ink joined to the label line is this question's (a numerator), up
    // to the foot of the line above: one ending 0.3 body height or more above the
    // label line (a numerator set as a line of its own, just above, is not it).
    const prev = C.prevLine(t, 0.3 * bodyH);
    const cap = prev ? Math.ceil(prev.y1 * S) : 0;
    let raised = Math.floor(t.line.y0 * S), y = raised - 1;
    const maxRaise = Math.floor((t.line.y0 - bodyH) * S);
    // v2.1: the climb bridges blank gaps of up to 2 pt over the label line's own
    // text (a radical's bar, a fraction bar, an exponent), never into the line
    // above's descenders.
    const floorY = Math.max(cap, maxRaise, 0), guard = prev ? Math.ceil((prev.y1 + 0.3 * bodyH) * S) : 0;
    // v2.2: ink reached over a gap must end in a blank row below the floor (a bar,
    // a numerator); one running on to the floor or a ruled row is the foot of
    // what stands above (the question above's icon, a table's row above, a
    // figure's label, a heading): that bridge is undone.
    let beforeBridge = null;
    for (;;) {
      while (y > floorY && rowHas(y) && !ruled(y)) { raised = y; y--; }
      if (y <= floorY || ruled(y)) { if (beforeBridge != null) raised = beforeBridge; break; }
      let y2 = -1;
      for (let k = 1; k <= 2 * S; k++) { const yy = y - k; if (yy <= Math.max(floorY, guard) || ruled(yy)) break; if (rowHas(yy)) { y2 = yy; break; } }
      if (y2 < 0) break;
      beforeBridge = raised;
      y = y2;
    }
    let tr = raised;
    for (let k = 1; k <= PAD * S; k++) { const yy = raised - k; if (yy <= Math.max(cap, 0) - 1 || yy < 0 || rowHas(yy)) break; tr = yy; }
    const nt = Math.min(tr / S, t.line.y0);
    // Pixel rounding alone (under 1 pt) leaves v1's top as it was.
    if (Math.abs(nt - top) >= 1 && !act.top.has("R48") && !act.top.has("R50")) { top = nt; act.top.add("R45"); topY0 = Math.min(topY0, tr); }
  }
  // R69: ink in the top two rows that the third row does not continue is the line above's tail (a comma, a
  // descender, drawn a pixel lower by another canvas): it does not widen the box, unless it is all the ink there is.
  const tail = (x, y) => on("R69") && y < topY0 + 2 && topY0 + 2 <= Y1 && !dk(x, topY0 + 2);
  let minX = X1, maxX = X0, inkTop = Infinity, tMin = X1, tMax = X0;
  for (let y = topY0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (dk(x, y)) {
    if (tail(x, y)) { tMin = Math.min(tMin, x); tMax = Math.max(tMax, x); } else { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    if (y < inkTop) inkTop = y;
  }
  if (minX > maxX && tMin <= tMax) { minX = tMin; maxX = tMax; }
  const box = [Math.max(left, minX / S - PAD), Math.max(0, act.top.size ? top : t.line.y0 - PAD), Math.min(right, maxX / S + PAD), Math.min(bottom, Y1 / S + PAD)];
  return { box, act, bindBy, rightBind, capByLimit, inkTop: inkTop / S, inkBottom: Y1 / S, split, limitBy: capByLimit ? C.limitBy : new Set() };
}

// A region's ink, shrunk to + PAD. Null when the region holds no ink.
function inkBox(P, x0, y0, x1, y1) {
  const X0 = Math.max(0, Math.floor(x0 * S)), X1 = Math.min(P.cw - 1, Math.ceil(x1 * S) - 1);
  const Y0 = Math.max(0, Math.floor(y0 * S)), Y1 = Math.min(P.ch - 1, Math.floor(y1 * S));
  // R69: the line above's tail at the top edge does not widen the box (as in boxFor).
  const tail = (x, y) => on("R69") && y < Y0 + 2 && Y0 + 2 <= Y1 && !P.dark(x, Y0 + 2);
  let a = X1, b = X0, c = Y1, d = Y0, any = false, ta = X1, tb = X0;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (P.dark(x, y)) {
    any = true;
    if (tail(x, y)) { if (x < ta) ta = x; if (x > tb) tb = x; } else { if (x < a) a = x; if (x > b) b = x; }
    if (y < c) c = y; if (y > d) d = y;
  }
  if (!any) return null;
  if (a > b) { a = ta; b = tb; }
  return [Math.max(x0, a / S - PAD), Math.max(y0, c / S - PAD), Math.min(x1, b / S + PAD), Math.min(y1, d / S + PAD)];
}

const r1 = (v) => +v.toFixed(1);
function emit(P, q) {
  const [ax, ay] = P.vp.convertToPdfPoint(q.box[0], q.box[1]), [bx, by] = P.vp.convertToPdfPoint(q.box[2], q.box[3]);
  q.box = q.box.map(r1);
  q.pdf = { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
  return q;
}

// ------------------------------------------------------- page-level rules ---
// R1: read paint order and render modes from the operator list; count visible
// glyphs (not mode 3 invisible, not 7 clip-only) painted after the largest image.
async function glyphsAfterLargestImage(page, nrec, rects) {
  const ops = await page.getOperatorList();
  const sizes = [], glyphsAfter = [];
  let mode = 0, visible = 0; const modes = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === OPS.save) modes.push(mode);
    else if (fn === OPS.restore) mode = modes.pop() ?? 0;
    else if (fn === OPS.setTextRenderingMode) mode = a[0];
    else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) { sizes.push([a[1], a[2]]); glyphsAfter.push(visible); }
    else if (fn === OPS.paintInlineImageXObject) { sizes.push([a[0].width, a[0].height]); glyphsAfter.push(visible); }
    else if ((fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) && mode !== 3 && mode !== 7) {
      const g = fn === OPS.nextLineSetSpacingShowText ? a[2] : a[0];
      for (const x of g || []) if (x && typeof x === "object" && x.unicode && x.unicode.trim()) visible++;
    }
  }
  // The paint-order sizes pair with the recorded rects; an image clipped away
  // entirely is not recorded, so when the counts differ keep the old rule.
  if (sizes.length !== nrec) return null;
  let k = -1, best = 0;
  rects.forEach((q, i) => { const a = (q.x1 - q.x0) * (q.y1 - q.y0); if (a > best) { best = a; k = i; } });
  return k < 0 ? null : visible - glyphsAfter[k];
}

// v2.1 (R48): each recorded image's source size in pixels, in paint order; null
// when the paint count and the recorded rects differ (as R1 does).
async function imageSources(page, nrec) {
  const ops = await page.getOperatorList();
  const sizes = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) sizes.push([a[1], a[2]]);
    else if (fn === OPS.paintInlineImageXObject) sizes.push([a[0].width, a[0].height]);
  }
  return sizes.length === nrec ? sizes : null;
}

// v2.2 (R27, R29): the fonts a page paints text in only invisibly (render mode 3,
// or 7, clip only): an OCR layer over handwriting or a scan. Null when none.
async function invisibleOnlyFonts(page) {
  const ops = await page.getOperatorList();
  let mode = 0, font = null;
  const st = [], vis = new Set(), inv = new Set();
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === OPS.save) st.push([mode, font]);
    else if (fn === OPS.restore) [mode, font] = st.pop() ?? [0, null];
    else if (fn === OPS.setTextRenderingMode) mode = a[0];
    else if (fn === OPS.setFont) font = a[0];
    else if (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) (mode === 3 || mode === 7 ? inv : vis).add(font);
  }
  const only = new Set([...inv].filter((f) => f != null && !vis.has(f)));
  return only.size ? only : null;
}

// R6: does the operator list paint any image?
async function paintsImages(page) {
  const ops = await page.getOperatorList();
  const img = new Set([OPS.paintImageXObject, OPS.paintImageXObjectRepeat, OPS.paintInlineImageXObject, OPS.paintInlineImageXObjectGroup, OPS.paintImageMaskXObject, OPS.paintImageMaskXObjectGroup, OPS.paintImageMaskXObjectRepeat]);
  return ops.fnArray.some((fn) => img.has(fn));
}

// R44: page frames and page-long rules. A pixel column dark over 70% of the
// rows between the 6% bands, anywhere, unless two or more horizontal rules
// cross it inside its length (a table's column rule, not a page border or a
// drawn divider); and, only on a page with such a column, a pixel row dark
// over 60% of the width in the outer 10% of the height.
function frameMask(P, img) {
  const W2 = P.cw, H2 = P.ch, cc = new Uint32Array(W2), rc = new Uint32Array(H2);
  const ya = Math.floor(H2 * 0.06), yb = Math.ceil(H2 * 0.94);
  const dk = (x, y) => { const o = (y * W2 + x) * 4; return img[o] + img[o + 1] + img[o + 2] < 600; };
  for (let y = 0, o = 0; y < H2; y++) for (let x = 0; x < W2; x++, o += 4) if (img[o] + img[o + 1] + img[o + 2] < 600) { if (y >= ya && y < yb) cc[x]++; rc[y]++; }
  const col = new Uint8Array(W2), row = new Uint8Array(H2), spans = [];
  let any = false;
  for (let x = 0; x < W2; ) {
    if (cc[x] <= (yb - ya) * 0.7) { x++; continue; }
    let x1 = x; while (x1 + 1 < W2 && cc[x1 + 1] > (yb - ya) * 0.7) x1++;
    // The rule's length, and the horizontal rules (a run of 15% of the width) that cross it inside it.
    const xm = (x + x1) >> 1;
    let top = 0, bot = H2 - 1; while (top < H2 && !dk(xm, top)) top++; while (bot > 0 && !dk(xm, bot)) bot--;
    let crossings = 0, inRule = false;
    for (let y = top + Math.ceil(H2 * 0.03); y < bot - Math.ceil(H2 * 0.03); y++) {
      let run = 0;
      for (let xx = Math.max(0, x - 1); xx >= 0 && dk(xx, y); xx--) run++;
      for (let xx = x1 + 1; xx < W2 && dk(xx, y); xx++) run++;
      const hit = run >= W2 * 0.15;
      if (hit && !inRule) crossings++;
      inRule = hit;
    }
    if (crossings < 2) { for (let k = x; k <= x1; k++) col[k] = 1; any = true; spans.push({ x0: x, x1, top, bot }); }
    x = x1 + 1;
  }
  if (!any) return null;
  for (let y = 0; y < H2; y++) if ((y < H2 * 0.1 || y > H2 * 0.9) && rc[y] > W2 * 0.6) row[y] = 1;
  return { col, row, spans };
}

// R2: an item is visible when its box (inset a pixel at the top and sides) holds 3 or more pixels
// darker than near-white. Lighter than v1's ink bar, so pale text survives.
function visibleItem(P, img, it) {
  const X0 = Math.max(0, Math.floor(it.x0 * S) + 1), X1 = Math.min(P.cw - 1, Math.ceil(it.x1 * S) - 1);
  // Down into the descender zone: an underscore's ink sits below the baseline.
  const Y0 = Math.max(0, Math.floor(it.y0 * S) + 1), Y1 = Math.min(P.ch - 1, Math.ceil((it.y1 + 0.35 * (it.y1 - it.y0)) * S));
  let n = 0;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const o = (y * P.cw + x) * 4; if (img[o] + img[o + 1] + img[o + 2] < 700 && ++n >= 3) return true; }
  return X1 < X0 || Y1 < Y0; // degenerate boxes are left alone
}

// R9-R11: is this line an answers heading? Returns the form that matched or null.
function answersForm(l, bodyH, P, lines, isFirst) {
  const s0 = l.text.trim();
  if (process.env.V2_TEST_NOANS === "1") return null;
  if (s0.length >= (on("R10") ? 130 : 80)) return null;
  if (s0.length < 80 && ANSWERS.test(s0)) return "v1";
  if (FIRST.test(l.items[0].s) || FIRST_MERGED.test(l.items[0].s)) return null; // a question's own line
  // Also the line with abutting items joined tight: pdf.js can split "Ans" "wers".
  const tight = l.items.map((it, k) => (k && it.x0 - l.items[k - 1].x1 > 0.15 * (it.y1 - it.y0) ? " " : "") + it.s).join("").trim();
  for (const s of s0 === tight ? [s0] : [s0, tight]) {
    const f = answersFormOf(s, l, bodyH, isFirst);
    if (f) return f;
  }
  return null;
}
function answersFormOf(s, l, bodyH, isFirst) {
  if (on("R9") && s.length < 80) {
    if (ANSWERS_V.test(s)) return "R9";
    if (ANSWERS_PREFIXED.test(s) && (Math.max(...l.items.map((i) => i.y1 - i.y0)) >= 1.25 * bodyH || isFirst)) return "R9";
  }
  if (on("R10")) {
    if (ANSWERS_DASH.test(s)) return "R10";
    // Each gap-separated segment too: a centred title and a right-hand "Marks:" share one line.
    const segs = []; let cur = [];
    l.items.forEach((it, k) => { if (k && it.x0 - l.items[k - 1].x1 > 2 * bodyH) { segs.push(cur); cur = []; } cur.push(it); });
    segs.push(cur);
    if (segs.length > 1 && segs.some((g) => ANSWERS_DASH.test(g.map((i) => i.s).join(" ").trim()))) return "R10";
  }
  return null;
}
// R11: bold, larger than body or the page's first lines, and at the margin or centred.
function looksLikeHeading(l, bodyH, P, lines) {
  const big = Math.max(...l.items.map((i) => i.y1 - i.y0)) >= 1.1 * bodyH;
  const bold = l.items.every((i) => i.bold);
  // The page's first three lines, repeated or not: a title on every sheet is still a title.
  const firstLines = lines.indexOf(l) >= 0 && lines.indexOf(l) < 3;
  // In the left quarter of the page or centred: a word in a table cell (x 450 of 595) is neither.
  const atLeft = l.items[0].x0 <= 0.25 * P.W;
  const centred = Math.abs((l.items[0].x0 + l.items.at(-1).x1) / 2 - P.W / 2) < 0.1 * P.W;
  return (big || bold || firstLines || inkBold(l, P)) && (atLeft || centred);
}

// -------------------------------------------------------- pre-pass (text) ---
// Text only, for what needs the whole file: lines repeated at one height (R43's
// footer furniture, R51's running header) and the next page's labels (R53).
const pre = [];
if (["R43", "R51", "R53"].some(on)) {
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const lines = linesOf(itemsOf(await page.getTextContent(), vp));
    pre[p] = { H: vp.height, lines: lines.map((l) => ({ text: l.text.trim(), y0: l.y0 })) };
  }
}
const repeatCount = (text, y0) => { let n = 0; for (let p = 1; p < pre.length; p++) if (pre[p] && pre[p].lines.some((q) => q.text === text && Math.abs(q.y0 - y0) <= 2)) n++; return n; };

// --------------------------------------------------------------- pages ---
const result = [];
const state = { answersFrom: Infinity, inAnswers: false, open: null, lastQ: null, prefixX: null, model: null, v1From: Infinity, v1Y: Infinity, resetSince: null };
const allQuestions = [];   // every question proposal, in reading order, for R15 and R52's "for"
const sectionMarks = [];   // v2.1 (R52): section headings in reading order ({page, col, y})
// R52 / R53: a section heading between two places in reading order ends a stem's or context's questions.
const headingBetween = (a, b) => {
  const before = (u, v) => u.page < v.page || (u.page === v.page && (u.col < v.col || (u.col === v.col && u.y < v.y)));
  return sectionMarks.some((m) => before(a, m) && before(m, b));
};
const redraw = new Set();  // pages whose overlay the post-pass redraws
const pageRows = [];       // [result row, page context] for the post-pass

const ONLY = process.env.V2_PAGES ? new Set(process.env.V2_PAGES.split(",").map(Number)) : null;
const DEBUG = process.env.V2_DEBUG === "1";
const NOPNG = process.env.V2_NOPNG === "1";   // lab only: no overlay PNGs (the JSON is unchanged)
for (let p = 1; p <= doc.numPages; p++) {
  if (ONLY && !ONLY.has(p)) continue;
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const rvp = page.getViewport({ scale: S });
  const { canvas, context } = doc.canvasFactory.create(Math.ceil(rvp.width), Math.ceil(rvp.height));
  await page.render({ canvas, viewport: rvp, recordImages: true }).promise;
  const ic = page.imageCoordinates;
  let coverage = 0;
  const rects = [];
  if (ic) for (let k = 0; k + 5 < ic.length; k += 6) {
    const xs = [ic[k], ic[k + 2], ic[k + 4]], ys = [ic[k + 1], ic[k + 3], ic[k + 5]];
    coverage = Math.max(coverage, (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)));
    const x3 = ic[k + 2] + ic[k + 4] - ic[k], y3 = ic[k + 3] + ic[k + 5] - ic[k + 1];
    xs.push(x3); ys.push(y3);
    rects.push({ x0: Math.min(...xs) * vp.width, x1: Math.max(...xs) * vp.width, y0: Math.min(...ys) * vp.height, y1: Math.max(...ys) * vp.height });
  }
  // v2.1 (R48): specks are not images (a 1x1 whiteout patch, a hairline).
  if (on("R48") && rects.length) {
    const src = await imageSources(page, rects.length);
    rects.forEach((r, i) => { r.tiny = r.x1 - r.x0 < 5 || r.y1 - r.y0 < 5 || (!!src && (src[i][0] < 2 || src[i][1] < 2)); });
  }
  // The canvas size is read once: it is a native getter, slow per pixel.
  const CW = canvas.width, CH = canvas.height;
  const img = context.getImageData(0, 0, CW, CH).data;
  const dark0 = (x, y) => { const o = (y * CW + x) * 4; return img[o] + img[o + 1] + img[o + 2] < 600; };
  const fired = new Set();
  const carriedModel = state.model;   // v2.1 (R53 ii): the context open when this page starts
  const P = { p, page, vp, W: vp.width, H: vp.height, cw: CW, ch: CH, dark0, dark: dark0, rects, state, fired, boldShare: 0, minX: 0 };
  P.isFurniture = (l) => {
    const t = l.text.trim();
    if (!pre.length) return false;
    return (pre.length > 3 && repeatCount(t, l.y0) >= 3) || NAME_LINE.test(t) || /^(?:date|class|grade|score|teacher)\s*:/i.test(t);
  };
  if (on("R44")) {
    const fm = frameMask(P, img);
    if (fm) { P.frame = fm; P.dark = (x, y) => !fm.col[x] && !fm.row[y] && dark0(x, y); }
  }

  let items = itemsOf(await page.getTextContent(), vp);
  if (needBold) {
    const bold = new Map();
    for (const it of items) {
      if (!bold.has(it.font)) { let b = false; try { if (page.commonObjs.has(it.font)) { const f = page.commonObjs.get(it.font); b = !!f.bold || /bold|black|heavy|semibold|demi/i.test(f.name || ""); } } catch { b = false; } bold.set(it.font, b); }
      it.bold = bold.get(it.font);
    }
    const tot = items.reduce((n, it) => n + it.s.length, 0) || 1;
    P.boldShare = items.reduce((n, it) => n + (it.bold ? it.s.length : 0), 0) / tot;
  }
  if (on("R27") || on("R29")) P.ocrFonts = await invisibleOnlyFonts(page);
  let invisible = 0;
  if (on("R2")) {
    const vis = items.filter((it) => visibleItem(P, img, it));
    invisible = items.length - vis.length;
    if (invisible) { fired.add("R2"); items = vis; }
  }
  const chars = items.reduce((n, it) => n + it.s.length, 0);
  P.minX = items.length ? Math.min(...items.filter((i) => i.y0 < vp.height * 0.94).map((i) => i.x0)) : 0;

  // Kind of page. v1: scanned when the largest image covers half the page, else
  // digital at 20 characters, else none.
  let kind = coverage >= 0.5 ? "scanned" : chars >= 20 ? "digital" : "none";
  let overImage = false;
  if (on("R1") && coverage >= 0.5 && chars >= 20) {
    const g = await glyphsAfterLargestImage(page, rects.length, rects);
    if (g != null && g >= 20) { kind = "digital"; overImage = true; }
  }
  P.fewChars = on("R3") && kind === "none" && chars > 0 && coverage < 0.5;
  const proposals = [];
  let cover = false, pageAnswers = false;

  // Answers heading on a page the text rules do not read (R12): a mark scheme
  // pasted as pictures under a text heading still ends the questions.
  const readable = (kind === "digital" || P.fewChars);
  if (on("R12") && !readable && items.length && !(state.inAnswers || p > state.answersFrom)) {
    const ls = linesOf(items), hs = items.flatMap((it) => Array(Math.min(it.s.length, 50)).fill(it.y1 - it.y0)).sort((a, b) => a - b), bh = hs[Math.floor(hs.length / 2)];
    P.allLines = ls;
    const al = ls.find((l, i) => answersForm(l, bh, P, ls, i < 2) && (!on("R11") || looksLikeHeading(l, bh, P, ls)));
    if (al) { state.answersFrom = Math.min(state.answersFrom, p); state.inAnswers = true; fired.add("R12"); }
  }

  // R13: a new sheet (a Name: line in the top fifth, no answers heading of its own) ends the answers.
  if (readable && on("R13") && state.inAnswers && p > state.answersFrom) {
    const ls = linesOf(items);
    const hs = items.flatMap((it) => Array(Math.min(it.s.length, 50)).fill(it.y1 - it.y0)).sort((a, b) => a - b), bh = hs[Math.floor(hs.length / 2)];
    if (ls.some((l) => l.y0 < vp.height * 0.2 && NAME_LINE.test(l.text.trim())) && !ls.some((l, i) => answersForm(l, bh, P, ls, i < 2))) {
      state.inAnswers = false; fired.add("R13"); state.resetSince = p;
    }
  }
  const inAnswers = () => (on("R13") ? state.inAnswers : p > state.answersFrom);
  let colInfo = [], pageCtx = null;

  if (readable && !inAnswers()) {
    const hs = items.flatMap((it) => Array(Math.min(it.s.length, 50)).fill(it.y1 - it.y0)).sort((a, b) => a - b);
    const bodyH = hs[Math.floor(hs.length / 2)];
    P.bodyH = bodyH;
    const lines = bodyLines(items, bodyH);
    P.allLines = lines;
    // The answers heading ends the questions, on this page and every one after.
    let ansLine = null, ansForm = null;
    for (let i = 0; i < lines.length && !ansLine; i++) {
      const f = answersForm(lines[i], bodyH, P, lines, i < 2);
      if (!f) continue;
      if (DEBUG) process.stderr.write(`p${p} answers? "${lines[i].text.slice(0, 60)}" form=${f} heading=${looksLikeHeading(lines[i], bodyH, P, lines)} h=${Math.max(...lines[i].items.map((x) => x.y1 - x.y0)).toFixed(1)}/${bodyH.toFixed(1)} bold=${lines[i].items.map((x) => x.bold).join("")} x0=${lines[i].items[0].x0.toFixed(0)} y0=${lines[i].y0.toFixed(0)}\n`);
      if (on("R11") && !looksLikeHeading(lines[i], bodyH, P, lines)) { fired.add("R11"); continue; }
      ansLine = lines[i]; ansForm = f;
    }
    if (ansLine && P.fewChars && !on("R12")) ansLine = null;
    // Where v1's own answers heading was (for tagging what v1 would have suppressed).
    if (!P.fewChars && !(p > state.v1From)) { const v = lines.find((l) => l.text.length < 80 && ANSWERS.test(l.text.trim())); if (v && p < state.v1From) { state.v1From = p; state.v1Y = v.y0; } }
    if (ansLine) { state.answersFrom = Math.min(state.answersFrom, p); state.inAnswers = true; if (ansForm !== "v1") fired.add(ansForm); }
    // Footer: v1's outer 6%, or the page's own (R41-R43).
    const limitBy = new Set();
    let foot = vp.height * 0.94, footerFound = false;
    if (on("R41")) {
      const pnRx = /^(?:page\s*)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$|^\d{1,3}\s*\|\s*page$|^page\s*\|\s*\d{1,3}$/i;
      const low = lines.filter((l) => l.y0 > vp.height * 0.88);
      // v2.1: a number in a figure (inside a placed image, or with drawn ink beside
      // it on its band, such as a chart's axis) is no page number. v2.2: beside it
      // means more than 2 pt clear of its own glyphs; ink touching or over the number
      // (a calculator icon drawn across it) is not a figure round it.
      const inFigure = (l) => {
        if (P.rects.some((r) => l.items[0].x0 >= r.x0 - 1 && l.items.at(-1).x1 <= r.x1 + 1 && l.y0 >= r.y0 - 1 && l.y1 <= r.y1 + 1)) return true;
        const X0 = Math.max(0, Math.floor((l.items[0].x0 - 12) * S)), X1 = Math.min(CW - 1, Math.ceil((l.items.at(-1).x1 + 12) * S));
        const Y0 = Math.floor((l.y0 - 1) * S), Y1 = Math.min(CH - 1, Math.ceil((l.y1 + 0.3 * (l.y1 - l.y0) + 1) * S));
        let n = 0;
        for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (P.dark(x, y) && !l.items.some((it) => x >= (it.x0 - 2) * S && x <= (it.x1 + 2) * S)) n++;
        return n >= 6;
      };
      const pn = low.filter((l) => pnRx.test(l.text.trim()) && !inFigure(l)).at(-1);
      if (pn && !lines.some((l) => l !== pn && l.y0 > pn.y1)) { foot = pn.y0 - 1; footerFound = true; limitBy.add("R41"); }
      if (P.frame) {
        // v2.1: a page frame's own bottom rule only: one that side rules end on which
        // reach the top band, above the page's first question line (a frame drawn
        // under a question's label is that question's, and a table's border is no frame).
        const firstLab = lines.find((l) => FIRST.test(l.items[0].s) || FIRST_MERGED.test(l.items[0].s));
        const pageFrame = (y) => P.frame.spans.some((sp) => sp.top <= P.ch * 0.12 && (!firstLab || sp.top < firstLab.y0 * S) && Math.abs(sp.bot - y) <= 3 * S);
        let ry = -1;
        for (let y = Math.ceil(P.ch * 0.9); y < P.ch; y++) if (P.frame.row[y] && pageFrame(y)) { ry = y; break; }
        if (ry >= 0) { const v = ry / S - 1; if (!footerFound || v < foot) { foot = v; footerFound = true; limitBy.add("R41"); } }
      }
    }
    if (on("R42") && !footerFound) {
      // Never cut a line: one that starts above the band with its baseline in it
      // is kept whole, and so is a line carrying the text flow on into the band.
      const f0 = foot;
      for (const l of lines) if (l.y0 < foot && l.y1 + bodyH * 0.3 > foot) foot = Math.max(foot, l.y1 + bodyH * 0.5);
      for (let i = 1; i < lines.length; i++) if (lines[i].y1 > foot && lines[i].y0 - lines[i - 1].y1 < bodyH && lines[i - 1].y0 < foot) foot = Math.max(foot, lines[i].y1 + bodyH * 0.5);
      if (foot !== f0) limitBy.add("R42");
    }
    if (on("R43")) {
      // Footer furniture: a foot line repeated at one height on half the pages,
      // or "turn over", "continues on the next page", "do not extend your answer".
      const rx = /^(?:please\s+)?turn over\b|^p\.?t\.?o\.?$|continues on the next page|do not extend your answer|^end(?: of (?:paper|test|exam))?$/i;
      for (const l of lines) {
        if (l.y0 < vp.height * 0.85) continue;
        const t = l.text.trim();
        const rep = pre.length > 2 && repeatCount(t, l.y0) >= Math.max(2, Math.ceil(0.5 * (pre.length - 1)));
        if ((rep || (t.length < 60 && rx.test(t))) && l.y0 - 1 < foot) { foot = l.y0 - 1; limitBy.add("R43"); footerFound = true; }
      }
    }
    const limit = ansLine ? ansLine.y0 - 1 : foot;   // or the footer band
    const limitRef = ansLine && ansForm === "v1" ? ansLine.y0 - 1 : vp.height * 0.94;
    if (ansLine && ansForm !== "v1") limitBy.add(ansForm);
    // A cover (a "Name:" line and a "School:" line) holds a contents list and
    // the rules for students, both numbered, and never a question.
    cover = lines.some((l) => /^name\s*:/i.test(l.text)) && lines.some((l) => /^school\s*:/i.test(l.text));
    let headerBottom = -Infinity;
    if (cover && on("R7")) {
      // R7: Name/School in a test header (SCORE, START/END TIME, MAX TIME,
      // DURATION) heads a question page: propose below the header.
      const fields = /^(?:name|school|score|grade|date|class|section|start\s*time|end\s*time|max(?:imum)?\s*time|duration|time\s*(?:allowed|taken)?|marks?|total)\b[^:]{0,20}:/i;
      const hdr = lines.filter((l) => l.y0 < vp.height * 0.4 && (fields.test(l.text) || /\b(?:score|start\s*time|end\s*time|max(?:imum)?\s*time|duration)\s*:/i.test(l.text)));
      if (hdr.some((l) => /\b(?:score|start\s*time|end\s*time|max(?:imum)?\s*time|duration)\b/i.test(l.text))) {
        cover = false; headerBottom = Math.max(...hdr.map((l) => l.y1)); fired.add("R7");
      }
    }
    if (!cover && on("R8") && lines.some((l) => /^(?:table of )?contents$|^index$/i.test(l.text.trim()))) { cover = true; fired.add("R8"); }

    // Columns: an empty band in the middle 30-70% of the width is a gutter only
    // if each side carries a run of its own.
    let columns = [[0, vp.width]];
    const W = vp.width, bins = new Array(100).fill(0);
    for (const it of items) for (let k = Math.floor((it.x0 / W) * 100); k <= Math.min(99, Math.floor((it.x1 / W) * 100)); k++) bins[k]++;
    const tol = Math.max(1, items.length * 0.03);
    let band = null;
    for (let k = 30; k <= 70; k++) if (bins[k] <= tol) {
      let j = k; while (j + 1 <= 70 && bins[j + 1] <= tol) j++;
      if (!band || j - k > band[1] - band[0]) band = [k, j];
      k = j;
    }
    let colRight0 = null;
    if (band && !cover) {
      let g = ((band[0] + band[1] + 1) / 2 / 100) * W;
      if (on("R38")) {
        // R38: the centre of the widest run of empty bins inside the band.
        let z = null;
        for (let k = band[0]; k <= band[1]; k++) if (bins[k] === 0) { let j = k; while (j + 1 <= band[1] && bins[j + 1] === 0) j++; if (!z || j - k > z[1] - z[0]) z = [k, j]; k = j; }
        if (z) { const g2 = ((z[0] + z[1] + 1) / 2 / 100) * W; if (g2 !== g) { g = g2; P.gutterBy = "R38"; } }
      }
      if (on("R40") && P.frame) {
        // R40: a drawn divider in the band is the gutter.
        const cand = []; for (let x = Math.floor(W * 0.3 * S); x <= Math.ceil(W * 0.7 * S); x++) if (P.frame.col[x]) cand.push(x);
        if (cand.length) { const gx = cand[Math.floor(cand.length / 2)] / S; if (Math.abs(gx - g) > 0.5) { g = gx; P.gutterBy = "R40"; } }
      }
      const side = (keep) => runsOf(bodyLines(items.filter(keep), bodyH), limit, bodyH, P, [0, W]).kept.some((r) => r.length >= 2);
      let ok = side((i) => i.x1 <= g + 1) && side((i) => i.x0 >= g - 1);
      if (ok && on("R39")) {
        // R39: no gutter through a placed image, nor between a table's columns
        // (labels level row for row, the right side not continuing the left).
        // A figure across the gutter; not a background filling most of the page.
        const crossed = rects.some((r) => r.x0 < g - 2 && r.x1 > g + 2 && r.y1 - r.y0 > 12 && r.x1 - r.x0 < 0.6 * W);
        const L = runsOf(bodyLines(items.filter((i) => i.x1 <= g + 1), bodyH), limit, bodyH, P, [0, g]).kept.flat();
        const R = runsOf(bodyLines(items.filter((i) => i.x0 >= g - 1), bodyH), limit, bodyH, P, [g, W]).kept.flat();
        const level = L.filter((a) => R.some((b) => Math.abs((a.line.y0 + a.line.y1) / 2 - (b.line.y0 + b.line.y1) / 2) < bodyH * 0.5)).length;
        const lastL = Math.max(...L.map((t) => t.n)), firstR = Math.min(...R.map((t) => t.n));
        const table = L.length >= 3 && level >= 0.7 * L.length && firstR !== lastL + 1 && firstR !== 1;
        if (crossed || table) { ok = false; fired.add("R39"); }
      }
      // v1's columns, for naming the rule when they differ.
      const g1 = ((band[0] + band[1] + 1) / 2 / 100) * W;
      P.v1cols = side((i) => i.x1 <= g1 + 1) && side((i) => i.x0 >= g1 - 1) ? 2 : 1;
      P.v1g = g1;
      if (ok) {
        columns = [[0, g], [g, W]];
        if (P.gutterBy) fired.add(P.gutterBy);
        if (on("R40")) {
          // R40: the left column's edge covers the text that starts in it.
          // Only a body line inside the questions' span that runs past the
          // gutter into blank space, never into the right column's text.
          const rightItems = items.filter((i) => i.x0 >= g - 1);
          const rLab = runsOf(bodyLines(rightItems, bodyH), limit, bodyH, P, [g, W]).kept.flat();
          const rx = rLab.length ? Math.min(...rLab.map((t) => t.x)) - PAD : g + 0.25 * W;
          const y0q = Math.min(...runsOf(bodyLines(items.filter((i) => i.x1 <= g + 1), bodyH), limit, bodyH, P, [0, g]).kept.flat().map((t) => t.line.y0));
          const own = items.filter((i) => i.x0 < g - 1 && i.x1 > g + 1 && i.x1 < rx && i.y0 >= y0q - 1 &&
            !rightItems.some((o) => o.x0 < i.x1 + 2 && o.y1 > i.y0 - 1 && o.y0 < i.y1 + 1));
          if (own.length) { colRight0 = Math.min(rx, Math.max(...own.map((i) => i.x1)) + 1); fired.add("R40"); }
        }
      }
    }

    // Columns other than v1's (R38-R40 moved or refused the gutter): every box may have moved because of them.
    const colRules = ["R38", "R39", "R40"].filter((id) => fired.has(id));
    const colChanged = colRules.length && (P.v1cols !== columns.length || (columns.length > 1 && Math.abs(columns[0][1] - P.v1g) > 0.5) || colRight0);
    const pageStems = [];
    for (const [ci, [cx0, cx1v]] of (cover ? [] : columns).entries()) {
      const cx1 = ci === 0 && colRight0 && columns.length > 1 ? colRight0 : cx1v;
      const colLines = columns.length > 1 ? bodyLines(items.filter((i) => i.x0 >= cx0 - 1 && i.x1 <= cx1 + 1), bodyH) : lines;
      const R = runsOf(colLines, limit, bodyH, P, [cx0, cx1]);
      let kept = R.kept;
      if (headerBottom > -Infinity) {
        const k2 = kept.map((r) => r.filter((t) => t.line.y0 > headerBottom)).filter((r) => r.length);
        kept = k2;
      }
      if (DEBUG) {
        process.stderr.write(`p${p} col${ci} [${cx0.toFixed(0)},${cx1.toFixed(0)}] bodyH=${bodyH.toFixed(1)} limit=${limit.toFixed(1)}\n`);
        process.stderr.write(`  toks: ${R.toks.map((t) => `${t.n}@${t.x.toFixed(0)},${t.line.y0.toFixed(0)}${t.via ? "/" + t.via : ""}`).join(" ")}\n`);
        process.stderr.write(`  kept: ${kept.map((r) => "[" + r.map((t) => t.n).join(",") + (r.keptBy ? "/" + r.keptBy : "") + "]").join(" ")}\n`);
        process.stderr.write(`  dropped: ${R.dropped.map((d) => "[" + d.r.map((t) => t.n).join(",") + "]/" + (d.rule || "v1")).join(" ")}  removed: ${R.removed.map((x) => `${x.t.n ?? "?"}@${x.t.line.y0.toFixed(0)}/${x.rule || "v1"}`).join(" ")}\n`);
        process.stderr.write(`  heads: ${R.heads.map((h) => `${h.kind}:${h.l.text.slice(0, 30)}@${h.l.y0.toFixed(0)}`).join(" | ")}\n`);
        if (process.env.V2_LINES) for (const l of colLines) process.stderr.write(`    ${l.y0.toFixed(1)}-${l.y1.toFixed(1)} x${l.items[0].x0.toFixed(1)}-${l.items.at(-1).x1.toFixed(1)} h${Math.max(...l.items.map((i) => i.y1 - i.y0)).toFixed(1)} b${l.items.map((i) => (i.bold ? 1 : 0)).join("")} d${(lineDensity(l, P) / (P.medDensity || 1)).toFixed(2)} ${l.text.slice(0, 60)}\n`);
      }
      for (const d of R.dropped) if (d.rule) fired.add(d.rule);
      for (const x of R.removed) if (x.rule) fired.add(x.rule);
      const all = kept.flat();
      for (const t of all) { if (t.via) fired.add(t.via); if (t.chainBy) fired.add(t.chainBy); if (t.startBy) fired.add(t.startBy); }
      for (const r of kept) { if (r.keptBy) fired.add(r.keptBy); if (r.sectionBy) fired.add(r.sectionBy); }
      // The nearest line above a label that overlaps its box's width.
      const prevLine = (t, clear = -1) => { for (let i = t.li - 1; i >= 0; i--) { const l = colLines[i]; if (l.y1 <= t.line.y0 - clear && l.items.at(-1).x1 > t.x - PAD && l.items[0].x0 < cx1) return l; } return null; };
      // R50: a marks-only line just above a label, in the column's right third,
      // nearer the label than the line above it.
      if (on("R50")) for (const t of all) {
        const a = colLines[t.li - 1], b = colLines[t.li - 2];
        if (!a || a.hasToken) continue;
        const s = a.text.trim();
        // "(3)" or "2 marks" / "(2 marks)": a bare number is a page number. v2.1: not "[4]"
        // or "[4 marks]", which in IB and Cambridge papers close the part above.
        if (!/^(?:\(\d{1,2}\)|\(?\d{1,2}\s*marks?\)?)$/i.test(s) || a.items[0].x0 < cx0 + (cx1 - cx0) * 2 / 3) continue;
        const gapBelow = t.line.y0 - a.y1, gapAboveA = b ? a.y0 - b.y1 : Infinity;
        if (gapBelow < gapAboveA) t.markLine = a;
      }
      // R52: "questions N-M" header lines.
      const stemLines = [];
      if (on("R52")) colLines.forEach((l) => {
        if (l.hasToken) return;
        const s = l.text.trim();
        for (const rx of STEM_RANGE) { const m = s.match(rx); if (m) { const a = +m[1], b = m[2] ? +m[2] : a; if (b >= a && b - a < 40) { stemLines.push({ l, y0: l.y0, x0: l.items[0].x0, x1: l.items.at(-1).x1, from: a, to: b }); break; } } }
      });
      // R53: an instruction block directly above a run's first label.
      const blocks = [];
      if (on("R53")) for (const r of kept) {
        const t0 = r[0];
        if (r.length < 2) continue;
        let i = t0.li - 1, top = null, n = 0;
        const blk = [];
        while (i >= 0 && n < 6) {
          const l = colLines[i];
          if (l.hasToken || R.heads.some((h) => h.l === l) || P.isFurniture(l) || l.y1 < vp.height * 0.06 || stemLines.some((h) => h.l === l)) break;
          const below = blk.length ? blk[0] : t0.line;
          if (below.y0 - l.y1 >= bodyH) break;
          blk.unshift(l); n++; i--;
        }
        if (!blk.length) continue;
        const above = colLines[i];
        const headAbove = above && R.heads.some((h) => h.l === above);
        const gapOk = !above || headAbove || P.isFurniture(above) || above.y1 < vp.height * 0.06 || blk[0].y0 - above.y1 > 1.2 * bodyH;
        if (!gapOk || blk[0].items[0].x0 > t0.x + 6) continue;
        if (t0.n !== 1 && !headAbove) continue;
        top = blk[0].y0;
        blocks.push({ run: r, y0: top, x0: Math.min(...blk.map((l) => l.items[0].x0)), x1: Math.max(...blk.map((l) => l.items.at(-1).x1)), y1: t0.line.y0 - 1, lines: blk });
      }
      const heads = R.heads;
      const headAboveToken = (h) => !!colLines[h.li + 1] && colLines[h.li + 1].hasToken;
      // v2.2 (R29): a heading straight above another that stops a box (a strong one, or
      // one above a label, or so on down) heads the same section ("Linear Regression" over "Exercise 7").
      const headAboveHead = (h) => { const g = heads.find((x) => x.li === h.li + 1); return !!g && !g.title27 && (strongHead(g) || headAboveToken(g) || headAboveHead(g)); };
      if (on("R52")) for (const h of heads) if ((strongHead(h) || headAboveToken(h)) && !stemLines.some((x) => x.l === h.l)) sectionMarks.push({ page: p, col: ci, y: h.l.y0 });
      // v2.1 (R29): a heading ends the box above it unless what follows it, before
      // the next heading or the column's end, opens with a lettered part or a table
      // row: then it is the question's own sub-heading or table header. (Requiring a
      // found label after it lost the box ends where the labels below are missed.)
      const headEnds = (h) => {
        if (h._ends != null) return h._ends;
        const nh = heads.find((g) => g.li > h.li);
        const endY = nh ? nh.l.y0 : limit;
        const f = colLines.find((l) => l.y0 > h.l.y1 - 0.5 && l.y0 < endY && !P.isFurniture(l));
        if (!f || all.some((u) => u.line === f)) return (h._ends = true);
        return (h._ends = !(SUBPART.test(f.items[0].s) || tableRow(f, bodyH) || inRuledTable(f, P, bodyH)));
      };
      const C0 = { P, all, cx0, cx1, colLines, bodyH, limit, limitRef, limitBy, footerFound, heads, effective: R.effective, headAboveToken, headAboveHead, stemLines, blocks, prevLine, headEnds };
      const colProps = [];
      for (const r of kept) {
        const grid = new Set(r.map((t) => t.li)).size < r.length; // two labels on one line
        for (const t of r) {
          const C = { ...C0, grid, r };
          const E = new Set(EDGE_RULES.filter(on));
          const real = boxFor(t, C, E);
          const q = { n: t.n, grid, box: real.box, type: "question", rules: new Set() };
          // Attribution: which rules made this proposal, or moved one of its edges.
          if (t.via) q.rules.add(t.via);
          if (t.chainBy) q.rules.add(t.chainBy);
          if (t.startBy) q.rules.add(t.startBy);
          if (r[0].startBy) q.rules.add(r[0].startBy);   // a run R32 started: every label in it
          if (r.keptBy) q.rules.add(r.keptBy);
          if (r.sectionBy) q.rules.add(r.sectionBy);
          for (const u of r) if (u.chainBy) q.rules.add(u.chainBy);
          if (overImage) q.rules.add("R1");
          if (P.fewChars) q.rules.add("R3");
          if (headerBottom > -Infinity) q.rules.add("R7");
          // A proposal v1's answers heading would have suppressed exists because of R11 or R13.
          if (p > state.v1From || (p === state.v1From && t.line.y0 > state.v1Y)) q.rules.add(state.resetSince != null && state.resetSince > state.v1From ? "R13" : "R11");
          if (E.size) {
            const ref = boxFor(t, C, new Set());
            const moved = [0, 1, 2, 3].map((i) => Math.abs(real.box[i] - ref.box[i]) >= 0.5);
            const edges = ["left", "top", "right", "bottom"];
            moved.forEach((mv, i) => { if (mv) for (const id of real.act[edges[i]]) q.rules.add(id); });
            if (moved[3]) for (const id of real.limitBy) q.rules.add(id);
            // An edge that moved with no rule of its own moved because the frame is not ink.
            const own = [real.act.left.size, real.act.top.size, real.act.right.size, real.act.bottom.size + (moved[3] ? real.limitBy.size : 0)];
            if (on("R44") && P.frame && moved.some((mv, i) => mv && !own[i])) q.rules.add("R44");
          }
          if (colChanged) for (const id of colRules) q.rules.add(id);
          if (real.bindBy && real.bindBy.via) q.rules.add(real.bindBy.via);
          if (real.rightBind && real.rightBind.via) q.rules.add(real.rightBind.via);
          // A label removed by a rule that now lies inside this box moved its edge.
          for (const x of R.removed) if (x.rule && x.t !== t && x.t.line.y0 > t.line.y1 - 1 && x.t.line.y0 < real.box[3] && x.t.x >= real.box[0] - 1 && x.t.x < real.box[2]) q.rules.add(x.rule);
          if (real.split) { q.check = true; (q.why ??= []).push("an image spans this box and the next"); q.tags = [...(q.tags || []), { rule: "R48", tag: "image_split" }]; }
          if (on("R29")) {
            const h = [...heads].reverse().find((h) => h.l.y1 <= r[0].line.y0 + 0.5 && (R.effective(h, r[0]) || headAboveToken(h)));
            if (h) q.section = h.l.text.trim();
          }
          q._t = t; q._real = real; q._col = ci; q._run = r;
          colProps.push(q);
        }
      }
      // R46: neighbours never overlap; split the gap between their ink.
      // Only a question and the next one down in the same label column (labels within 20 pt).
      if (on("R46")) for (const b of colProps) for (const a of colProps) {
        if (a === b || a.box[1] >= b.box[1] || a.box[3] <= b.box[1]) continue;
        if (a.box[2] <= b.box[0] || b.box[2] <= a.box[0]) continue;
        if (Math.abs(a._t.x - b._t.x) > 20 || b._t.line.y0 < a._t.line.y1) continue;
        const ia = a._real.inkBottom, ib = b._real.inkTop;
        if (!Number.isFinite(ib)) continue;
        const a3 = a.box[3], b1 = b.box[1];
        if (ia < ib) { const m = (ia + ib) / 2; if (a.box[3] > m) a.box[3] = Math.max(ia + 0.5, m); if (b.box[1] < m) b.box[1] = Math.min(ib - 0.5, m); }
        else a.box[3] = b.box[1];
        if (a.box[3] !== a3) { a.rules.add("R46"); fired.add("R46"); }
        if (b.box[1] !== b1) { b.rules.add("R46"); fired.add("R46"); }
      }
      // R37: a box holding a dropped list gets "?".
      if (on("R37")) for (const d of R.dropped) {
        const f = d.r[0];
        // v2.1: every dropped label level with a lettered item on its own line is a matching exercise.
        if (d.r.every((u) => u.line.items.some((it) => it !== u.item && /^\(?[A-Za-z][.)](?:\s|$)/.test(it.s)))) continue;
        // v2.2: nor a list set inside a paragraph, prose at the list's own x just above and just below it (a case study's "1. ... 2. ..." aims).
        const prose = (l) => !!l && !l.hasToken && Math.abs(l.items[0].x0 - f.x) < 3 && /[A-Za-z]{3}/.test(l.text) && !R.heads.some((h) => h.l === l);
        if (prose(colLines[f.li - 1]) && prose(colLines[d.r.at(-1).li + 1])) continue;
        const host = colProps.find((q) => q.box[1] <= f.line.y0 && q.box[3] >= f.line.y0 && q.box[0] <= f.x + 1 && q.box[2] > f.x);
        if (host) { host.check = true; (host.why ??= []).push("holds a numbered list that is not proposed"); host.tags = [...(host.tags || []), { rule: "R37", tag: "holds_dropped_list" }]; fired.add("R37"); }
      }
      // R52 / R53: shared boxes.
      for (const h of stemLines) {
        const below = all.filter((u) => u.line.y0 > h.y0).sort((a, b) => a.line.y0 - b.line.y0);
        const first = below.find((u) => u.n === h.from) || below[0];
        const y1 = first ? first.line.y0 - 1 : limit;
        const bx = inkBox(P, cx0, h.y0 - PAD, cx1, y1);
        if (bx) { pageStems.push({ n: h.from, grid: false, box: bx, type: "stem", rules: new Set(["R52"]), forRange: [h.from, h.to], col: ci }); fired.add("R52"); }
      }
      for (const b of blocks) {
        const bx = inkBox(P, cx0, b.y0 - PAD, cx1, b.y1);
        if (bx) { pageStems.push({ n: b.run[0].n, grid: false, box: bx, type: "stem", rules: new Set(["R53"]), forList: b.run.map((u) => u.n), col: ci }); fired.add("R53"); }
      }
      colInfo.push({ ci, cx0, cx1, colLines, kept, props: colProps, heads, effective: R.effective, headEnds, stemLines, blocks, limit, footerFound });
      proposals.push(...colProps);
    }
    // R67: two questions' boxes that overlap by more than 3 pt each way, not grid cells, get "?".
    if (on("R67")) {
      const qs = proposals.filter((q) => q.type === "question" && !q.grid);
      const over = (a, b) => Math.min(a.box[2], b.box[2]) - Math.max(a.box[0], b.box[0]) > 3 && Math.min(a.box[3], b.box[3]) - Math.max(a.box[1], b.box[1]) > 3;
      for (const a of qs) if (qs.some((b) => b !== a && over(a, b))) { a.check = true; (a.why ??= []).push("overlaps another question's box"); a.tags = [...(a.tags || []), { rule: "R67", tag: "overlaps" }]; fired.add("R67"); }
    }
    // R68: a box holding only its number, one line tall and no wider than its label, gets "?".
    if (on("R68")) for (const q of proposals) {
      const t = q._t;
      if (q.type !== "question" || !t || !/^\(?(?:Q|EX)?\s*\d{1,3}\s*[.):]?\)?$/i.test(t.item.s.trim())) continue;
      if (q.box[2] - q.box[0] <= t.item.x1 - t.item.x0 + 2 * PAD + 6 && q.box[3] - q.box[1] <= t.line.y1 - t.line.y0 + 2 * PAD + 2) { q.check = true; (q.why ??= []).push("holds only its number"); q.tags = [...(q.tags || []), { rule: "R68", tag: "only_number" }]; fired.add("R68"); }
    }
    pageCtx = { lines, limit, bodyH, cover, columns };
    // For R15's second signal: this page's section headings, and every line's first words.
    P.headTexts = colInfo.flatMap((c) => c.heads.filter((h) => h.kind !== "size" || /^[A-Za-z]/.test(h.l.text)).map((h) => norm(h.l.text)));
    P.lineFirsts = new Set(lines.flatMap((l) => [norm(l.text), norm(l.items[0].s)]));
    // R53 (Model context): "Model N" / "Read this" headings, until the next one or a new sheet.
    if (on("R53") && !cover) {
      if (lines.some((l) => l.y0 < vp.height * 0.2 && NAME_LINE.test(l.text.trim()))) { state.model = null; P.modelReset = true; }
      for (const c of colInfo) for (const h of c.heads) {
        if (!/^(?:Model\s+\d+|Read (?:this|the passage))\b/i.test(h.l.text.trim())) continue;
        const nextTok = c.kept.flat().filter((u) => u.line.y0 > h.l.y1).sort((a, b) => a.line.y0 - b.line.y0)[0];
        const bx = inkBox(P, c.cx0, h.l.y0 - PAD, c.cx1, nextTok ? nextTok.line.y0 - 1 : c.limit);
        if (!bx) continue;
        const ctx = { n: 0, grid: false, box: bx, type: "context", rules: new Set(["R53"]), for: [], label: h.l.text.trim(), col: c.ci, _page: p, _sections: [] };
        pageStems.push(ctx); fired.add("R53");
        state.model = ctx;
      }
    }
    proposals.push(...pageStems);
  }

  // R1 and R3 decide the kind by the outcome: a page they read is digital only if it yields a question.
  const qn = () => proposals.filter((q) => q.type === "question").length;
  if (overImage && qn() === 0) { kind = "scanned"; proposals.length = 0; colInfo = []; }
  else if (overImage) fired.add("R1");
  if (P.fewChars) { if (qn() > 0) { kind = "digital"; fired.add("R3"); } else { proposals.length = 0; colInfo = []; } }

  // R51: the open question of the previous page (or column) continues here.
  if (on("R51") && !cover && kind !== "scanned" && !inAnswers()) continuation(P, kind, colInfo, pageCtx, proposals);
  else state.open = null;
  if (DEBUG) process.stderr.write(`p${p} open-before=${JSON.stringify(state.open && { page: state.open.page, n: state.open.n })}\n`);
  if (on("R51") && colInfo.length) {
    // The last question here is open if its bottom was set by the page, not a label.
    const lastCol = colInfo.at(-1);
    const qs = lastCol.props.filter((q) => q.type === "question").sort((a, b) => a.box[1] - b.box[1]);
    const last = qs.at(-1);
    if (DEBUG && last) process.stderr.write(`p${p} last n=${last.n} cap=${last._real.capByLimit} bottom=${last.box[3].toFixed(1)} limit=${lastCol.limit.toFixed(1)}\n`);
    // Open: no label below it on this page. Full: its ink reaches the foot too.
    if (last) state.open = last._real.capByLimit ? { page: p, n: last.n, boxes: 1, full: last.box[3] >= lastCol.limit - 25, x: last._t.x } : null;
  }

  // Page kind after the text rules: blank (R5), then render-failed (R6).
  let ink = null;
  const inkStats = () => {
    if (ink) return ink;
    let all = 0, inner = 0, inImg = 0;
    const xa = Math.floor(CW * 0.03), xb = Math.ceil(CW * 0.97), ya = Math.floor(CH * 0.06), yb = Math.ceil(CH * 0.94);
    // The union of placed images, as a mask.
    const mask = new Uint8Array(CW * CH);
    for (const r of rects) {
      const a = Math.max(0, Math.floor(r.x0 * S)), b = Math.min(CW, Math.ceil(r.x1 * S)), c = Math.max(0, Math.floor(r.y0 * S)), d = Math.min(CH, Math.ceil(r.y1 * S));
      for (let y = c; y < d; y++) mask.fill(1, y * CW + a, y * CW + b);
    }
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const o = (y * CW + x) * 4;
      if (img[o] + img[o + 1] + img[o + 2] >= 600) continue;
      all++;
      if (x >= xa && x < xb && y >= ya && y < yb) inner++;
      if (mask[y * CW + x]) inImg++;
    }
    return (ink = { all, inner, inImg });
  };
  if (on("R5") && proposals.length === 0) {
    // R5: no ink inside the margins (0.02% of the page), and no text outside the bands.
    const bodyText = items.some((it) => it.y1 > vp.height * 0.06 && it.y0 < vp.height * 0.94 && it.x1 > vp.width * 0.03 && it.x0 < vp.width * 0.97);
    const st = inkStats();
    if ((!bodyText || chars <= 3) && st.inner < CW * CH * 0.0002) { kind = "blank"; fired.add("R5"); }
  }
  if (on("R6") && kind !== "digital" && coverage === 0 && chars < 20 && inkStats().all === 0 && await paintsImages(page)) { kind = "render-failed"; fired.add("R6"); fired.delete("R5"); }

  // Questions in reading order: columns left to right, then top to bottom.
  const qs = proposals.filter((q) => q.type === "question").sort((a, b) => a._col - b._col || a.box[1] - b.box[1]);
  // v2.1 (R53 ii): each question goes to the last context above it on its page, or
  // else the one carried from before; a run that restarts at 1 ends a context, and
  // so does a section heading after it.
  const pageCtxs = proposals.filter((x) => x.type === "context" && x._page === p).sort((a, b) => a.col - b.col || a.box[1] - b.box[1]);
  for (const q of qs) {
    allQuestions.push({ page: p, q });
    if (!on("R53")) continue;
    const here = pageCtxs.filter((c) => c.col < q._col || (c.col === q._col && c.box[1] <= q.box[1])).at(-1);
    const ctx = here || (P.modelReset ? null : carriedModel);
    if (!ctx || ctx.closed) continue;
    // A question under a heading none of the context's earlier questions sat under ends it too.
    const newSection = !!q.section && ctx.for.length > 0 && !ctx._sections.includes(q.section);
    if ((q.n === 1 && ctx.for.length) || newSection || headingBetween({ page: ctx._page, col: ctx.col, y: ctx.box[3] }, { page: p, col: q._col, y: q.box[1] })) { ctx.closed = true; continue; }
    ctx.for.push({ page: p, n: q.n });
    if (q.section) ctx._sections.push(q.section);
  }
  if (on("R53")) { const last = pageCtxs.at(-1) || (P.modelReset ? null : carriedModel); state.model = last && !last.closed ? last : null; }
  if (qs.length) state.lastQ = { page: p, n: qs.at(-1).n };
  if (on("R24")) for (const q of qs) if (q._t && (q._t.via === "R24" || q._t.via === "R25") && !(state.hangXs ??= []).some((x) => Math.abs(x - q._t.x) < 0.5)) state.hangXs.push(q._t.x);

  if (on("R4") && (kind === "digital" || kind === "none") && proposals.length === 0 && !cover && rects.length) {
    // R4: a page of pasted pictures is a scan for cropping purposes.
    const st = inkStats();
    if (st.all >= CW * CH * 0.0002 && st.inImg >= 0.9 * st.all) { kind = "scanned"; fired.add("R4"); }
  }

  pageAnswers = on("R13") ? state.inAnswers : p >= state.answersFrom;
  if (P.answerKeyPage) pageAnswers = true;
  // v2.1 (R51): a page marked answers proposes no continuation.
  if (on("R51") && pageAnswers) for (let i = proposals.length - 1; i >= 0; i--) if (proposals[i].type === "continuation") { proposals.splice(i, 1); fired.add("R51"); }
  const row = { page: p, kind, chars, coverage: +coverage.toFixed(3), answers: pageAnswers, proposals };
  pageRows.push({ row, P, canvas, context });
  result.push(row);
  if (!NOPNG) { draw(context, proposals); fs.writeFileSync(path.join(outDir, `p${p}.png`), canvas.toBuffer("image/png")); }
  row.rules_fired = fired; row.ai = kind === "scanned" && !pageAnswers; row.cover = cover; row.invisible_items = invisible;
  if (state.prefixX == null || proposals.some((q) => q._t && q._t.prefixed)) {
    const px = proposals.filter((q) => q._t && q._t.prefixed).map((q) => q._t.x);
    if (px.length) state.prefixX = Math.min(state.prefixX ?? Infinity, ...px);
  }
  // Drop the pixel buffer of pages the post-pass will not redraw.
  pageRows.at(-1).canvas = null; pageRows.at(-1).context = null;
  page.cleanup();
}

// R51: continuation boxes. (a) ink above a page's first label, after the
// running header, when it is not a heading, a "questions N-M" header or an
// answers line; (b) a page with no labels; (c) the top of the next column.
// A first line "... continued" with a question word, or repeating the previous
// page's top heading, makes the previous page's last question open whatever its bottom.
function continuation(P, kind, colInfo, pageCtx, proposals) {
  const st = P.state;
  const lines = pageCtx ? pageCtx.lines : [];
  // v2.1: top-band text is furniture only as a page number or a line repeated on
  // half the pages (R43's test); any other first line is the continued text.
  const repeated = (l) => pre.length > 2 && repeatCount(l.text.trim(), l.y0) >= Math.max(2, Math.ceil(0.5 * (pre.length - 1)));
  const furn = (l) => P.isFurniture(l) || (l.y1 <= P.H * 0.06 && (PAGE_NO.test(l.text.trim()) || repeated(l)));
  const first = lines.find((l) => !furn(l));
  const marked = first && (/\bcontinued\b/i.test(first.text) && /\b(?:FRQ|Exercise|Section|Prompt|Question|Sample|Your Response)\b/i.test(first.text));
  if (!st.open && marked && st.lastQ) st.open = { page: st.lastQ.page, n: st.lastQ.n, boxes: 1, full: true };
  const add = (open, bx, col) => {
    if (!open || open.boxes >= 4 || !bx || bx[3] - bx[1] < (P.bodyH || 8)) return false;
    open.boxes++;
    proposals.push({ n: open.n, grid: false, box: bx, type: "continuation", rules: new Set(["R51"]), for: [{ page: open.page, n: open.n }], box_no: open.boxes, check: true, why: ["continues the question above it"], col });
    P.fired.add("R51");
    return true;
  };
  if (kind === "none" || kind === "blank" || !colInfo.length) {
    if (st.open && st.open.full && (kind === "none" || (kind === "digital" && !colInfo.length))) add(st.open, inkBox(P, 0, P.H * 0.06, P.W, P.H * 0.94), 0);
    return;
  }
  colInfo.forEach((c, i) => {
    const open = i === 0 ? st.open : (() => {
      const left = colInfo[0].props.filter((q) => q.type === "question").sort((a, b) => a.box[1] - b.box[1]).at(-1);
      return left && left._real.capByLimit ? { page: P.p, n: left.n, boxes: 1, full: left.box[3] >= colInfo[0].limit - 25, x: left._t.x } : null;
    })();
    if (!open) return;
    const toks = c.kept.flat().sort((a, b) => a.line.y0 - b.line.y0);
    const firstTok = toks[0];
    const own = c.colLines.filter((l) => !furn(l));
    const body = own.filter((l) => !firstTok || l.y1 <= firstTok.line.y0);
    if (!body.length && firstTok) return;
    const b0 = body[0];
    const marginX = own.length ? Math.min(...own.map((l) => l.items[0].x0)) : c.cx0;
    // An unfound label: a line opening at the margin with a bare number, or a number
    // and its stop, then words ("22. Find", "7 Which"), or a bold one with the next
    // number further along the line (a row of graph questions, "18 y 19 y").
    const unfound = (l) => {
      const m = l.items[0].x0 <= marginX + 6 && l.items[0].s.match(/^(\d{1,3})[.)]?(?:\s|$)/);
      if (!m) return false;
      // v2.2: or a number and its stop alone on its line, hanging left of the next line's text ("29." over a figure and its stem).
      const nx = own[own.indexOf(l) + 1];
      if (l.items.length === 1 && /^\d{1,3}[.)]$/.test(l.items[0].s) && nx && nx.items[0].x0 >= l.items[0].x1 + 6) return true;
      if (/[A-Za-z]{3}/.test(l.text.replace(/^\s*\d{1,3}[.)]?/, ""))) return true;
      return !!l.items[0].bold && l.items.slice(1).some((it) => new RegExp(`^${+m[1] + 1}[.)]?$`).test(it.s));
    };
    // A title: a heading of any kind, a short centred line, a source tag ("[M/J 2020 P12]").
    // v2.2: a centred title is centred to 5% of the column (a stem's short last line
    // can sit within 10%), starts where the next line does not (a paragraph's or an
    // option table's lines start together), opens on no part or option letter
    // ("b. Find", "A. D-ribose  C. Phospholipid") and does not end in a part's marks.
    const centredTitle = (l) => {
      const t = l.text.trim(), a = l.items[0].x0, b = l.items.at(-1).x1;
      if (!(t.length <= 60 && /[A-Za-z]{3}/.test(t) && Math.abs((a + b) / 2 - (c.cx0 + c.cx1) / 2) < 0.05 * (c.cx1 - c.cx0) && a > marginX + 2 * (P.bodyH || 10))) return false;
      const nx = own[own.indexOf(l) + 1];
      return !(nx && Math.abs(nx.items[0].x0 - a) < 3) && !SUBPART.test(l.items[0].s) && !BARE_SUB.test(l.items[0].s) && !/^\(?[A-E][.)]$|^\(?[A-E][.)]\s/.test(l.items[0].s) && !ENDS_MARKS.test(t);
    };
    // A caption ("Fig. 1.2: ...", "Extract 2: ...", "Table 1: ...") belongs to the material it heads.
    const caption = (l) => /^(?:fig(?:ure)?|table|extract|source|graph|diagram|chart|photo)\b/i.test(l.text.trim());
    const titleLike = (l) => !marksLine(l.text.trim()) && !caption(l) &&
      (SOURCE_TAG.test(l.text.trim()) || c.heads.some((h) => h.l === l) || centredTitle(l));
    // The question was full to the foot, the block opens on a sub-part ("c) Write ...",
    // or a bare "b", "c i", "ii" at the label column), or the page says it continues.
    // The opener: the first line of words that is not a caption (a figure and its caption may come first).
    const opener = body.find((l) => /[A-Za-z]{3}/.test(l.text) && !caption(l)) || b0;
    const it0 = opener && opener.items[0];
    // v2.2: or the block's first line itself opens a lettered part ("a) y = ln(xy)  b) ...", no word of three letters).
    const part = opener && (SUBPART.test(it0.s) || (BARE_SUB.test(it0.s) && (open.x == null || Math.abs(it0.x0 - open.x) <= 8 || it0.x0 <= marginX + 2)) || (b0 !== opener && SUBPART.test(b0.items[0].s)));
    const dbg = (why) => { if (DEBUG) process.stderr.write(`p${P.p} R51 col${c.ci} open=${open.page}:${open.n} full=${open.full} part=${!!part} b0="${b0 ? b0.text.slice(0, 50) : ""}" -> ${why}\n`); };
    if (!open.full && !part && !marked) return dbg("not full, no part");
    if (b0) {
      // A line overlapping a heading's own line is part of that heading's bar.
      // v2.2: a source tag heading the page belongs to the open question when the
      // question's own text follows it (CIM1 "[M/J 2021/P41]" over the figure and parts);
      // alone, or with a heading or a new label next, it is still no continuation.
      const tagOpens = SOURCE_TAG.test(b0.text.trim()) && !!body[1] && !titleLike(body[1]) && !unfound(body[1]);
      const isHead = ((titleLike(b0) && !tagOpens) || c.heads.some((h) => h.l !== b0 && h.l.y0 < b0.y1 + 0.5 * (P.bodyH || 10) && h.l.y1 > b0.y0 && titleLike(h.l))) && !marked;
      const isStem = c.stemLines.some((h) => h.l === b0) || c.blocks.some((b) => b.lines.includes(b0)) || /\bquestions?\s*\(?\d{1,3}\s*(?:-|–|—|to)\s*\d{1,3}/i.test(b0.text);
      const isAns = ANSWERS.test(b0.text.trim()) || (on("R9") && ANSWERS_V.test(b0.text.trim()));
      // One line just above a label standing alone on its line is that label's own stem.
      const ownStem = body.length === 1 && firstTok && firstTok.line.items.length === 1 && firstTok.line.y0 - b0.y1 < (P.bodyH || 10) && b0.items[0].x0 > firstTok.x;
      // v2.2: a lone Title Case line straight above the first label ("Higher Order Derivatives",
      // underlined) titles that label's section; a question's last line has a part letter, marks or a stop.
      const words = b0.text.trim().split(/\s+/).filter((w) => /^[A-Za-z]{3,}/.test(w));
      const lonelyTitle = body.length === 1 && firstTok && firstTok.line.y0 - b0.y1 < 2 * (P.bodyH || 10) && b0.text.trim().length <= 50 && words.length >= 2 && words.every((w) => /^[A-Z]/.test(w)) && !/[.?:;,]$/.test(b0.text.trim()) && !ENDS_MARKS.test(b0.text.trim()) && !SUBPART.test(b0.items[0].s);
      if (isHead || isStem || isAns || ownStem || lonelyTitle || unfound(b0)) return dbg(`lonely=${lonelyTitle} ` + `blocked head=${isHead}(tag=${SOURCE_TAG.test(b0.text.trim())},heads=${c.heads.some((h) => h.l === b0)},centred=${centredTitle(b0)}) stem=${isStem} ans=${isAns} ownStem=${ownStem} unfound=${unfound(b0)}`);
    }
    // It starts at the first ink under the running header, so a figure or table
    // above the first text line is in it; never inside a text line, never on the header's rule.
    const hdr = c.colLines.filter((l) => furn(l) && (!b0 || l.y1 <= b0.y0));
    let y0 = b0 ? b0.y0 - PAD : P.H * 0.06;
    y0 = Math.min(y0, hdr.length ? Math.max(...hdr.map((l) => l.y1 + 0.3 * (l.y1 - l.y0))) + 1 : P.H * 0.06);
    let y1 = firstTok ? firstTok.line.y0 - PAD : c.limit;
    // It ends at a heading that ends something (not a marks-only line), a source
    // tag, an unfound label, a "questions N-M" header or an instruction block.
    for (const l of own) if (l !== b0 && l.y0 > y0 + PAD && l.y0 < y1) {
      // v2.2: "(Continued in next page…)" says the question goes on; it ends nothing.
      if (/\bcontinued\b/i.test(l.text)) continue;
      const h = c.heads.find((g) => g.l === l);
      const ends = h ? !marksLine(l.text.trim()) && (strongHead(h) || (firstTok && c.effective(h, firstTok)) || c.headEnds(h)) : SOURCE_TAG.test(l.text.trim()) || unfound(l);
      // v2.2: a source tag closes the question: it ends the box below itself.
      if (ends && !h && SOURCE_TAG.test(l.text.trim())) { y1 = Math.min(y1, l.y1 + 0.3 * (l.y1 - l.y0) + 1); break; }
      if (ends) { y1 = l.y0 - 1; break; }
    }
    for (const h of c.stemLines) if (h.y0 > y0 + PAD && h.y0 < y1) y1 = h.y0 - 1;
    for (const b of c.blocks) if (b.y0 > y0 + PAD && b.y0 < y1) y1 = b.y0 - 1;
    let bx = inkBox(P, c.cx0, y0, c.cx1, y1);
    if (bx) {
      // A rule at the top (the header's underline) with blank below it is not the question's.
      const top = skipTopRule(P, c.cx0, bx[1] + PAD, c.cx1, y1);
      if (top > bx[1] + PAD + 0.5) bx = inkBox(P, c.cx0, top, c.cx1, y1);
    }
    if (bx) {
      // Never inside a text line: a furniture line's foot, else the line's top.
      for (const l of c.colLines) if (bx[1] > l.y0 + 0.5 && bx[1] < l.y1 - 0.5) { bx = furn(l) ? inkBox(P, c.cx0, l.y1 + 0.3 * (l.y1 - l.y0) + 1, c.cx1, y1) : [bx[0], Math.max(0, l.y0 - PAD), bx[2], bx[3]]; break; }
    }
    dbg(`add ${bx && bx.map((v) => v.toFixed(0))}`);
    add(open, bx, c.ci);
  });
}

// v2.1 (R51): below a thin rule (2 pt or less, half the column wide or more) at the
// top of a region with 2 pt or more of blank under it, the region's real top.
function skipTopRule(P, x0, y0, x1, y1) {
  const X0 = Math.max(0, Math.floor(x0 * S)), X1 = Math.min(P.cw - 1, Math.ceil(x1 * S) - 1);
  const rowInk = (y) => { let n = 0, run = 0, best = 0; for (let x = X0; x <= X1; x++) { if (P.dark(x, y)) { n++; run++; best = Math.max(best, run); } else run = 0; } return { n, best }; };
  let y = Math.floor(y0 * S); const Y1 = Math.floor(y1 * S);
  while (y < Y1 && rowInk(y).n === 0) y++;
  let r = y; while (r < Y1 && rowInk(r).best >= 0.5 * (X1 - X0)) r++;
  if (r === y || r - y > 2 * S) return y0;
  let b = r; while (b < Y1 && rowInk(b).n === 0) b++;
  return b - r >= 2 * S ? b / S : y0;
}

function draw(context, proposals) {
  context.lineWidth = 3;
  const colour = { question: "rgba(239,90,43,0.9)", grid: "rgba(20,150,60,0.9)", continuation: "rgba(40,110,220,0.9)", stem: "rgba(150,60,190,0.9)", context: "rgba(150,60,190,0.9)" };
  for (const q of proposals) {
    context.strokeStyle = q.type === "question" && q.grid ? colour.grid : colour[q.type || "question"];
    context.strokeRect(q.box[0] * S, q.box[1] * S, (q.box[2] - q.box[0]) * S, (q.box[3] - q.box[1]) * S);
    context.fillStyle = "rgba(45,48,146,0.95)";
    context.font = "bold 22px sans-serif";
    const tag = q.type === "continuation" ? `${q.n}+` : q.type === "stem" || q.type === "context" ? "S" : `${q.n}`;
    context.fillText(q.check ? tag + "?" : tag, q.box[2] * S - 40, q.box[1] * S + 22);
  }
}

// ----------------------------------------------------------- post-pass ---
// R15's guard on both signals: an answer key's entries are short. The pages from
// `from` on carry at most half the characters per question of the pages before.
function shortEntries(from) {
  const dens = (rows) => { let c = 0, q = 0; for (const r of rows) { const n = r.proposals.filter((x) => x.type === "question").length; if (n) { c += r.chars; q += n; } } return q ? c / q : null; };
  const head = dens(result.filter((r) => r.page < from)), tail = dens(result.filter((r) => r.page >= from));
  return head != null && tail != null && tail <= 0.5 * head;
}
// R15: an unheaded answer key. The file's questions, read in order, form
// sections of consecutive numbers; when the second half's section lengths repeat
// the first half's exactly (two sections or more, ten labels or more) on at most
// 0.6 of its pages, the second half is the answers.
if (on("R15") && allQuestions.length >= 20) {
  const secs = [];
  for (const { page, q } of allQuestions) {
    const s = secs.at(-1);
    if (s && q.n === s.last + 1) { s.last = q.n; s.len++; s.pages.add(page); s.items.push({ page, q }); }
    else secs.push({ first: q.n, last: q.n, len: 1, page, pages: new Set([page]), items: [{ page, q }] });
  }
  const k = secs.length / 2;
  if (Number.isInteger(k) && k >= 2) {
    const head = secs.slice(0, k), tail = secs.slice(k);
    const same = head.every((s, i) => s.len === tail[i].len && s.first === tail[i].first);
    const span = (ss) => Math.max(...ss.map((s) => Math.max(...s.pages))) - Math.min(...ss.map((s) => s.page)) + 1;
    if (same && head.reduce((n, s) => n + s.len, 0) >= 10 && span(tail) <= 0.6 * span(head) && tail[0].page > Math.max(...head.at(-1).pages) - 1 && shortEntries(tail[0].page)) {
      const from = tail[0].page;
      for (const s of tail) for (const { page, q } of s.items) {
        const row = result.find((x) => x.page === page);
        row.proposals = row.proposals.filter((x) => x !== q); q._gone = true;
        row.rules_fired.add("R15"); redraw.add(page);
      }
      for (const row of result) if (row.page >= from) {
        row.answers = true; row.ai = false;
        // v2.1: nothing else is proposed on an answers page either.
        const keep = row.proposals.filter((x) => x.type === "question");
        if (keep.length !== row.proposals.length) { for (const x of row.proposals) if (x.type !== "question") x._gone = true; row.proposals = keep; row.rules_fired.add("R15"); redraw.add(row.page); }
      }
    }
  }
}
// R15, second signal: two section headings of the question pages ("Classwork",
// then "Homework"), each printed on exactly one page before, come back once in
// the same order, and from there to the end is at most 0.4 of the pages they
// first spanned: an answer table under the same titles. A heading every chapter
// repeats ("Exercise 1") is on many pages and never counts.
if (on("R15") && !result.some((r) => r.rules_fired.has("R15"))) {
  const firsts = [];
  for (const { row, P } of pageRows) for (const t of P.headTexts || []) if (t.length >= 4 && !firsts.some((f) => f.t === t)) firsts.push({ t, page: row.page });
  if (DEBUG) process.stderr.write(`R15 headings: ${JSON.stringify(firsts)}\n` + pageRows.filter(({ row }) => row.page >= 24).map(({ row, P }) => `p${row.page} ${[...(P.lineFirsts || [])].slice(0, 12).join(" | ")}`).join("\n") + "\n");
  let from = Infinity;
  const pagesWith = (t) => pageRows.filter(({ P }) => P.lineFirsts && P.lineFirsts.has(t)).length;
  for (let i = 0; i < firsts.length; i++) for (let j = i + 1; j < firsts.length; j++) {
    const a = firsts[i], b = firsts[j];
    if (b.page <= a.page || pagesWith(a.t) !== 2 || pagesWith(b.t) !== 2) continue;
    const qa = pageRows.find(({ row, P }) => row.page > b.page && P.lineFirsts && P.lineFirsts.has(a.t));
    if (!qa) continue;
    const qb = pageRows.find(({ row, P }) => row.page >= qa.row.page && P.lineFirsts && P.lineFirsts.has(b.t));
    if (!qb) continue;
    const last = result.at(-1).page;
    if (last - qa.row.page + 1 <= 0.4 * (qa.row.page - a.page) && shortEntries(qa.row.page)) from = Math.min(from, qa.row.page);
  }
  if (Number.isFinite(from)) {
    for (const row of result) if (row.page >= from) {
      for (const q of row.proposals) q._gone = true;
      if (row.proposals.length) { row.rules_fired.add("R15"); redraw.add(row.page); }
      row.proposals = []; row.answers = true; row.ai = false;
    }
  }
}
// R52: a stem's questions, wherever they fall after it, up to the next section
// heading after its box (v2.1: a "questions N-M" stem's; since, every stem's).
for (const row of result) for (const q of row.proposals) {
  if (q.forRange || q.forList) {
    const want = new Set(q.forList || Array.from({ length: q.forRange[1] - q.forRange[0] + 1 }, (_, i) => q.forRange[0] + i));
    q.for = [];
    const from = { page: row.page, col: q.col, y: q.box[3] };
    for (const { page, q: x } of allQuestions) {
      if (x._gone || page < row.page || (page === row.page && x.box[1] < q.box[1] && x._col === q.col)) continue;
      if (headingBetween(from, { page, col: x._col, y: x.box[1] })) break;
      if (want.has(x.n)) { q.for.push({ page, n: x.n }); want.delete(x.n); }
    }
  }
}
// Redraw a page whose proposals the post-pass changed.
for (const p of NOPNG ? [] : redraw) {
  const page = await doc.getPage(p);
  const rvp = page.getViewport({ scale: S });
  const { canvas, context } = doc.canvasFactory.create(Math.ceil(rvp.width), Math.ceil(rvp.height));
  await page.render({ canvas, viewport: rvp }).promise;
  draw(context, result.find((x) => x.page === p).proposals);
  fs.writeFileSync(path.join(outDir, `p${p}.png`), canvas.toBuffer("image/png"));
  page.cleanup();
}

// Output: v1's row, then the added fields; private fields dropped.
const out = result.map((row) => {
  const P0 = pageRows.find((x) => x.row === row).P;
  const r = { page: row.page, kind: row.kind, chars: row.chars, coverage: row.coverage, answers: row.answers };
  r.proposals = row.proposals.map((q) => {
    const o = emit(P0, { n: q.n, grid: q.grid, box: q.box.slice() });
    o.type = q.type; o.rules = [...q.rules].sort((a, b) => +a.slice(1) - +b.slice(1));
    for (const k of ["for", "box_no", "check", "why", "tags", "section", "label"]) if (q[k] !== undefined) o[k] = q[k];
    return o;
  });
  // A rule that made or moved a proposal had an effect on its page.
  for (const q of row.proposals) for (const id of q.rules) row.rules_fired.add(id);
  for (const q of row.proposals) for (const t of q.tags || []) row.rules_fired.add(t.rule);
  r.rules_fired = [...row.rules_fired].sort((a, b) => +a.slice(1) - +b.slice(1));
  r.ai = row.ai; r.cover = row.cover; r.invisible_items = row.invisible_items;
  return r;
});
console.log(JSON.stringify(out));
