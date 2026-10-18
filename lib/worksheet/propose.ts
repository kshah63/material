// Text-layer suggestions (docs/WORKSHEETS.md §5.1), as pure functions: finder
// v2.2, the rules measured on the centre's 219 banks, ported from the lab finder
// one function per rule. A rule's functions carry its id at the front of their
// names (r24HangingLabel is R24), so `r24` finds all of it. The rules not here:
// R28 and R54-R57 are off in v2.2 and left out, R58-R66 were never built, and
// R53's prose-page form (iii) was turned off in v2.1. R67-R69, and stems and
// contexts that end at a section heading, were added after review, in both.
//
// Nothing here touches pdf.js or the DOM. The caller (lib/worksheet/source.ts
// suggestFile) reads the file twice, page by page, in order:
// - preRead each page's text, for lines a file repeats (startFile);
// - then for each page, a PageInput: its text content, viewport, ink at
//   INK_SCALE, image placements and font weights; and, on the pages
//   needsOperators names, readOperators of its operator list (render modes,
//   image sizes); proposePage advances the file past the page.
// finishFile then works out what needs the whole file (R15, R52's questions)
// and gives every page's suggestions. A page's suggestions depend on the pages
// before it (the answers heading, a question left open, the hanging-label
// column) and after it (an answer key under no heading, a stem's questions), so
// they are only final for the whole file. docs/worksheets/textlayer/compare.mjs
// runs this and the lab finder on the same banks and compares them.
import type { PdfBox, ViewRect } from "./source";

/** The page is drawn for the ink tests at 2 canvas pixels per point: 144 dpi. */
export const INK_SCALE = 2;
const S = INK_SCALE;
const PAD = 4; // points round every box

export type PageKind = "digital" | "scanned" | "none" | "blank" | "render-failed";

/**
 * A box suggested: a question's first box; a continuation of a question onto the
 * next page or column (R51); a stem printed once for several questions (R52,
 * R53); or a context, a "Model 3" passage for the questions after it (R53).
 */
export type SuggestionType = "question" | "continuation" | "stem" | "context";

/** A question, by the page its first box is on and its printed number. */
export interface QuestionRef {
  page: number;
  n: number;
}

export interface Suggestion {
  type: SuggestionType;
  /** A question's printed number; the number a continuation continues, or a stem's first; 0 for a context. */
  n: number;
  /** A cell of a problem set printed as a table. */
  grid: boolean;
  /** On the displayed page, in points, y down. */
  view: ViewRect;
  /** In PDF user space, y up, as save_crops stores a box. */
  box: PdfBox;
  /** The questions a continuation, stem or context belongs to. */
  for?: QuestionRef[];
  /** A continuation's place in its question: box 2, 3 or 4. */
  boxNo?: number;
  /** The "?": why the box needs a look before it is accepted. */
  check?: string[];
  /** The section heading a question sits under (R29). */
  section?: string;
  /** A context's heading ("Model 3"). */
  label?: string;
}

export interface PageSuggestions {
  kind: PageKind;
  /** The page is answers: after an answers heading, or an answer list. */
  answers: boolean;
  /** Visible characters (R2). */
  chars: number;
  /** The share of the page its largest image covers. */
  coverage: number;
  proposals: Suggestion[];
}

export interface FileSuggestions {
  /** Page 1 first. */
  pages: PageSuggestions[];
  /** The whole file is an answer key: every page is answers, and nothing is proposed. */
  answerKey: boolean;
}

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

/** What proposePage reads of a page. */
export interface PageInput {
  /** From 1. */
  page: number;
  vp: Viewport;
  /** pdf.js getTextContent().items. */
  content: ReadonlyArray<object>;
  /** Whether each font of the text content is bold (isBoldFont), by its fontName. */
  bold: ReadonlyMap<string, boolean>;
  ink: Ink;
  /** pdf.js page.imageCoordinates after the INK_SCALE render with recordImages. */
  images: ArrayLike<number> | null | undefined;
}

/** pdf.js OPS, the operator codes readOperators looks for. */
export interface OpCodes {
  save: number;
  restore: number;
  setFont: number;
  setTextRenderingMode: number;
  showText: number;
  showSpacedText: number;
  nextLineShowText: number;
  nextLineSetSpacingShowText: number;
  paintImageXObject: number;
  paintImageXObjectRepeat: number;
  paintInlineImageXObject: number;
  paintInlineImageXObjectGroup: number;
  paintImageMaskXObject: number;
  paintImageMaskXObjectGroup: number;
  paintImageMaskXObjectRepeat: number;
}

/** What a page's operator list says that its text content and render do not. */
export interface OperatorFacts {
  /** Each image painted, in paint order: its size in source pixels, and the visible glyphs painted before it. */
  images: { w: number; h: number; glyphsBefore: number }[];
  /** Glyphs painted visibly: not in render mode 3 (invisible) or 7 (clip only). */
  glyphs: number;
  /** Fonts the page paints text in only invisibly: an OCR layer. */
  invisibleFonts: Set<string> | null;
  /** Whether it paints an image of any kind, masks included. */
  paintsImages: boolean;
}

// --- patterns -------------------------------------------------------------------

// v1's labels. A label is a line's first token. A bare number needs a prefix
// ("Q2", "EX 1"); unprefixed it must be followed by . ) or :, or every table of
// data with consecutive values down its first column is a run of questions.
const FIRST = /^(?:(?:Q(?:uestion)?|EX|Example)\s*(\d{1,3})(?:\s*[.):](?!\d)|$)|(\d{1,3})[.):](?!\d))/i;
const FIRST_MERGED = /^(?:(?:Q(?:uestion)?|EX|Example)\s*)?(\d{1,3})[.):]\s+\S/i;
// Later in a line, only as the next cell of a grid row: "2." or "2. y = ...".
const INLINE = /^(\d{1,3})[.)](?:\s+\S.*)?$/;
// v1's answers heading: "Answers", "Answer Key", or a title ending "(Answers)".
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
// R9: the answers words.
const KW = "answers?|answer key|mark(?:ing)?[\\s-]*schemes?|solutions?";
const MSW = "mark(?:ing)?[\\s-]*schemes?";
const ANSWERS_V = new RegExp(
  `^(?:${KW})\\s*:?\\s*(?:\\([^()]*\\))?\\s*$|\\((?:${KW})\\)\\s*$|^[^:]{0,60}(?::|\\s[-–—])\\s*(?:${MSW})\\s*$|^${MSW}\\b|^marking\\s+guide\\b`,
  "i",
);
const ANSWERS_PREFIXED = new RegExp(`^(?:suggested|model|sample)\\s+(?:${KW})\\s*:?$`, "i"); // needs size or page-top
// R10: a separator, then an answers word, at the end of a title: after a spaced
// dash (U+2212 included) with any title before it, or after a colon with no
// other colon before it (so "Expressions: Answers: Expressions: Answers:" is not one).
const DKW = "(?:answers?(?:\\s*(?:&|and)\\s*explanations?)?|answer key|(?:worked\\s+)?solutions?)\\s*:?$";
const ANSWERS_DASH = new RegExp(`^.{0,110}\\s[-–—−]\\s*${DKW}|^[^:]{0,75}:\\s*${DKW}`, "i");
const NAME_LINE = /^(?:student\s+)?name\s*:/i;
// R29: section-heading words. Only as a whole label-free line of 60 characters or fewer.
const SECTION =
  /^(?:exercises?\s*\d*[a-z]?(?:\s*[:.]|\s*$|\s+[-–—]\s)|part\s+(?:[A-Z]|\d+|[IVX]+)\b|section\s+(?:[A-Z]|\d+|[IVX]+)\b|topic\s+\d+|unit\s+\d+|lesson\s+\d+|chapter\s+\d+|class\s*work\b|home\s*work\b|exam\s*st\w*\s+questions|mixed\s+questions|problem\s+set\b|structured\s+questions?|essay\s+questions?|mcqs?\b|multiple[\s-]choice\b|free[\s-]response\b|ap\s+(?:mcq|frq)s?\b|(?:short\s+|long\s+)?frqs?\b|extension\s+questions)/i;
const ROMAN = /^[IVXL]+[.)]\s+\S/;
const SUBPART = /^\(?(?:[a-z]|i{1,3}|iv|vi{0,3}|ix)\)|^[a-h][.)]\s/;
// R52: a line naming the questions a stimulus serves.
const STEM_RANGE = [
  /^(?:please\s+)?(?:use|refer to|study|look at|consider)\b.*\b(?:figure|table|graph|diagram|matrix|scenario|extract|data|information|case|following)\b.*?\bquestions?\s*\(?(\d{1,3})(?:\s*(?:-|–|—|to|and)\s*(?:questions?\s*)?(\d{1,3}))?\)?/i,
  /^the following\b.*?\bquestions?\s+(\d{1,3})\s*(?:-|–|—|to|and)\s*(\d{1,3})/i,
  /^\(?(?:for\s+)?(?:questions?|exercises?)\s+(\d{1,3})\s*(?:-|–|—|to|and)\s*(\d{1,3})\b/i,
  /^use the following (?:\w+\s+)?for\s+(?:questions?\s+)?(\d{1,3})\s*(?:-|–|—|to)\s*(\d{1,3})/i,
  // "... to answer the questions 4 – 6", "For questions (208-217)", anywhere in the line.
  /\b(?:to answer|for)\s+(?:the\s+)?questions?\s*\(?(\d{1,3})\s*(?:-|–|—|to)\s*(\d{1,3})\)?/i,
];
// R51: what a continuation's first or last line may be.
const PAGE_NO = /^(?:page\s*)?\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?$|^\d{1,3}\s*\|\s*page$|^page\s*\|\s*\d{1,3}$/i;
const MARKS_ONLY = /^[([]\s*\d{1,2}\s*(?:marks?)?\s*[)\]]$|^\d{1,2}\s*marks?$/i;
const SOURCE_TAG = /^\[[^\]]{2,40}\]$/;
// A question's closing marks line, "(Total 6 marks)" as well as "(3)" or "[2]".
const TOTAL_MARKS = /^\(\s*total\s*:?\s*\d{1,3}\s*marks?\s*\)$/i;
const marksLine = (t: string) => MARKS_ONLY.test(t) || TOTAL_MARKS.test(t);
// A line ending in a part's marks ("[3]", "(Total 6 marks)") closes a part; no title does.
const ENDS_MARKS = /(?:\[\s*\d{1,2}\s*(?:marks?)?\s*\]|\(\s*total\s*:?\s*\d{1,3}\s*marks?\s*\))$/i;
const BARE_SUB = /^\(?(?:[a-h]|i{1,3}|iv|vi{0,3}|ix|x)\)?(?:\s+\(?(?:i{1,3}|iv|vi{0,3}|ix|x)\)?)?$/;

/** The "?" every continuation carries (R51): it is accepted onto its question, which the screen checks. */
export const CONTINUES = "continues the question above it";
const IMAGE_SPLIT = "an image spans this box and the next";
const HOLDS_LIST = "holds a numbered list that is not proposed";
const OVERLAPS = "overlaps another question's box";
const ONLY_NUMBER = "holds only its number";

// --- what the page is made of -------------------------------------------------

/** A text item on the displayed page: its text and its bounds, in points, y down. */
interface Item {
  s: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Its place in the text content, which is paint order (R17). */
  idx: number;
  font: string;
  /** Drawn up or down the page, as a table's side label is (R29). */
  rot: boolean;
  bold: boolean;
}

interface Line {
  y0: number;
  y1: number;
  items: Item[];
  text: string;
  /** A label starts on it (set by runsOf). */
  hasToken: boolean;
  /** Its ink per unit of its boxes, once worked out (inkBold). */
  dens?: number;
}

/** A placed image, on the displayed page. */
interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Under 2 source pixels or 5 pt drawn: a speck, not an image (R48). */
  tiny: boolean;
}

type Dark = (x: number, y: number) => boolean;

/** R44's mask: page frames and page-long rules, by pixel column and row. */
interface Frame {
  col: Uint8Array;
  row: Uint8Array;
  spans: { x0: number; x1: number; top: number; bot: number }[];
}

/** One page while proposePage reads it. */
interface Page {
  p: number;
  vp: Viewport;
  W: number;
  H: number;
  /** The ink's size in pixels. */
  cw: number;
  ch: number;
  /** Dark ink, and dark ink outside R44's frames. */
  dark0: Dark;
  dark: Dark;
  rects: Rect[];
  file: FileState;
  /** Characters in bold fonts over all characters. */
  boldShare: number;
  /** The leftmost text above the footer band. */
  minX: number;
  /** R3: under 20 characters, read as text all the same. */
  fewChars: boolean;
  bodyH: number;
  /** The page's lines, for the median density of inkBold. */
  allLines: Line[];
  medDensity: number | null;
  frame: Frame | null;
  /** R27, R29: fonts painted only invisibly. */
  ocrFonts: Set<string> | null;
  /** R14 found an answer list on the page. */
  answerKeyPage: boolean;
  /** R53: a new sheet starts on the page. */
  modelReset: boolean;
}

/** A question number found on a line, and how. */
interface Token {
  n: number;
  x: number;
  /** Its line's index in the lines it was found in. */
  li: number;
  line: Line;
  /** The line's first token. */
  first: boolean;
  item: Item;
  k: number;
  /** The rule whose form found it, if not v1's: "R24" and "R25" are read again (R24's band, the file's hanging column). */
  via: string | null;
  /** R21, R26: only as a run's next number. */
  needsRun: boolean;
  /** R25: a number alone on its line. */
  hangAlone: boolean;
  /** R26: the gap it needs above it. */
  gapNeed: number;
  /** R24, R25: where its stem's text starts. */
  stemX: number | null;
  /** R24: a hanging label in the top band, kept only in the file's hanging column. */
  band: boolean;
  /** "Question 3", "Q3" (R35). */
  prefixed: boolean;
  /** "FRQ 2" (R34). */
  frq: boolean;
  /** Set 1.25x body size (R27). */
  big: boolean;
  /** R50: the marks line just above it, which is its first line. */
  markLine: Line | null;
  /** R32 started its run: a column-major cell. */
  startBy32: boolean;
}

type HeadKind = "size" | "words" | "bold" | "caps";

/** A heading line (R29), or a chapter title taken out as a label (R27). */
interface Head {
  l: Line;
  li: number;
  kind: HeadKind;
  title27: boolean;
  /** An upper-Roman line ("II. Substitution"). */
  roman: boolean;
  /** headEnds, once worked out. */
  ends?: boolean;
}

interface Runs {
  kept: Token[][];
  /** Runs dropped as lists inside a question (v1, R14, R33-R35). */
  dropped: Token[][];
  heads: Head[];
  toks: Token[];
  /** Whether a bold or all-caps heading counts, above that label. */
  effective: (h: Head, above: Token | undefined) => boolean;
}

/** R52: a "questions N-M" line. */
interface StemLine {
  l: Line;
  y0: number;
  x0: number;
  x1: number;
  from: number;
  to: number;
}

/** R53 (i): an instruction block above a run's first label. */
interface Block {
  run: Token[];
  y0: number;
  x0: number;
  x1: number;
  y1: number;
  lines: Line[];
}

/** A column of the page while its boxes are drawn. */
interface Column {
  P: Page;
  ci: number;
  cx0: number;
  cx1: number;
  colLines: Line[];
  bodyH: number;
  limit: number;
  footerFound: boolean;
  /** Every label kept in the column. */
  all: Token[];
  kept: Token[][];
  heads: Head[];
  effective: Runs["effective"];
  stemLines: StemLine[];
  blocks: Block[];
  props: Prop[];
}

interface BoxResult {
  /** [left, top, right, bottom] on the displayed page. */
  box: number[];
  /** Its bottom is the questions' limit: no label below it ended it (R51). */
  capByLimit: boolean;
  inkTop: number;
  inkBottom: number;
  /** An image runs on into the next question (R48). */
  split: boolean;
}

/** A suggestion while the file is read. */
interface Prop {
  type: SuggestionType;
  n: number;
  grid: boolean;
  /** [left, top, right, bottom] on the displayed page. */
  box: number[];
  col: number;
  for?: QuestionRef[];
  boxNo?: number;
  why?: string[];
  section?: string;
  label?: string;
  // A question's label, box and run.
  t?: Token;
  real?: BoxResult;
  run?: Token[];
  // A stem's questions, resolved by finishFile (R52).
  forRange?: [number, number];
  forList?: number[];
  // A context's page, whether a run restarting at 1 or a heading has closed it, and its questions' headings (R53).
  page?: number;
  closed?: boolean;
  sections?: string[];
  /** Taken out by R15. */
  gone?: boolean;
}

/** R51: the question left open at the foot of a page or column. */
interface Open {
  page: number;
  n: number;
  boxes: number;
  /** Its ink reached the foot. */
  full: boolean;
  x?: number;
}

interface Row {
  page: number;
  vp: Viewport;
  kind: PageKind;
  chars: number;
  coverage: number;
  answers: boolean;
  proposals: Prop[];
  /** R15's second signal: the page's section headings, and every line's first words. */
  headTexts: string[] | null;
  lineFirsts: Set<string> | null;
}

/** A page's line, as the pre-pass keeps it. */
export interface PreLine {
  text: string;
  y0: number;
}

/**
 * The file as read so far: what each page hands the next, and what finishFile
 * needs of every page. startFile makes it; proposePage advances it.
 */
export interface FileState {
  /** Every page's lines, from the pre-pass (R43, R51 and furniture: lines a file repeats). */
  pre: PreLine[][];
  /** The first page of the answers (R9-R12), Infinity until one is found. */
  answersFrom: number;
  /** In the answers now: a new sheet can end them (R13). */
  inAnswers: boolean;
  /** The question left open at the foot of the last page read (R51). */
  open: Open | null;
  /** The last question read (R51). */
  lastQ: QuestionRef | null;
  /** The x of the file's "Question N" labels (R35). */
  prefixX: number | null;
  /** The "Model N" context open now (R53). */
  model: Prop | null;
  /** The x of every hanging label kept so far (R24). */
  hangXs: number[];
  rows: Row[];
  /** Every question, in reading order. */
  questions: { page: number; q: Prop }[];
  /** R52: section headings in reading order. */
  sectionMarks: { page: number; col: number; y: number }[];
}

const last = <T>(a: T[]): T => a[a.length - 1];
type At = { page: number; col: number; y: number };
const before = (a: At, b: At) =>
  a.page < b.page || (a.page === b.page && (a.col < b.col || (a.col === b.col && a.y < b.y)));
/** A section heading between two places in reading order (R29), which ends a stem's or context's questions (R52, R53). */
const headingBetween = (file: FileState, a: At, b: At) => file.sectionMarks.some((m) => before(a, m) && before(m, b));
const median = (a: number[]) => a[Math.floor(a.length / 2)];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const maxHeight = (l: Line) => Math.max(...l.items.map((i) => i.y1 - i.y0));

// --- the operator list and fonts ------------------------------------------------

/**
 * A page's operator list (pdf.js page.getOperatorList()), read for what its text
 * content and render do not say: which text is painted invisibly (render modes,
 * with save and restore), how many glyphs are painted after each image (R1), each
 * image's source size (R48), and whether any image is painted at all (R6).
 */
export function readOperators(
  list: { fnArray: ArrayLike<number>; argsArray: ReadonlyArray<unknown> },
  OPS: OpCodes,
): OperatorFacts {
  const images: OperatorFacts["images"] = [];
  const any = new Set([
    OPS.paintImageXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintInlineImageXObject,
    OPS.paintInlineImageXObjectGroup,
    OPS.paintImageMaskXObject,
    OPS.paintImageMaskXObjectGroup,
    OPS.paintImageMaskXObjectRepeat,
  ]);
  const shows = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText]);
  let mode = 0;
  let font: string | null = null;
  let glyphs = 0;
  let paintsImages = false;
  const stack: [number, string | null][] = [];
  const visible = new Set<string | null>();
  const invisible = new Set<string | null>();
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const a = list.argsArray[i] as unknown[];
    if (any.has(fn)) paintsImages = true;
    if (fn === OPS.save) stack.push([mode, font]);
    else if (fn === OPS.restore) [mode, font] = stack.pop() ?? [0, null];
    else if (fn === OPS.setTextRenderingMode) mode = a[0] as number;
    else if (fn === OPS.setFont) font = a[0] as string;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
      images.push({ w: a[1] as number, h: a[2] as number, glyphsBefore: glyphs });
    } else if (fn === OPS.paintInlineImageXObject) {
      const im = a[0] as { width: number; height: number };
      images.push({ w: im.width, h: im.height, glyphsBefore: glyphs });
    } else if (shows.has(fn)) {
      (mode === 3 || mode === 7 ? invisible : visible).add(font);
      if (mode === 3 || mode === 7) continue;
      const g = (fn === OPS.nextLineSetSpacingShowText ? a[2] : a[0]) as unknown[] | null;
      for (const x of g || []) {
        const u = x && typeof x === "object" ? (x as { unicode?: unknown }).unicode : null;
        if (typeof u === "string" && u.trim()) glyphs++;
      }
    }
  }
  const only = new Set<string>();
  for (const f of invisible) if (f != null && !visible.has(f)) only.add(f);
  return { images, glyphs, invisibleFonts: only.size ? only : null, paintsImages };
}

/**
 * Whether a pdf.js font (page.commonObjs) is bold: its flag, or its name
 * ("TimesNewRomanPS-BoldMT"). The name is there only when the bank was opened
 * with fontExtraProperties.
 */
export function isBoldFont(f: { bold?: unknown; name?: unknown } | null | undefined): boolean {
  return !!f && (!!f.bold || /bold|black|heavy|semibold|demi/i.test(String(f.name || "")));
}

// --- text and lines -------------------------------------------------------------

/**
 * Every text item with text, mapped onto the displayed page through the
 * viewport, which handles /Rotate and CropBox offsets. An item's box runs along
 * its baseline for its width and up 0.8 of its font size.
 */
function itemsOf(content: ReadonlyArray<object>, vp: Viewport, bold?: ReadonlyMap<string, boolean>): Item[] {
  const items: Item[] = [];
  content.forEach((raw, idx) => {
    if (!("str" in raw)) return;
    const it = raw as { str: string; transform: number[]; width: number; fontName: string };
    if (!it.str.trim()) return;
    const [a, b, c, d, e, f] = it.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const n1 = Math.hypot(a, b) || 1;
    const n2 = Math.hypot(c, d) || 1;
    const ux = a / n1;
    const uy = b / n1;
    const vx = c / n2;
    const vy = d / n2;
    const pts = [
      [e, f],
      [e + ux * it.width, f + uy * it.width],
      [e + vx * size * 0.8, f + vy * size * 0.8],
      [e + ux * it.width + vx * size * 0.8, f + uy * it.width + vy * size * 0.8],
    ].map(([x, y]) => vp.convertToViewportPoint(x, y));
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    items.push({
      s: it.str.trim(),
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
      idx,
      font: it.fontName,
      rot: Math.abs(pts[1][1] - pts[0][1]) > Math.abs(pts[1][0] - pts[0][0]) + 0.5,
      bold: bold?.get(it.fontName) ?? false,
    });
  });
  return items;
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
    } else lines.push({ y0: it.y0, y1: it.y1, items: [it], text: "", hasToken: false });
  }
  lines.sort((a, b) => a.y0 - b.y0);
  for (const l of lines) {
    l.items.sort((m, n) => m.x0 - n.x0);
    l.text = l.items.map((i) => i.s).join(" ");
  }
  return lines;
}

/** Body text's height: the median item height, each item counted once per character, up to 50. */
function bodyHeight(items: Item[]): number {
  const hs = items
    .flatMap((it) => Array<number>(Math.min(it.s.length, 50)).fill(it.y1 - it.y0))
    .sort((a, b) => a - b);
  return median(hs) ?? 0;
}

/**
 * Lines from body-size items only: Word's maths sets every sub- and superscript
 * as a separate small item, and as lines of their own they shrink the gap above
 * a label to nothing. Each small item then joins the nearest line beside it, so
 * that line's top and bottom take in a fraction's numerator.
 */
function bodyLines(items: Item[], bodyH: number): Line[] {
  const big = (it: Item) => it.y1 - it.y0 >= bodyH * 0.75;
  const lines = linesOf(items.filter(big));
  for (const it of items.filter((it) => !big(it))) {
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

/** A page's lines for the pre-pass: every page is read once, text only, before any is proposed. */
export function preRead(content: ReadonlyArray<object>, vp: Viewport): PreLine[] {
  return linesOf(itemsOf(content, vp)).map((l) => ({ text: l.text.trim(), y0: l.y0 }));
}

/** On how many pages of the file a line with this text stands at this height (within 2 pt). */
function repeatCount(file: FileState, text: string, y0: number): number {
  let n = 0;
  for (const lines of file.pre) if (lines.some((q) => q.text === text && Math.abs(q.y0 - y0) <= 2)) n++;
  return n;
}

/** Repeated at one height on half the pages: a running header or footer (R43, R51). */
function repeatedOnHalf(file: FileState, l: Line): boolean {
  const pages = file.pre.length;
  return pages > 1 && repeatCount(file, l.text.trim(), l.y0) >= Math.max(2, Math.ceil(0.5 * pages));
}

/** Page furniture: a line repeated on three pages, a Name: line, or a form field. */
function isFurniture(P: Page, l: Line): boolean {
  const t = l.text.trim();
  return (
    (P.file.pre.length > 2 && repeatCount(P.file, t, l.y0) >= 3) ||
    NAME_LINE.test(t) ||
    /^(?:date|class|grade|score|teacher)\s*:/i.test(t)
  );
}

// --- ink ------------------------------------------------------------------------

function inkCount(P: Page, x0: number, y0: number, x1: number, y1: number, dk: Dark): number {
  let n = 0;
  const X0 = Math.max(0, Math.floor(x0 * S));
  const X1 = Math.min(P.cw - 1, Math.ceil(x1 * S));
  const Y0 = Math.max(0, Math.floor(y0 * S));
  const Y1 = Math.min(P.ch - 1, Math.ceil(y1 * S));
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (dk(x, y)) n++;
  return n;
}

/**
 * R69: ink in a region's top two pixel rows that its third row does not
 * continue is the tail of the line above (a comma, a descender), which another
 * canvas draws a pixel lower or higher: it does not widen a box, unless it is
 * all the ink there is (IGCSE CIM Book 1 p. 20's Q63, 179 pt wider in Chromium).
 */
const r69Tail = (dk: Dark, x: number, y: number, top: number, bottom: number) =>
  y < top + 2 && top + 2 <= bottom && !dk(x, top + 2);

/** A region's ink, shrunk to it plus PAD, its sides past R69's tails; null when the region holds no ink. */
function inkBox(P: Page, x0: number, y0: number, x1: number, y1: number): number[] | null {
  const X0 = Math.max(0, Math.floor(x0 * S));
  const X1 = Math.min(P.cw - 1, Math.ceil(x1 * S) - 1);
  const Y0 = Math.max(0, Math.floor(y0 * S));
  const Y1 = Math.min(P.ch - 1, Math.floor(y1 * S));
  let a = X1;
  let b = X0;
  let c = Y1;
  let d = Y0;
  let any = false;
  // R69: the line above's tail at the top edge does not widen the box (r69Tail).
  let ta = X1;
  let tb = X0;
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      if (!P.dark(x, y)) continue;
      any = true;
      if (r69Tail(P.dark, x, y, Y0, Y1)) {
        if (x < ta) ta = x;
        if (x > tb) tb = x;
      } else {
        if (x < a) a = x;
        if (x > b) b = x;
      }
      if (y < c) c = y;
      if (y > d) d = y;
    }
  }
  if (!any) return null;
  if (a > b) {
    a = ta;
    b = tb;
  }
  return [Math.max(x0, a / S - PAD), Math.max(y0, c / S - PAD), Math.min(x1, b / S + PAD), Math.min(y1, d / S + PAD)];
}

/** Ink per unit of a line's item boxes, kept on the line. */
function lineDensity(l: Line, P: Page): number {
  if (l.dens != null) return l.dens;
  let dark = 0;
  let area = 0;
  for (const it of l.items) {
    const X0 = Math.max(0, Math.floor(it.x0 * S));
    const X1 = Math.min(P.cw - 1, Math.ceil(it.x1 * S));
    const Y0 = Math.max(0, Math.floor(it.y0 * S));
    const Y1 = Math.min(P.ch - 1, Math.ceil(it.y1 * S));
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (P.dark0(x, y)) dark++;
    area += (X1 - X0 + 1) * (Y1 - Y0 + 1);
  }
  return (l.dens = area ? dark / area : 0);
}

/**
 * Bold by ink, for fonts whose names say nothing ("CambriaMath" for every
 * weight): a line of mostly letters whose ink per unit of its boxes is 1.3x the
 * page's median line.
 */
function inkBold(l: Line, P: Page): boolean {
  const letters = (l.text.match(/[A-Za-z]/g) || []).length;
  if (letters < 8 || letters < 0.7 * l.text.replace(/\s/g, "").length) return false;
  if (P.medDensity == null) {
    const ds = P.allLines
      .filter((q) => (q.text.match(/[A-Za-z]/g) || []).length >= 10)
      .map((q) => lineDensity(q, P))
      .sort((a, b) => a - b);
    P.medDensity = ds.length >= 3 ? median(ds) : Infinity;
  }
  return lineDensity(l, P) >= 1.3 * P.medDensity;
}

/**
 * The share of the page its largest image covers, and every image's rectangle,
 * from pdf.js's page.imageCoordinates: three corners per image, as fractions of
 * the canvas.
 */
function imagesOf(coords: ArrayLike<number> | null | undefined, vp: Viewport): { coverage: number; rects: Rect[] } {
  let coverage = 0;
  const rects: Rect[] = [];
  if (coords) {
    for (let k = 0; k + 5 < coords.length; k += 6) {
      const xs = [coords[k], coords[k + 2], coords[k + 4]];
      const ys = [coords[k + 1], coords[k + 3], coords[k + 5]];
      coverage = Math.max(coverage, (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)));
      xs.push(coords[k + 2] + coords[k + 4] - coords[k]);
      ys.push(coords[k + 3] + coords[k + 5] - coords[k + 1]);
      rects.push({
        x0: Math.min(...xs) * vp.width,
        x1: Math.max(...xs) * vp.width,
        y0: Math.min(...ys) * vp.height,
        y1: Math.max(...ys) * vp.height,
        tiny: false,
      });
    }
  }
  return { coverage, rects };
}

const darkOf = (ink: Ink): Dark => {
  const img = ink.data;
  const w = ink.width;
  return (x, y) => {
    const o = (y * w + x) * 4;
    return img[o] + img[o + 1] + img[o + 2] < 600;
  };
};

// --- kind of page (R1-R6) ---------------------------------------------------------

/**
 * R2: a text item counts only where the render has ink: its box, inset a pixel
 * at the top and sides and run down into the descender zone (an underscore's
 * ink sits below the baseline), holds 3 or more pixels darker than near-white.
 * This is what rejects invisible text drawn in render mode 3.
 */
function r2VisibleItem(ink: Ink, it: Item): boolean {
  const img = ink.data;
  const X0 = Math.max(0, Math.floor(it.x0 * S) + 1);
  const X1 = Math.min(ink.width - 1, Math.ceil(it.x1 * S) - 1);
  const Y0 = Math.max(0, Math.floor(it.y0 * S) + 1);
  const Y1 = Math.min(ink.height - 1, Math.ceil((it.y1 + 0.35 * (it.y1 - it.y0)) * S));
  let n = 0;
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      const o = (y * ink.width + x) * 4;
      if (img[o] + img[o + 1] + img[o + 2] < 700 && ++n >= 3) return true;
    }
  }
  return X1 < X0 || Y1 < Y0; // degenerate boxes are left alone
}

/** R3: a page under 20 characters, not under a page-size image, is read as text: digital if it yields a question. */
const r3FewChars = (kind: PageKind, chars: number, coverage: number) => kind === "none" && chars > 0 && coverage < 0.5;

/** Not one dark pixel on the page. */
function whitePage(ink: Ink): boolean {
  const img = ink.data;
  for (let o = 0; o + 2 < img.length; o += 4) if (img[o] + img[o + 1] + img[o + 2] < 600) return false;
  return true;
}

/**
 * R1: a page under a page-size image is read as text when 20 or more glyphs are
 * painted visibly after its largest image: labels printed over a picture. An
 * OCR layer (render mode 3) never counts. When the operator list's images do not
 * pair with the recorded ones (an image clipped away entirely), v1's rule stands.
 */
function r1VisibleTextOverImage(ops: OperatorFacts | null, rects: Rect[]): boolean {
  if (!ops || ops.images.length !== rects.length) return false;
  let k = -1;
  let best = 0;
  rects.forEach((q, i) => {
    const a = (q.x1 - q.x0) * (q.y1 - q.y0);
    if (a > best) {
      best = a;
      k = i;
    }
  });
  return k >= 0 && ops.glyphs - ops.images[k].glyphsBefore >= 20;
}

/**
 * Whether proposePage reads this page's operator list: on a page the text rules
 * read (R27 and R29's OCR fonts, R48's image sizes), on a scan carrying 20
 * visible characters (R1), and on a white page that may have failed to draw (R6).
 */
export function needsOperators(input: PageInput): boolean {
  const { coverage } = imagesOf(input.images, input.vp);
  const chars = itemsOf(input.content, input.vp)
    .filter((it) => r2VisibleItem(input.ink, it))
    .reduce((n, it) => n + it.s.length, 0);
  return (
    (coverage >= 0.5 && chars >= 20) ||
    (coverage < 0.5 && chars > 0) ||
    (coverage === 0 && chars < 20 && whitePage(input.ink))
  );
}

/** R48: specks are not images: under 5 pt drawn, or under 2 pixels at source. */
function r48Specks(rects: Rect[], ops: OperatorFacts | null) {
  const src = ops && ops.images.length === rects.length ? ops.images : null;
  rects.forEach((r, i) => {
    r.tiny = r.x1 - r.x0 < 5 || r.y1 - r.y0 < 5 || (!!src && (src[i].w < 2 || src[i].h < 2));
  });
}

/**
 * R44: page frames and page-long rules are not ink. A pixel column dark over
 * 70% of the rows between the 6% bands, unless two or more horizontal rules
 * (runs of 15% of the width) cross it inside its length, which marks a table's
 * column rule; and, only on a page with such a column, a pixel row dark over 60%
 * of the width in the outer 10% of the height.
 */
function r44FrameMask(P: Page, img: ArrayLike<number>): Frame | null {
  const W2 = P.cw;
  const H2 = P.ch;
  const cc = new Uint32Array(W2);
  const rc = new Uint32Array(H2);
  const ya = Math.floor(H2 * 0.06);
  const yb = Math.ceil(H2 * 0.94);
  const dk = P.dark0;
  for (let y = 0, o = 0; y < H2; y++) {
    for (let x = 0; x < W2; x++, o += 4) {
      if (img[o] + img[o + 1] + img[o + 2] < 600) {
        if (y >= ya && y < yb) cc[x]++;
        rc[y]++;
      }
    }
  }
  const col = new Uint8Array(W2);
  const row = new Uint8Array(H2);
  const spans: Frame["spans"] = [];
  let any = false;
  for (let x = 0; x < W2; ) {
    if (cc[x] <= (yb - ya) * 0.7) {
      x++;
      continue;
    }
    let x1 = x;
    while (x1 + 1 < W2 && cc[x1 + 1] > (yb - ya) * 0.7) x1++;
    // The rule's length, and the horizontal rules that cross it inside it.
    const xm = (x + x1) >> 1;
    let top = 0;
    let bot = H2 - 1;
    while (top < H2 && !dk(xm, top)) top++;
    while (bot > 0 && !dk(xm, bot)) bot--;
    let crossings = 0;
    let inRule = false;
    for (let y = top + Math.ceil(H2 * 0.03); y < bot - Math.ceil(H2 * 0.03); y++) {
      let run = 0;
      for (let xx = Math.max(0, x - 1); xx >= 0 && dk(xx, y); xx--) run++;
      for (let xx = x1 + 1; xx < W2 && dk(xx, y); xx++) run++;
      const hit = run >= W2 * 0.15;
      if (hit && !inRule) crossings++;
      inRule = hit;
    }
    if (crossings < 2) {
      for (let k = x; k <= x1; k++) col[k] = 1;
      any = true;
      spans.push({ x0: x, x1, top, bot });
    }
    x = x1 + 1;
  }
  if (!any) return null;
  for (let y = 0; y < H2; y++) if ((y < H2 * 0.1 || y > H2 * 0.9) && rc[y] > W2 * 0.6) row[y] = 1;
  return { col, row, spans };
}

/** Dark pixels inside the margins and inside placed images, worked out once per page (R4, R5, R6). */
function inkStats(P: Page, img: ArrayLike<number>) {
  const CW = P.cw;
  const CH = P.ch;
  let all = 0;
  let inner = 0;
  let inImg = 0;
  const xa = Math.floor(CW * 0.03);
  const xb = Math.ceil(CW * 0.97);
  const ya = Math.floor(CH * 0.06);
  const yb = Math.ceil(CH * 0.94);
  const mask = new Uint8Array(CW * CH);
  for (const r of P.rects) {
    const a = Math.max(0, Math.floor(r.x0 * S));
    const b = Math.min(CW, Math.ceil(r.x1 * S));
    const c = Math.max(0, Math.floor(r.y0 * S));
    const d = Math.min(CH, Math.ceil(r.y1 * S));
    for (let y = c; y < d; y++) mask.fill(1, y * CW + a, y * CW + b);
  }
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const o = (y * CW + x) * 4;
      if (img[o] + img[o + 1] + img[o + 2] >= 600) continue;
      all++;
      if (x >= xa && x < xb && y >= ya && y < yb) inner++;
      if (mask[y * CW + x]) inImg++;
    }
  }
  return { all, inner, inImg };
}

/**
 * R5: blank. No proposals, no body text outside the bands (or 3 characters or
 * fewer), and dark pixels inside the margins under 0.02% of the page. Blank
 * scans measured 0-0.004%, the lightest page with content 0.59%.
 */
function r5Blank(P: Page, items: Item[], chars: number, inner: number): boolean {
  const bodyText = items.some(
    (it) => it.y1 > P.H * 0.06 && it.y0 < P.H * 0.94 && it.x1 > P.W * 0.03 && it.x0 < P.W * 0.97,
  );
  return (!bodyText || chars <= 3) && inner < P.cw * P.ch * 0.0002;
}

/** R6: a page that is not text, paints images, and drew pure white: an image decoder failed. */
function r6RenderFailed(
  kind: PageKind,
  coverage: number,
  chars: number,
  ink: () => { all: number },
  ops: OperatorFacts | null,
): boolean {
  return kind !== "digital" && coverage === 0 && chars < 20 && ink().all === 0 && !!ops && ops.paintsImages;
}

/** R4: a page with no proposals whose ink lies 90% inside placed images is a scan for cropping purposes. */
function r4PicturePage(P: Page, all: number, inImg: number): boolean {
  return all >= P.cw * P.ch * 0.0002 && inImg >= 0.9 * all;
}

// --- answers (R9-R15) -----------------------------------------------------------

/** R9-R11: is this line an answers heading? The form that matched, or null. */
function answersForm(l: Line, bodyH: number, isFirst: boolean): string | null {
  const s0 = l.text.trim();
  if (s0.length >= 130) return null;
  if (s0.length < 80 && ANSWERS.test(s0)) return "v1";
  if (FIRST.test(l.items[0].s) || FIRST_MERGED.test(l.items[0].s)) return null; // a question's own line
  // Also the line with abutting items joined tight: pdf.js can split "Ans" "wers".
  const tight = l.items
    .map((it, k) => (k && it.x0 - l.items[k - 1].x1 > 0.15 * (it.y1 - it.y0) ? " " : "") + it.s)
    .join("")
    .trim();
  for (const s of s0 === tight ? [s0] : [s0, tight]) {
    const f = r9AnswersForm(s, l, bodyH, isFirst) ?? r10DashTitle(s, l, bodyH);
    if (f) return f;
  }
  return null;
}

/**
 * R9: answers heading forms: the words alone, with a "(topic)" suffix, a title
 * ending ": Mark scheme", a line starting "Mark scheme" or "Marking guide".
 * "Suggested/Model/Sample answers" only set large or among the page's first lines.
 */
function r9AnswersForm(s: string, l: Line, bodyH: number, isFirst: boolean): string | null {
  if (s.length >= 80) return null;
  if (ANSWERS_V.test(s)) return "R9";
  if (ANSWERS_PREFIXED.test(s) && (maxHeight(l) >= 1.25 * bodyH || isFirst)) return "R9";
  return null;
}

/**
 * R10: answers in a dash title ("Unit 3 – Answer Key", ": Solutions"), also in
 * one of a line's gap-separated segments (a centred title beside "Marks:").
 */
function r10DashTitle(s: string, l: Line, bodyH: number): string | null {
  if (ANSWERS_DASH.test(s)) return "R10";
  const segs: Item[][] = [];
  let cur: Item[] = [];
  l.items.forEach((it, k) => {
    if (k && it.x0 - l.items[k - 1].x1 > 2 * bodyH) {
      segs.push(cur);
      cur = [];
    }
    cur.push(it);
  });
  segs.push(cur);
  if (segs.length > 1 && segs.some((g) => ANSWERS_DASH.test(g.map((i) => i.s).join(" ").trim()))) return "R10";
  return null;
}

/**
 * R11: an answers heading must look like one: bold, larger than body or among
 * the page's first three lines, and in the left quarter of the page or centred
 * (a "solutions" in a table cell is neither).
 */
function r11LooksLikeHeading(l: Line, bodyH: number, P: Page, lines: Line[]): boolean {
  const big = maxHeight(l) >= 1.1 * bodyH;
  const bold = l.items.every((i) => i.bold);
  const firstLines = lines.indexOf(l) >= 0 && lines.indexOf(l) < 3;
  const atLeft = l.items[0].x0 <= 0.25 * P.W;
  const centred = Math.abs((l.items[0].x0 + last(l.items).x1) / 2 - P.W / 2) < 0.1 * P.W;
  return (big || bold || firstLines || inkBold(l, P)) && (atLeft || centred);
}

/** R12: an answers heading on a page the text rules do not read (a mark scheme pasted as pictures). */
function r12AnswersOnAnyPage(P: Page, items: Item[]): boolean {
  const ls = linesOf(items);
  const bh = bodyHeight(items);
  P.allLines = ls;
  return ls.some((l, i) => answersForm(l, bh, i < 2) && r11LooksLikeHeading(l, bh, P, ls));
}

/** R13: answers end at the sheet: a Name: line in the top fifth, with no answers heading of its own. */
function r13NewSheet(P: Page, items: Item[]): boolean {
  const ls = linesOf(items);
  const bh = bodyHeight(items);
  return (
    ls.some((l) => l.y0 < P.H * 0.2 && NAME_LINE.test(l.text.trim())) &&
    !ls.some((l, i) => answersForm(l, bh, i < 2))
  );
}

/**
 * R14: a run of three or more whose text on each label's baseline is only answer
 * letters ("B", "B, A, A", "(a) D (b) B") is an answer key. A letter inside a
 * placed image, or on a drawing, is a figure's.
 */
function r14AnswerList(r: Token[], P: Page): boolean {
  const onBaseline = (t: Token, it: Item) =>
    Math.abs(it.y1 - t.item.y1) <= 0.25 * (t.item.y1 - t.item.y0) && !r14OnDrawing(it, P, t.line.items);
  const restOf = (t: Token) => {
    const items = t.line.items.slice(t.k + 1).filter((it) => onBaseline(t, it));
    const stop = items.findIndex((i) => INLINE.test(i.s) && /^\d/.test(i.s));
    const after = (stop < 0 ? items : items.slice(0, stop)).map((i) => i.s).join(" ");
    const own = t.item.s.replace(/^\*?(?:(?:Q(?:uestion)?|EX|Example)\s*)?\d{1,3}\s?[.):]?\s*/i, "");
    return (own + " " + after).trim();
  };
  const hits = r.filter(
    (t) => /^[A-E](?:\s*,\s*[A-E])*$/.test(restOf(t)) || /^(?:\([a-z]\)\s*[A-E]\s*)+$/.test(restOf(t)),
  ).length;
  return r.length >= 3 && hits >= 0.8 * r.length;
}

/** R14: a text item inside a placed image, or with drawn ink 2 to 4 pt round it (other text left out). */
function r14OnDrawing(it: Item, P: Page, others: Item[]): boolean {
  if (P.rects.some((r) => it.x0 >= r.x0 - 1 && it.x1 <= r.x1 + 1 && it.y0 >= r.y0 - 1 && it.y1 <= r.y1 + 1)) return true;
  const h = it.y1 - it.y0;
  const X0 = Math.max(0, Math.floor((it.x0 - 4) * S));
  const X1 = Math.min(P.cw - 1, Math.ceil((it.x1 + 4) * S));
  const Y0 = Math.max(0, Math.floor((it.y0 - 4) * S));
  const Y1 = Math.min(P.ch - 1, Math.ceil((it.y1 + 0.3 * h + 4) * S));
  const inside = (x: number, y: number, a: Item, m: number) =>
    x >= (a.x0 - m) * S && x <= (a.x1 + m) * S && y >= (a.y0 - m) * S && y <= (a.y1 + 0.3 * (a.y1 - a.y0) + m) * S;
  let n = 0;
  for (let y = Y0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      if (inside(x, y, it, 2) || !P.dark(x, y) || others.some((o) => o !== it && inside(x, y, o, 1))) continue;
      if (++n >= 6) return true;
    }
  }
  return false;
}

/** R15: an answer key's entries are short: from `from` on, at most half the characters per question of the pages before. */
function r15ShortEntries(rows: Row[], from: number): boolean {
  const dens = (rs: Row[]) => {
    let c = 0;
    let q = 0;
    for (const r of rs) {
      const n = r.proposals.filter((x) => x.type === "question").length;
      if (n) {
        c += r.chars;
        q += n;
      }
    }
    return q ? c / q : null;
  };
  const head = dens(rows.filter((r) => r.page < from));
  const tail = dens(rows.filter((r) => r.page >= from));
  return head != null && tail != null && tail <= 0.5 * head;
}

/**
 * R15, first signal: an unheaded answer key. The file's questions, in reading
 * order, form sections of consecutive numbers; when the second half's sections
 * repeat the first half's lengths and first numbers (two sections or more, ten
 * labels or more) on at most 0.6 of its pages, with short entries, the second
 * half is the answers. Returns whether it fired.
 */
function r15SectionsRepeat(file: FileState): boolean {
  const { questions, rows } = file;
  if (questions.length < 20) return false;
  type Sec = {
    first: number;
    last: number;
    len: number;
    page: number;
    pages: Set<number>;
    items: { page: number; q: Prop }[];
  };
  const secs: Sec[] = [];
  for (const { page, q } of questions) {
    const s = secs.length ? last(secs) : null;
    if (s && q.n === s.last + 1) {
      s.last = q.n;
      s.len++;
      s.pages.add(page);
      s.items.push({ page, q });
    } else secs.push({ first: q.n, last: q.n, len: 1, page, pages: new Set([page]), items: [{ page, q }] });
  }
  const k = secs.length / 2;
  if (!Number.isInteger(k) || k < 2) return false;
  const head = secs.slice(0, k);
  const tail = secs.slice(k);
  const same = head.every((s, i) => s.len === tail[i].len && s.first === tail[i].first);
  const span = (ss: Sec[]) =>
    Math.max(...ss.map((s) => Math.max(...s.pages))) - Math.min(...ss.map((s) => s.page)) + 1;
  if (
    !(
      same &&
      head.reduce((n, s) => n + s.len, 0) >= 10 &&
      span(tail) <= 0.6 * span(head) &&
      tail[0].page > Math.max(...last(head).pages) - 1 &&
      r15ShortEntries(rows, tail[0].page)
    )
  ) {
    return false;
  }
  const from = tail[0].page;
  for (const s of tail) {
    for (const { page, q } of s.items) {
      const row = rows.find((x) => x.page === page)!;
      row.proposals = row.proposals.filter((x) => x !== q);
      q.gone = true;
    }
  }
  for (const row of rows) {
    if (row.page < from) continue;
    row.answers = true;
    // Nothing else is proposed on an answers page either.
    for (const x of row.proposals) if (x.type !== "question") x.gone = true;
    row.proposals = row.proposals.filter((x) => x.type === "question");
  }
  return true;
}

/**
 * R15, second signal: two section headings ("Classwork", then "Homework"), each
 * printed on exactly one page before, come back in the same order, and from
 * there to the end is at most 0.4 of the pages they first spanned, with short
 * entries: an answer table under the same titles. A heading every chapter
 * repeats ("Exercise 1") is on many pages and never counts.
 */
function r15HeadingsRepeat(file: FileState) {
  const { rows } = file;
  const firsts: { t: string; page: number }[] = [];
  for (const row of rows) {
    for (const t of row.headTexts || []) {
      if (t.length >= 4 && !firsts.some((f) => f.t === t)) firsts.push({ t, page: row.page });
    }
  }
  let from = Infinity;
  const has = (row: Row, t: string) => !!row.lineFirsts && row.lineFirsts.has(t);
  const pagesWith = (t: string) => rows.filter((row) => has(row, t)).length;
  for (let i = 0; i < firsts.length; i++) {
    for (let j = i + 1; j < firsts.length; j++) {
      const a = firsts[i];
      const b = firsts[j];
      if (b.page <= a.page || pagesWith(a.t) !== 2 || pagesWith(b.t) !== 2) continue;
      const qa = rows.find((row) => row.page > b.page && has(row, a.t));
      if (!qa) continue;
      const qb = rows.find((row) => row.page >= qa.page && has(row, b.t));
      if (!qb) continue;
      const end = last(rows).page;
      if (end - qa.page + 1 <= 0.4 * (qa.page - a.page) && r15ShortEntries(rows, qa.page)) from = Math.min(from, qa.page);
    }
  }
  if (!Number.isFinite(from)) return;
  for (const row of rows) {
    if (row.page < from) continue;
    for (const q of row.proposals) q.gone = true;
    row.proposals = [];
    row.answers = true;
  }
}

// --- headings (R27, R29) --------------------------------------------------------

/**
 * R29: a label-free heading line, and its kind: set 1.25x body ("size"), in
 * section words or an upper-Roman line set large or bold ("words"), bold on a
 * page whose body is not ("bold"), or short all caps ("caps"). Words, bold and
 * caps lines need a gap above them of half a body height, and bold and caps one
 * wider than the column's usual leading too, unless set 1.1x body; section words
 * straight under a heading need none. Never an option line, a question ("...?"),
 * an OCR layer's text, a line inside a placed image or a ruled table, or text
 * drawn up the page. A bold line with gaps above and below may run to 80
 * characters, unless it names the questions it serves (a stem).
 */
function r29HeadingKind(
  l: Line,
  bodyH: number,
  P: Page,
  lines: Line[],
  li: number,
  medGap: number,
  underHead: boolean,
): HeadKind | null {
  if (l.hasToken) return null;
  if (P.ocrFonts && l.items.some((i) => P.ocrFonts!.has(i.font))) return null;
  const s = l.text.trim();
  const gapA = li > 0 ? l.y0 - lines[li - 1].y1 : Infinity;
  const gapB = li + 1 < lines.length ? lines[li + 1].y0 - l.y1 : Infinity;
  const raised = maxHeight(l) >= 1.1 * bodyH;
  const needGap = raised ? -Infinity : Math.max(0.5 * bodyH, medGap + 0.1 * bodyH);
  let bold: boolean | undefined; // the ink test scans the line's pixels: only when asked
  const isBold = () => (bold ??= P.boldShare < 0.5 && (l.items.every((i) => i.bold) || inkBold(l, P)));
  const maxLen =
    s.length > 60 && s.length <= 80 && gapA > needGap && gapB > needGap && !STEM_RANGE.some((rx) => rx.test(s)) && isBold()
      ? 80
      : 60;
  if (!s || s.length > maxLen || /^(?:claim|evidence|reasoning)\s*:/i.test(s)) return null;
  if (!/[A-Za-z]{2}/.test(s)) return null; // a heading has words; a bold page number is not one
  const inImage = P.rects.some(
    (r) => l.items[0].x0 >= r.x0 - 1 && last(l.items).x1 <= r.x1 + 1 && l.y0 >= r.y0 - 1 && l.y1 <= r.y1 + 1,
  );
  // Set large, it must read as a title: three letters or more, not ending in a number, not inside a figure.
  const large = maxHeight(l) >= 1.25 * bodyH;
  let kind: HeadKind | null = null;
  if (large && /[A-Za-z]{3}/.test(s) && !/\d\s*$/.test(s) && !inImage) kind = "size";
  else if (ROMAN.test(s)) {
    const boldNumeral = /^[IVXL]+[.)]/.test(l.items[0].s) && l.items[0].bold;
    const heavy = large || l.items.every((i) => i.bold) || boldNumeral || inkBold(l, P);
    kind = heavy && !r29RomanListItem(lines, li) ? "words" : null;
  } else if (gapA <= 0.5 * bodyH && !raised && !(underHead && SECTION.test(s))) kind = null;
  else if (SECTION.test(s) && !(/^exercises?\b/i.test(s) && !/^E/.test(s) && !/^exercises?\s*\d/i.test(s))) kind = "words";
  else if (/^\(?[A-E][.)]\s/.test(s) || /\?\s*$/.test(s) || gapA <= needGap || inImage) kind = null;
  else if (isBold()) kind = "bold";
  else if (s.length <= 40 && /[A-Z]{4}/.test(s) && !/[a-z]/.test(s) && /^[A-Z]/.test(s)) kind = "caps";
  if (kind && (l.items.some((i) => i.rot) || r29InRuledTable(l, P, bodyH))) return null;
  return kind;
}

const romanVal = (r: string) => {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
  let n = 0;
  for (let i = 0; i < r.length; i++) n += v[r[i]] < (v[r[i + 1]] || 0) ? -v[r[i]] : v[r[i]];
  return n;
};

/**
 * R29: an upper-Roman line that is an item of a I./II./III. list: the next
 * numeral on the same line, or the next or previous one opening one of the three
 * lines below or above with no question label between.
 */
function r29RomanListItem(lines: Line[], li: number): boolean {
  const n = romanVal(lines[li].text.trim().match(/^([IVXL]+)[.)]/)![1]);
  const at = (l: Line) => {
    const k = l.text.trim().match(/^([IVXL]+)[.)]\s/);
    return k ? romanVal(k[1]) : null;
  };
  if (
    lines[li].items.slice(1).some((it) => {
      const k = it.s.match(/^([IVXL]+)[.)]/);
      return !!k && romanVal(k[1]) === n + 1;
    })
  ) {
    return true;
  }
  for (const d of [1, -1]) {
    for (let j = li + d, k = 0; k < 3 && j >= 0 && j < lines.length; j += d, k++) {
      if (lines[j].hasToken) break;
      if (at(lines[j]) === n + d) return true;
    }
  }
  return false;
}

/**
 * R29: a line in a ruled table: two vertical rules (ink columns running a line
 * and a half beyond the line's own height) cross its band within 12 pt of its
 * ends. A heading bar's edges are only as tall as its padding.
 */
function r29InRuledTable(l: Line, P: Page, bodyH: number): boolean {
  const ya = Math.floor(l.y0 * S);
  const yb = Math.ceil(l.y1 * S);
  const need = Math.ceil((l.y1 - l.y0 + 1.5 * bodyH) * S);
  const x0 = Math.max(0, Math.floor((l.items[0].x0 - 12) * S));
  const x1 = Math.min(P.cw - 1, Math.ceil((last(l.items).x1 + 12) * S));
  let rules = 0;
  let inRule = false;
  for (let x = x0; x <= x1; x++) {
    let hit = true;
    for (let y = ya; y <= yb && hit; y++) hit = P.dark(x, y);
    if (hit) {
      let a = ya;
      let b = yb;
      while (a > 0 && P.dark(x, a - 1)) a--;
      while (b < P.ch - 1 && P.dark(x, b + 1)) b++;
      hit = b - a + 1 >= need;
    }
    if (hit && !inRule) rules++;
    inRule = hit;
  }
  return rules >= 2;
}

/** Set large or in section words: a heading wherever it stands. Bold or all-caps lines count only next to a label. */
const strongHead = (h: Head) => h.kind === "size" || h.kind === "words";

/** R29: a table row: three items or more, two of the gaps between them 1.5 body heights or wider. */
const tableRow = (l: Line, bodyH: number) =>
  l.items.length >= 3 && l.items.slice(1).filter((it, k) => it.x0 - l.items[k].x1 >= 1.5 * bodyH).length >= 2;

// --- labels (R16-R27) -----------------------------------------------------------

type Found = Omit<Token, "x" | "li" | "line" | "first" | "item" | "k" | "markLine" | "startBy32">;

/** A token's fields, beyond where it stands, for a label no rule changed. */
const plain = (n: number, big: boolean): Found => ({
  n,
  big,
  via: null,
  needsRun: false,
  hangAlone: false,
  gapNeed: 0,
  stemX: null,
  band: false,
  prefixed: false,
  frq: false,
});

/**
 * R24: the page's text margin, the line-start x carrying the most characters; a
 * line that itself opens with a hanging number votes with its text's x.
 */
function r24Margin(lines: Line[]): number {
  const c = new Map<number, number>();
  for (const l of lines) {
    const it = l.items[0];
    const nx = l.items[1];
    const hangs = nx && nx.x0 - it.x1 >= 12 && HANG.test(it.s) && /^[A-Za-z(]/.test(nx.s);
    const x = Math.round((hangs ? nx.x0 : it.x0) / 2) * 2;
    c.set(x, (c.get(x) || 0) + l.text.length);
  }
  return Array.from(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/** R16: the label and its stop as abutting items ("7" bold, ". Examine"), joined; never an item painted over it (R17). */
function r16Joined(l: Line, k: number, s: string): string {
  const it = l.items[k];
  let s0 = s;
  for (
    let j = k + 1;
    j < l.items.length &&
    l.items[j].x0 - l.items[j - 1].x1 < (it.y1 - it.y0) * 0.15 &&
    l.items[j].x0 > l.items[j - 1].x1 - 1;
    j++
  ) {
    s0 += l.items[j].s;
  }
  return s0;
}

const r20StarSpace = (s: string) => s.match(FIRST_V) || s.match(FIRST_MERGED_V);
const r21Fused = (s: string) => s.match(FUSED);
/** R22: an answer blank before the number ("_____8.") does not hide it. */
const r22LeadingBlank = (s: string) => /^_{3,}\s*\d/.test(s);
const r23Frq = (s: string) => s.match(FIRST_FRQ) || s.match(FIRST_MERGED_FRQ);
const r26NoStop = (l: Line, k: number) => l.items.slice(k).map((i) => i.s).join(" ").match(NOSTOP);
/** R18: 0 is never a label. */
const r18Zero = (n: number) => n === 0;

/**
 * R24: a bare number hanging left of the text margin ("2", "1a", "4 a ii") before
 * a stem: 12 pt or more from it (6 pt when the stem starts on the margin), the
 * stem starting with a letter or "(" and holding 12 characters and a word.
 */
function r24Hanging(l: Line, it: Item, rest: string, margin: number): boolean {
  const nx = l.items[1];
  return (
    !!nx &&
    (nx.x0 - it.x1 >= 12 || (nx.x0 - it.x1 >= 6 && Math.abs(nx.x0 - margin) <= 2)) &&
    it.x0 <= margin - 12 &&
    /^[A-Za-z(]/.test(nx.s) &&
    rest.length >= 12 &&
    /[A-Za-z]{3}/.test(rest)
  );
}

/**
 * R25: a bare number alone on its line, at or left of the margin less 12 (or
 * the leftmost text), outside the bands (the top band too on the first line
 * under a question left open), with ink to its right within its line and the
 * next two body heights.
 */
function r25HangingAlone(
  P: Page,
  l: Line,
  it: Item,
  margin: number,
  bodyH: number,
  col: [number, number],
  openTop: boolean,
): boolean {
  return (
    l.items.length === 1 &&
    /^\d{1,3}$/.test(it.s) &&
    (it.x0 <= margin - 12 || it.x0 <= P.minX + 2) &&
    (l.y0 > P.H * 0.06 || openTop) &&
    l.y0 < P.H * 0.94 &&
    inkCount(P, Math.max(it.x1 + 4, margin), l.y0, col[1], l.y1 + 2 * bodyH, P.dark) >= 20
  );
}

/** R19: "2: 10" and "3 : 15" are ratios. A colon stops a bare number only when a letter or the line's end follows it. */
function r19Ratio(s: string, l: Line, k: number): boolean {
  const mm = s.match(/^\*?(\d{1,3})( ?)([.):])/);
  if (!mm || mm[3] !== ":") return false;
  const rest = s.slice(mm[0].length);
  if (/^\s*\d/.test(rest)) return true;
  if (!rest.trim()) {
    const nx = l.items[k + 1];
    if (nx && /^\d/.test(nx.s)) return true;
  }
  return false;
}

/**
 * A line's first token as a label: v1's patterns first, then each rule's form
 * in turn, so a label carries the one rule that found it. "drop" is a label a
 * rule rejects outright (R16's split decimal, R18, R19).
 */
function firstLabel(
  l: Line,
  k: number,
  lines: Line[],
  bodyH: number,
  margin: number,
  P: Page,
  col: [number, number],
): Found | "drop" | null {
  const it = l.items[k];
  let s = it.s;
  let via: string | null = null;
  if (k === 1) via = "R22"; // "_____" "8."
  if (r22LeadingBlank(s)) {
    s = s.replace(/^_{3,}\s*/, "");
    via = "R22";
  }
  const v1 = s.match(FIRST) || s.match(FIRST_MERGED);
  let m: (string | undefined)[] | null = v1;
  let needsRun = false;
  let hangAlone = false;
  let gapNeed = 0;
  const s0 = r16Joined(l, k, s);
  const m0 = s0.match(FIRST) || s0.match(FIRST_MERGED);
  if (v1 && !m0) return "drop"; // R16: "0." then "3", a split decimal
  if (!v1 && m0) {
    m = m0;
    via = via || "R16";
  }
  s = s0;
  if (!m) {
    m = r20StarSpace(s);
    if (m) via = via || "R20";
  }
  if (!m) {
    m = r23Frq(s);
    if (m) via = via || "R23";
  }
  if (!m) {
    m = r21Fused(s);
    if (m) {
      via = via || "R21";
      needsRun = true;
    }
  }
  const rest = l.items
    .slice(k + 1)
    .map((i) => i.s)
    .join(" ");
  let stemX: number | null = null;
  let band = false;
  // R24: a hanging label in the top band is a candidate too, kept only when it
  // lines up with the file's other hanging labels; (R51) on the column's first
  // body line, under a question left open on the page before, the band is no bar.
  const inBand = l.y0 <= P.H * 0.06;
  const openTop = inBand && !!P.file.open && lines.find((q) => !isFurniture(P, q)) === l;
  if (!m && k === 0 && r24Hanging(l, it, rest, margin)) {
    m = it.s.match(HANG);
    if (m) {
      via = via || "R24";
      stemX = l.items[1].x0;
      band = inBand && !openTop;
    }
  }
  if (!m && k === 0 && r25HangingAlone(P, l, it, margin, bodyH, col, openTop)) {
    m = [it.s, it.s];
    via = via || "R25";
    hangAlone = true;
    const nl = lines[lines.indexOf(l) + 1];
    stemX = nl ? nl.items[0].x0 : margin;
  }
  if (!m && k === 0) {
    m = r26NoStop(l, k);
    if (m) {
      via = via || "R26";
      needsRun = true;
      gapNeed = 0.5 * bodyH;
    }
  }
  if (!m) return null;
  const n = +(m[1] ?? m[2])!;
  if (r18Zero(n) || r19Ratio(s, l, k)) return "drop";
  return {
    n,
    big: it.y1 - it.y0 >= 1.25 * bodyH && !P.fewChars,
    via,
    needsRun,
    hangAlone,
    gapNeed,
    stemX,
    band,
    prefixed: /^\*?Q(?:uestion)?\s*\d/i.test(s),
    frq: /^(?:(?:Short|Long)\s+)?FRQ\s*\d/i.test(s),
  };
}

/** R24: a hanging label in the top band stays only within 3 pt of another hanging label's x, here or on a page before. */
function r24BandLabels(toks: Token[], P: Page) {
  for (const t of toks.filter((u) => u.band)) {
    const near = (x: number) => Math.abs(x - t.x) <= 3;
    const column = toks.some((u) => u !== t && !u.band && (u.via === "R24" || u.via === "R25") && near(u.x));
    if (!column && !P.file.hangXs.some(near)) toks.splice(toks.indexOf(t), 1);
  }
}

/**
 * R27: a number set 1.25x body size is a chapter title, when one or two such sit
 * among at least as many body-size labels; a page whose every number is set
 * large keeps them. Returns the titles' lines.
 */
function r27HeadingSizeNumbers(toks: Token[]): Set<Line> {
  const bigs = toks.filter((t) => t.big);
  const titles = new Set<Line>();
  if (bigs.length && bigs.length <= 2 && toks.length - bigs.length >= bigs.length) {
    for (const t of bigs) {
      toks.splice(toks.indexOf(t), 1);
      titles.add(t.line);
    }
  }
  return titles;
}

/** R17: two labels painted on one spot (an old number under its replacement): keep the one painted later. */
function r17Overprint(toks: Token[]) {
  for (const t of toks.slice()) {
    const twin = toks.find(
      (u) => u !== t && Math.abs(u.item.x0 - t.item.x0) < 2 && Math.abs(u.item.y1 - t.item.y1) < 2,
    );
    if (twin && twin.item.idx > t.item.idx) toks.splice(toks.indexOf(t), 1);
  }
}

// --- runs (R25, R29-R36) --------------------------------------------------------

/** A section heading for a list at x: it starts left of the list, and no item of it stands over the list (a header row). */
const sectionHeadFor = (h: Head, x: number) =>
  h.l.items[0].x0 <= x - 6 && !h.l.items.some((i) => Math.abs(i.x0 - x) < 6 || (i !== h.l.items[0] && i.x0 >= x - 6));

/**
 * R33: a run from 1 indented more than 12 pt right of the label above it,
 * ending before that run's next label (or the page's end), level with none of
 * its labels, with no section heading between: a list inside that question.
 * Labels level with another run's, numbered in the style of the label above
 * ("1." under "1."), are a table's row instead.
 */
function r33IndentedList(r: Token[], cand: Token[][], bodyH: number, heads: Head[]): boolean {
  if (r[0].n !== 1) return false;
  let a: Token | null = null;
  for (const o of cand) {
    if (o === r) continue;
    for (const u of o) if (u.line.y1 <= r[0].line.y0 + 0.5 && u.li < r[0].li && (!a || u.line.y1 > a.line.y1)) a = u;
  }
  if (!a || !(r[0].x > a.x + 12)) return false;
  const above = a;
  const between = (h: Head) => h.l.y0 >= above.line.y1 - 0.5 && h.l.y1 <= r[0].line.y0 + 0.5;
  if (heads.some((h) => between(h) && sectionHeadFor(h, r[0].x))) return false;
  const o = cand.find((q) => q.includes(above))!;
  const next = o[o.indexOf(above) + 1];
  if (next && next.line.y0 < last(r).line.y1) return false;
  if (o.some((b) => r.some((u) => Math.abs(b.line.y0 - u.line.y0) < bodyH * 0.5))) return false;
  const stopOf = (t: Token) => (t.item.s.match(/^\*?(?:(?:Q(?:uestion)?|EX|Example)\s*)?\d{1,3}\s?([.):])/i) || [])[1];
  if (
    stopOf(r[0]) &&
    stopOf(r[0]) === stopOf(above) &&
    cand.some((q) => q !== r && q.some((b) => r.some((u) => u !== b && Math.abs(b.line.y0 - u.line.y0) <= 2)))
  ) {
    return false;
  }
  return true;
}

/**
 * R34: a run from 1 below a sub-part line or an FRQ/Exercise/Prompt heading,
 * indented right of it, with no question label or section heading between: a
 * list in that part.
 */
function r34UnderSubpart(r: Token[], lines: Line[], cand: Token[][], heads: Head[]): boolean {
  if (r[0].n !== 1) return false;
  const others = new Set(cand.filter((o) => o !== r).flat());
  for (let li = r[0].li - 1; li >= 0; li--) {
    const l = lines[li];
    const tok = Array.from(others).find((u) => u.line === l);
    if (tok) return !!tok.frq;
    const frqHead = /^(?:(?:short|long)\s+)?frq\b/i.test(l.text);
    if (!frqHead && heads.some((h) => h.l === l && sectionHeadFor(h, r[0].x))) return false;
    const it = l.items[0];
    if (SUBPART.test(it.s) && r[0].x >= it.x0 + 6) return true;
    if (/^(?:(?:Short|Long)\s+)?FRQ\b|^Exercise\b|^Prompt\b/i.test(l.text) && r[0].x >= it.x0 + 6) return true;
  }
  return false;
}

/**
 * R35: once a file numbers its questions "Question N", an unprefixed run 20 pt
 * or more right of them, after one and before the next, is a list.
 */
function r35PrefixedList(r: Token[], toks: Token[], P: Page): boolean {
  if (r.some((t) => t.prefixed)) return false;
  const pref = toks.filter((t) => t.prefixed);
  const px = Math.min(P.file.prefixX ?? Infinity, ...pref.map((t) => t.x));
  if (!Number.isFinite(px) || r[0].x < px + 20) return false;
  const above = pref.some((t) => t.line.y1 <= r[0].line.y0);
  const between = pref.some((t) => t.line.y0 > r[0].line.y0 && t.line.y0 < last(r).line.y1);
  return (above || (P.file.prefixX != null && !pref.some((t) => t.line.y1 <= r[0].line.y0))) && !between;
}

/**
 * The labels of a column's lines, chained into runs of consecutive numbers, and
 * which runs are kept: v1's runs, with each rule's change to what makes a token,
 * a chain or a keep. Labels at or below `limit` are not read.
 */
function runsOf(lines: Line[], limit: number, bodyH: number, P: Page, col: [number, number]): Runs {
  const W = P.W;
  const toks: Token[] = [];
  const margin = r24Margin(lines);
  lines.forEach((l, li) => {
    // R22: "_____" "8.": the blank is not the line's first token.
    const f = l.items.length > 1 && /^_{3,}$/.test(l.items[0].s) ? 1 : 0;
    l.items.forEach((it, k) => {
      if (it.y0 >= limit || k < f) return;
      let found: Found | "drop" | null;
      if (k === f) found = firstLabel(l, k, lines, bodyH, margin, P, col);
      else {
        const m = it.s.match(INLINE);
        found = m ? (r18Zero(+m[1]) ? "drop" : plain(+m[1], it.y1 - it.y0 >= 1.25 * bodyH && !P.fewChars)) : null;
      }
      if (!found || found === "drop") return;
      toks.push({ ...found, x: it.x0, li, line: l, first: k === f, item: it, k, markLine: null, startBy32: false });
    });
  });
  r24BandLabels(toks, P);
  const titles27 = r27HeadingSizeNumbers(toks);
  r17Overprint(toks);
  for (const l of lines) l.hasToken = false;
  for (const t of toks) t.line.hasToken = true;
  // R29: this column's heading lines. The column's usual gap between lines, for the gap a heading needs above it.
  const lgaps = lines
    .slice(1)
    .map((l, i) => l.y0 - lines[i].y1)
    .filter((g) => g > 0 && g < 1.5 * bodyH)
    .sort((a, b) => a - b);
  const medGap = lgaps.length ? median(lgaps) : 0.3 * bodyH;
  const heads: Head[] = [];
  lines.forEach((l, li) => {
    const h = r29HeadingKind(l, bodyH, P, lines, li, medGap, heads.length > 0 && last(heads).li === li - 1);
    // R27: the line of a heading-size number taken out as a label is a size heading;
    // not a number in an OCR layer (a large handwritten "2.").
    if (titles27.has(l) && !l.hasToken && !(P.ocrFonts && l.items.some((i) => P.ocrFonts!.has(i.font)))) {
      heads.push({ l, li, kind: "size", title27: true, roman: false });
    } else if (h) {
      const roman = h === "words" && ROMAN.test(l.text.trim()) && !SECTION.test(l.text.trim());
      heads.push({ l, li, kind: h, title27: false, roman });
    }
  });
  // A bold or all-caps line counts only directly above a label or outdented left of it.
  const effective = (h: Head, above: Token | undefined) =>
    (h.kind !== "bold" && h.kind !== "caps") ||
    (!!above && lines[h.li + 1] === above.line) ||
    (!!above && h.l.items[0].x0 < above.x - 6);
  const r29HeadingBetween = (a: Token, t: Token) =>
    heads.some(
      (h) =>
        h.l.y0 >= a.line.y1 - 0.5 &&
        h.l.y1 <= t.line.y0 + 0.5 &&
        effective(h, t) &&
        h.l.items[0].x0 <= Math.max(a.x, t.x) + 6,
    );
  const gapAbove = (t: Token) => (t.li === 0 ? Infinity : t.line.y0 - lines[t.li - 1].y1);
  const spaced = (t: Token) => gapAbove(t) > bodyH;
  const runs: Token[][] = [];
  for (const t of toks) {
    const cont = (tol: number) =>
      runs.filter((r) => {
        const prev = last(r);
        if (prev.n !== t.n - 1) return false;
        if (prev.li === t.li) return !t.needsRun; // side by side: the next cell of a grid row
        if (t.needsRun && (t.li <= prev.li || gapAbove(t) <= t.gapNeed)) return false;
        return r.some((u) => Math.abs(u.x - t.x) < tol); // under the run's own left edge
      });
    let open = cont(6);
    if (!open.length) open = r36Drift(cont);
    // Two runs can both want it: a spaced-out label goes to the run whose labels all are. Else the latest.
    let run: Token[] | undefined;
    for (let i = open.length - 1; i >= 0 && !run; i--) if (spaced(t) === open[i].every(spaced)) run = open[i];
    run ??= open.length ? last(open) : undefined;
    if (run) run.push(t);
    else if (t.needsRun) continue;
    else if (t.first) runs.push([t]);
    else if (r32CellRun(t, toks)) {
      t.startBy32 = true;
      runs.push([t]);
    }
  }
  const overlapY = (r: Token[], o: Token[]) => r[0].line.y0 < last(o).line.y1 && o[0].line.y0 < last(r).line.y1;
  // v1: a run wholly between two labels of another is a list inside that question;
  // not when it continues that label's number (R36), or a section heading separates them (R29).
  const inside = (r: Token[]) =>
    runs.some(
      (o) =>
        o !== r &&
        o.some(
          (a, k) =>
            k + 1 < o.length &&
            a.line.y1 <= r[0].line.y0 &&
            o[k + 1].line.y0 >= last(r).line.y1 &&
            Math.abs(a.x - r[0].x) < 6 &&
            !r36ContinuesLabel(r, a) &&
            !r29HeadingBetween(a, r[0]),
        ),
    );
  const keep1 = (r: Token[]) => r.length >= 2 || spaced(r[0]) || r30UnderHeading(r[0], lines, toks, heads, P, bodyH);
  const cand = runs.filter(keep1);
  const kept: Token[][] = [];
  const dropped: Token[][] = [];
  for (const r of runs) {
    if (!keep1(r)) continue;
    if (r25TableRowNumbers(r, heads)) continue;
    if (inside(r) && !r31NextColumn(r, runs, W, overlapY)) {
      dropped.push(r);
      continue;
    }
    if (r14AnswerList(r, P)) {
      dropped.push(r);
      P.answerKeyPage = true;
      continue;
    }
    if (r33IndentedList(r, cand, bodyH, heads) || r34UnderSubpart(r, lines, cand, heads) || r35PrefixedList(r, toks, P)) {
      dropped.push(r);
      continue;
    }
    kept.push(r);
  }
  return { kept, dropped, heads, toks, effective };
}

/** R36: a consecutive number within 10 pt of a run's x chains when no run is open at 6 pt. */
const r36Drift = (cont: (tol: number) => Token[][]) => cont(10);

/** R36: a run starting at a label's next number is never a list nested inside that label's question. */
const r36ContinuesLabel = (r: Token[], a: Token) => r[0].n === a.n + 1;

/** R32: an inline label starts a run of its own when the next number sits directly under it: a column-major cell. */
const r32CellRun = (t: Token, toks: Token[]) =>
  toks.some((u) => u.n === t.n + 1 && u.li > t.li && Math.abs(u.x - t.x) < 6);

/**
 * R25: a run of nothing but numbers alone on their lines is a table's row
 * numbers, unless it is one number straight under a section heading ("FRQ" / "1").
 */
const r25TableRowNumbers = (r: Token[], heads: Head[]) =>
  r.every((t) => t.hangAlone) && !(r.length === 1 && heads.some((h) => h.li === r[0].li - 1 && strongHead(h)));

/** R31: a run starting at N+1 a quarter-page right of a run that ended at N, beside it, is the next column, not nested. */
const r31NextColumn = (
  r: Token[],
  runs: Token[][],
  W: number,
  overlapY: (r: Token[], o: Token[]) => boolean,
) => runs.some((o) => o !== r && last(o).n === r[0].n - 1 && r[0].x >= o[0].x + W / 4 && overlapY(r, o));

/**
 * R30: a lone label is kept under a heading: a size or words heading straight
 * above it, a bold or caps one with a gap above it taller than body text, or
 * only furniture above it. It must sit at the text margin or line up with
 * another label (a centred "Question 6" under "Part B" is a title).
 */
function r30UnderHeading(t: Token, lines: Line[], toks: Token[], heads: Head[], P: Page, bodyH: number): boolean {
  const above = lines[t.li - 1];
  if (!above) return false;
  if (!(t.x <= P.minX + 20 || toks.some((u) => u !== t && Math.abs(u.x - t.x) < 6))) return false;
  const h = heads.find((h) => h.l === above);
  if (h && (h.kind === "size" || h.kind === "words")) return true;
  if (h) {
    const a2 = lines[t.li - 2];
    return !a2 || above.y0 - a2.y1 > bodyH;
  }
  return lines.slice(0, t.li).every((l) => isFurniture(P, l) || l.y1 < P.H * 0.06);
}

// --- boxes ----------------------------------------------------------------------

/** A question's box while its edges are worked out, on the displayed page in points. */
interface Edges {
  left: number;
  right: number;
  bottom: number;
  top: number;
  /** The top's pixel row, for the ink scan. */
  topRow: number;
  /** The label nearest on the right that bounds the right edge. */
  rightBind: Token | null;
  /** A heading (R29, R27) ended the box. */
  headStop: boolean;
  /** R48 or R50 set the top. */
  topBy48: boolean;
  topBy50: boolean;
}

/** The column with its heading tests, as one box needs it. */
interface BoxColumn extends Column {
  /** The nearest line above a label that overlaps its box's width, ending `clear` above it. */
  prevLine: (t: Token, clear?: number) => Line | null;
  headAboveToken: (h: Head) => boolean;
  headAboveHead: (h: Head) => boolean;
  headEnds: (h: Head) => boolean;
}

/**
 * One question's box: v1's edges, then each rule's change, edge by edge.
 * - top: the label line, less PAD (R45, R48, R50);
 * - left: the label less PAD, or ink within 30 pt left of it on its own line
 *   (a calculator icon) (R47);
 * - right: on a grid the next cell's label; otherwise a label a quarter of the
 *   page to the right inside this question's span; otherwise the column's
 *   edge (R32);
 * - bottom: the last inked row above the next label below that starts inside
 *   the box's width, or above the limit (R27, R29, R32, R42, R48, R49, R52, R53);
 * - sides: shrunk to the ink, plus PAD.
 */
function boxFor(t: Token, C: BoxColumn, grid: boolean, r: Token[]): BoxResult {
  const { P, all, cx0, cx1 } = C;
  const dk = P.dark;
  const W = P.W;
  const topOf = (u: Token) => (u.markLine ? u.markLine.y0 : u.line.y0); // R50
  // Left: the label, or ink just left of it on its own line (a calculator icon).
  let left = t.x - PAD;
  const ly0 = Math.floor(t.line.y0 * S);
  const ly1 = Math.ceil(t.line.y1 * S);
  for (let x = Math.floor((t.x - 2) * S); x >= Math.max(Math.floor(cx0 * S), Math.floor((t.x - 30) * S)); x--) {
    let ink = false;
    for (let y = ly0; y <= ly1 && !ink; y++) ink = dk(x, y);
    if (ink) left = Math.min(left, x / S - PAD);
  }
  left = Math.max(left, cx0);
  // Bottom, first: the next label under this one.
  let bottom = C.limit;
  for (const u of all) {
    if (u !== t && u.line.y0 > t.line.y1 - 1 && Math.abs(u.x - t.x) < 6 && topOf(u) - 1 < bottom) bottom = topOf(u) - 1;
  }
  // Right: on a grid, the next cell along the line; otherwise a label at least a
  // quarter of the page to the right, inside this question's span.
  const beside = all.filter(
    (u) =>
      u !== t &&
      u.line.y1 > t.line.y0 &&
      (grid ? u.x > t.x + 20 && u.line.y0 < t.line.y1 : u.x > t.x + W / 4 && u.line.y0 < bottom),
  );
  const e: Edges = {
    left,
    right: beside.length ? Math.min(...beside.map((u) => u.x)) - PAD : cx1,
    bottom,
    top: t.line.y0 - PAD,
    topRow: Math.floor((t.line.y0 - 1) * S),
    rightBind: beside.length ? beside.reduce((a, b) => (b.x < a.x ? b : a)) : null,
    headStop: false,
    topBy48: false,
    topBy50: false,
  };
  r32SameLineRight(t, all, e);
  // Bottom, then: any label below that starts inside this width.
  for (const u of all) {
    if (
      u !== t &&
      u.line.y0 > t.line.y1 - 1 &&
      u.x < e.right - 20 &&
      (grid || u.x > e.left - 200) &&
      topOf(u) - 1 < e.bottom
    ) {
      e.bottom = topOf(u) - 1;
    }
  }
  const labelBottom = e.bottom;
  r29HeadingStops(t, C, e);
  r27TitleStops(t, C, e);
  r52StemStops(t, C, e);
  r53BlockStops(t, C, e, r);
  r32RightRecompute(t, C, e, grid);
  // R49 and R32's caps: a grid's last row, a drill column's last cell, a column-major run's last cell.
  const ys = Array.from(new Set(r.map((u) => u.line.y0))).sort((a, b) => a - b);
  const pitches = ys.slice(1).map((y, i) => y - ys[i]);
  const drill = !grid && ys.length >= 4 && r.every((u) => cellText(u, all).length <= 25) &&
    Math.max(...pitches) <= 1.3 * Math.min(...pitches);
  if ((grid || drill) && ys.length >= 2 && t.line.y0 === last(ys)) r49CapLastRow(t, C, e, pitches);
  if (!grid && !drill && ys.length >= 2 && t === last(r) && (r[0].startBy32 || r32TableColumn(r, all))) {
    r49CapLastRow(t, C, e, pitches);
  }
  const split = r48AtomicImages(t, C, e, labelBottom);
  // R50: a marks-only line just above the label is this question's first line.
  if (t.markLine) {
    e.top = Math.min(e.top, t.markLine.y0 - PAD);
    e.topRow = Math.min(e.topRow, Math.floor((t.markLine.y0 - 1) * S));
    e.topBy50 = true;
  }
  // Ink sets the box: the last inked row above the bottom, found from the
  // label's own column rightwards (the strip left of it holds the next
  // question's icon, which stands taller than its line), then the sides.
  let X0 = Math.max(0, Math.floor(e.left * S));
  const X1 = Math.min(P.cw - 1, Math.ceil(e.right * S) - 1);
  const XL = Math.max(X0, Math.floor((t.x - PAD) * S));
  const Y0 = Math.floor((t.line.y0 - 1) * S);
  let Y1 = Math.floor(e.bottom * S);
  const rowInk = (y: number) => {
    for (let x = XL; x <= X1; x++) if (dk(x, y)) return true;
    return false;
  };
  while (Y1 > Y0 && !rowInk(Y1)) Y1--;
  const capByLimit = e.bottom >= C.limit - 0.01;
  if (capByLimit && !C.footerFound && Y1 >= Math.floor(e.bottom * S) - 1) {
    Y1 = r42DrawingAcrossFooter(P, e, Y1, rowInk);
  }
  const nl = r47OutdentedLeft(t, C, e, X0, X1, Y1);
  if (nl !== null) {
    e.left = nl;
    X0 = Math.max(0, Math.floor(e.left * S));
  }
  let topY0 = Math.min(Y0, e.topRow);
  const raised = r45RaisedTop(t, C, e, XL, X1);
  if (raised !== null) topY0 = Math.min(topY0, raised);
  let minX = X1;
  let maxX = X0;
  let inkTop = Infinity;
  let tMin = X1;
  let tMax = X0;
  for (let y = topY0; y <= Y1; y++) {
    for (let x = X0; x <= X1; x++) {
      if (!dk(x, y)) continue;
      if (r69Tail(dk, x, y, topY0, Y1)) {
        tMin = Math.min(tMin, x);
        tMax = Math.max(tMax, x);
      } else {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      if (y < inkTop) inkTop = y;
    }
  }
  if (minX > maxX && tMin <= tMax) {
    minX = tMin;
    maxX = tMax;
  }
  const box = [
    Math.max(e.left, minX / S - PAD),
    Math.max(0, e.top),
    Math.min(e.right, maxX / S + PAD),
    Math.min(e.bottom, Y1 / S + PAD),
  ];
  return { box, capByLimit, inkTop: inkTop / S, inkBottom: Y1 / S, split };
}

/** A label's own cell: its items up to the next label along its line. */
function cellText(u: Token, all: Token[]): string {
  const its = u.line.items;
  const k0 = its.indexOf(u.item);
  let k1 = its.length;
  for (const v of all) if (v !== u && v.line === u.line && v.x > u.x) k1 = Math.min(k1, its.indexOf(v.item));
  return its
    .slice(k0, k1 < 0 ? its.length : k1)
    .map((i) => i.s)
    .join(" ");
}

/** Ends the box above a line below the label, when the line lies across the box's width. */
function stopAt(t: Token, e: Edges, h: { y0: number; x0: number; x1: number }): boolean {
  if (h.y0 > t.line.y1 - 0.5 && h.y0 - 1 < e.bottom && h.x1 > e.left && h.x0 < e.right) {
    e.bottom = h.y0 - 1;
    return true;
  }
  return false;
}

/** R32: any label further along the same line bounds this box's right edge. */
function r32SameLineRight(t: Token, all: Token[], e: Edges) {
  const sl = all.filter((u) => u !== t && u.line === t.line && u.x > t.x + 10);
  if (!sl.length) return;
  const r2 = Math.min(...sl.map((u) => u.x)) - PAD;
  if (r2 < e.right - 0.01) {
    e.right = r2;
    e.rightBind = sl.reduce((a, b) => (b.x < a.x ? b : a));
  }
}

/**
 * R29: a heading below the label ends the box above it: one at or left of the
 * label (a hanging label's stem margin), or centred in the column (over its
 * middle, and not starting where the lines round it start), any kind but an
 * upper-Roman line, which must stand at or left of the label itself. Only a
 * heading that ends something (headEnds), counted above this label (a bold or
 * caps one), or above a label or another such heading.
 */
function r29HeadingStops(t: Token, C: BoxColumn, e: Edges) {
  const { cx0, cx1 } = C;
  for (const h of C.heads) {
    if (h.title27 || !(C.effective(h, t) || C.headAboveToken(h) || C.headAboveHead(h))) continue;
    const hx0 = h.l.items[0].x0;
    const hx1 = last(h.l.items).x1;
    const ref = h.roman ? t.x : Math.max(t.x, t.stemX ?? t.x);
    const nb = [C.colLines[h.li - 1], C.colLines[h.li + 1]].filter(Boolean);
    const centred =
      !h.roman &&
      Math.abs((hx0 + hx1) / 2 - (cx0 + cx1) / 2) < 0.1 * (cx1 - cx0) &&
      !nb.some((l) => Math.abs(l.items[0].x0 - hx0) < 3);
    if ((hx0 <= ref + 6 || centred) && C.headEnds(h) && stopAt(t, e, { y0: h.l.y0, x0: hx0, x1: hx1 })) e.headStop = true;
  }
}

/** R27: a chapter title taken out as a label ends the box above it, wherever it stands. */
function r27TitleStops(t: Token, C: BoxColumn, e: Edges) {
  for (const h of C.heads) {
    if (h.title27 && stopAt(t, e, { y0: h.l.y0, x0: h.l.items[0].x0, x1: last(h.l.items).x1 })) e.headStop = true;
  }
}

/** R52: a "questions N-M" line ends the box above it. */
function r52StemStops(t: Token, C: BoxColumn, e: Edges) {
  for (const h of C.stemLines) stopAt(t, e, h);
}

/** R53: another run's instruction block ends the box above it. */
function r53BlockStops(t: Token, C: BoxColumn, e: Edges, r: Token[]) {
  for (const b of C.blocks) if (b.run !== r) stopAt(t, e, b);
}

/**
 * R32: a label bounds the right edge only from a line inside the box's final
 * height (a column of cells starting below it does not), and a widened edge
 * reaches only as far as the question's own text lines: lines in the box that
 * start left of the old edge, up to any other label along them.
 */
function r32RightRecompute(t: Token, C: BoxColumn, e: Edges, grid: boolean) {
  const { all, cx1, colLines } = C;
  if (!e.rightBind || e.rightBind.line.y0 < e.bottom - 0.5) return;
  const W = C.P.W;
  const ok = all.filter(
    (u) =>
      u !== t &&
      u.line.y1 > t.line.y0 &&
      u.line.y0 < e.bottom - 0.5 &&
      (u.line === t.line ? u.x > t.x + 10 : grid ? u.x > t.x + 20 && u.line.y0 < t.line.y1 : u.x > t.x + W / 4),
  );
  const nb = ok.length ? ok.reduce((a, b) => (b.x < a.x ? b : a)) : null;
  let reach = -Infinity;
  for (const L of colLines) {
    if (L.y0 < t.line.y0 - 0.5 || L.y1 > e.bottom + 0.5 || L.items[0].x0 >= e.right || last(L.items).x1 <= e.left) continue;
    const stopX = Math.min(Infinity, ...all.filter((u) => u !== t && u.line === L && u.x > t.x).map((u) => u.x));
    for (const it of L.items) if (it.x0 >= e.left - 1 && it.x0 < stopX) reach = Math.max(reach, it.x1);
  }
  const nr = Math.min(nb ? nb.x - PAD : cx1, reach + PAD);
  if (nr > e.right + 0.01) {
    e.right = nr;
    e.rightBind = nb;
  }
}

/** R32: a table's column: every label of the run level (2 pt) with another run's label. */
const r32TableColumn = (r: Token[], all: Token[]) =>
  r.every((u) => all.some((v) => !r.includes(v) && Math.abs(v.line.y0 - u.line.y0) <= 2));

/**
 * R49 (and R32's column-major cells): the last row is one row pitch tall, plus a
 * body height. Past that cap the box keeps lines of its own question (a word of
 * three letters, starting right of the label or opening a lettered part), until
 * a line at or left of the label, a label, a heading, or a blank gap of 1.5
 * body heights; it then takes the ink touching the last of them.
 */
function r49CapLastRow(t: Token, C: BoxColumn, e: Edges, pitches: number[]) {
  const { P, bodyH } = C;
  const dk = P.dark;
  const pitch = median(pitches.slice().sort((a, b) => a - b));
  let nb = t.line.y0 + pitch + bodyH;
  let lastY = t.line.y1;
  let grown = false;
  if (!(nb < e.bottom)) return;
  for (const L of C.colLines) {
    if (L.y0 <= t.line.y1 + 0.5 || !(last(L.items).x1 > e.left && L.items[0].x0 < e.right)) continue;
    if (L.y0 >= e.bottom) break;
    if (L.y0 - lastY > 1.5 * bodyH && inkCount(P, e.left, lastY + 1, e.right, L.y0 - 1, dk) < 10) break;
    lastY = L.y1;
    if (L.y1 <= nb) continue;
    if ((L.items[0].x0 <= t.x + 2 && !SUBPART.test(L.items[0].s)) || L.hasToken || C.heads.some((h) => h.l === L)) break;
    if (/[A-Za-z]{3}/.test(L.text)) {
      nb = Math.max(nb, L.y1 + 0.3 * bodyH);
      grown = true;
    }
  }
  if (grown) {
    const X0 = Math.max(0, Math.floor(e.left * S));
    const X1 = Math.min(P.cw - 1, Math.ceil(e.right * S) - 1);
    const Ye = Math.min(Math.floor(e.bottom * S), Math.ceil((nb + bodyH) * S));
    let y = Math.ceil(nb * S);
    const inked = (yy: number) => {
      for (let x = X0; x <= X1; x++) if (dk(x, yy)) return true;
      return false;
    };
    while (y < Ye && inked(y)) y++;
    nb = Math.max(nb, y / S);
  }
  if (nb < e.bottom) e.bottom = nb;
}

/**
 * R48: placed images are atomic. One straddling the bottom goes to the question
 * holding half of it or more (the bottom runs to its foot, "?" when it crosses
 * the next label; never past a heading that ended the box), or else the box
 * ends above it, unless this question's own text lies below its top. One
 * holding the label line and rising above it raises the top, not past the line
 * above. Returns whether an image is split between this box and the next.
 */
function r48AtomicImages(t: Token, C: BoxColumn, e: Edges, labelBottom: number): boolean {
  const { P, cx0, cx1 } = C;
  let split = false;
  const headStop = e.headStop ? e.bottom : Infinity;
  const ownTextBelow = (y: number) =>
    C.colLines.some(
      (L) =>
        L.y0 > y &&
        L.y1 <= e.bottom + 1 &&
        L.y0 > t.line.y1 - 0.5 &&
        !L.hasToken &&
        last(L.items).x1 > e.left &&
        L.items[0].x0 < e.right,
    );
  for (const im of P.rects) {
    if (im.x1 <= e.left || im.x0 >= e.right || im.x1 - im.x0 > 0.9 * (cx1 - cx0) || im.y1 - im.y0 < 12) continue;
    if (im.tiny) continue;
    const inside = Math.max(0, Math.min(im.y1, labelBottom) - Math.max(im.y0, t.line.y0)) / (im.y1 - im.y0);
    if (im.y0 < e.bottom && im.y1 > e.bottom) {
      if (inside >= 0.5) {
        if (im.y1 > headStop) continue;
        if (im.y1 > labelBottom && labelBottom < C.limit - 0.01) split = true;
        e.bottom = Math.max(e.bottom, Math.min(P.H, im.y1));
      } else if (im.y0 > t.line.y1 && !ownTextBelow(im.y0 - 1)) e.bottom = im.y0 - 1;
    }
    if (im.y0 < e.top && im.y1 > t.line.y0 && inside >= 0.5) {
      const prev = C.prevLine(t);
      const nt = Math.max(im.y0, prev ? prev.y1 : 0);
      if (nt < e.top - 0.01) {
        e.top = nt;
        e.topRow = Math.floor(nt * S);
        e.topBy48 = true;
      }
    }
  }
  return split;
}

/**
 * R42: a drawing that crosses the footer band is kept whole, when no footer of
 * the page's own was found: the bottom runs on while rows stay inked, up to
 * 98.5% of the page. Returns the last inked row.
 */
function r42DrawingAcrossFooter(P: Page, e: Edges, Y1: number, rowInk: (y: number) => boolean): number {
  let y = Y1 + 1;
  while (y < Math.floor(P.H * 0.985 * S) && rowInk(y)) y++;
  if (y - 1 > Y1) {
    Y1 = y - 1;
    e.bottom = Math.max(e.bottom, Y1 / S + 1);
  }
  return Y1;
}

/**
 * R47: the left edge takes ink left of the label anywhere in the question's
 * span (an outdented stem, option letters, a table's border), up to 40 pt,
 * never on another label's line or into a neighbouring cell. A row whose ink
 * runs on unbroken for 20 pt is a ruled line; a vertical rule with ink beyond
 * it, or running two body heights above and below, is a divider. Returns the
 * new left edge, or null.
 */
function r47OutdentedLeft(t: Token, C: BoxColumn, e: Edges, X0: number, X1: number, Y1: number): number | null {
  const { P, all, cx0, bodyH } = C;
  const dk = P.dark;
  let lo = Math.max(Math.floor(cx0 * S), Math.floor((t.x - 40) * S));
  if (all.some((u) => u !== t && u.x < t.x - 1 && u.line.y0 < t.line.y1 && u.line.y1 > t.line.y0)) {
    lo = Math.max(lo, Math.floor((t.x - PAD) * S));
  }
  const banned = all
    .filter((u) => u !== t)
    .map((u) => [Math.floor((u.line.y0 - bodyH) * S), Math.ceil(u.line.y1 * S)]);
  const rows: number[] = [];
  for (let y = Math.ceil(t.line.y1 * S) + 1; y <= Y1; y++) if (!banned.some(([a, b]) => y >= a && y <= b)) rows.push(y);
  const isRule = (x: number) => {
    let n = 0;
    for (const y of rows) if (dk(x, y)) n++;
    return n >= 0.8 * rows.length;
  };
  for (let x = X0 - 1; x >= lo && rows.length; x--) {
    if (!isRule(x)) continue;
    let x0r = x;
    while (x0r - 1 >= lo && isRule(x0r - 1)) x0r--; // the rule's whole width
    let beyond = false;
    for (let xx = lo; xx < x0r - 1 && !beyond; xx++) {
      for (const y of rows) {
        if (dk(xx, y)) {
          beyond = true;
          break;
        }
      }
    }
    const ya2 = Math.floor((t.line.y0 - 2 * bodyH) * S);
    const yb2 = Math.ceil(Y1 + 2 * bodyH * S);
    const pageLong = ya2 > 0 && yb2 < P.ch && dk(x, ya2) && dk(x, yb2);
    if (beyond || pageLong) lo = x + 1;
    break;
  }
  let minX = X0;
  for (const y of rows) {
    for (let x = lo; x < minX; x++) {
      if (!dk(x, y)) continue;
      let run = x;
      while (run < X1 && dk(run + 1, y)) run++;
      if (run - x < 20 * S) minX = x;
      break;
    }
  }
  if (minX < X0) {
    const nl = Math.max(cx0, minX / S - PAD);
    if (nl < e.left - 0.01) return nl;
  }
  return null;
}

/**
 * R45: the top takes ink rising straight from the label line's own text (a
 * numerator, a radical's bar), over blank gaps of up to 2 pt, up to a body
 * height and the foot of the line above, then up to 4 pt of blank rows,
 * stopping at any ink or ruled row. A climb over a gap that runs on to that
 * floor reached the foot of something above (an icon, a table row, a heading):
 * that bridge is undone. Moves under 1 pt keep v1's top. Returns the new top's
 * pixel row, or null.
 */
function r45RaisedTop(t: Token, C: BoxColumn, e: Edges, XL: number, X1: number): number | null {
  const { P, bodyH } = C;
  const dk = P.dark;
  const textX1 = Math.max(...t.line.items.map((i) => i.x1));
  const XE = Math.min(X1, Math.ceil((textX1 + PAD) * S));
  const ya = Math.max(0, Math.floor((t.line.y0 - bodyH) * S));
  const yb = Math.ceil(t.line.y1 * S);
  // Vertical rules: a column inked from a body height above the line to its foot.
  const vert = new Uint8Array(XE + 1);
  for (let x = XL; x <= XE; x++) {
    let n = 0;
    for (let y = ya; y <= yb; y++) if (dk(x, y)) n++;
    if (n >= 0.9 * (yb - ya + 1)) vert[x] = 1;
  }
  // A run of 20 to 60 pt just over the label line, starting inside its text and
  // ending within 6 pt of its end (a radical's bar), is not a ruled line.
  const textEnd = Math.ceil((textX1 + 6) * S);
  const barY = Math.floor((t.line.y0 - 0.3 * bodyH) * S);
  const ruled = (y: number) => {
    let run = 0;
    for (let x = XL; x <= XE + 1; x++) {
      if (x <= XE && dk(x, y)) {
        run++;
        continue;
      }
      if (run >= 20 * S) {
        let end = x - 1;
        while (end + 1 < P.cw && end < textEnd + 4 * S && dk(end + 1, y)) end++;
        if (!(y >= barY && x - run > XL + 2 && end <= textEnd && end - (x - run) < 60 * S)) return true;
      }
      run = 0;
    }
    return false;
  };
  const rowHas = (y: number) => {
    if (ruled(y)) return true;
    for (let x = XL; x <= XE; x++) if (!vert[x] && dk(x, y)) return true;
    return false;
  };
  const prev = C.prevLine(t, 0.3 * bodyH);
  const cap = prev ? Math.ceil(prev.y1 * S) : 0;
  let raised = Math.floor(t.line.y0 * S);
  let y = raised - 1;
  const maxRaise = Math.floor((t.line.y0 - bodyH) * S);
  const floorY = Math.max(cap, maxRaise, 0);
  const guard = prev ? Math.ceil((prev.y1 + 0.3 * bodyH) * S) : 0;
  let beforeBridge: number | null = null;
  for (;;) {
    while (y > floorY && rowHas(y) && !ruled(y)) {
      raised = y;
      y--;
    }
    if (y <= floorY || ruled(y)) {
      if (beforeBridge != null) raised = beforeBridge;
      break;
    }
    let y2 = -1;
    for (let k = 1; k <= 2 * S; k++) {
      const yy = y - k;
      if (yy <= Math.max(floorY, guard) || ruled(yy)) break;
      if (rowHas(yy)) {
        y2 = yy;
        break;
      }
    }
    if (y2 < 0) break;
    beforeBridge = raised;
    y = y2;
  }
  let tr = raised;
  for (let k = 1; k <= PAD * S; k++) {
    const yy = raised - k;
    if (yy <= Math.max(cap, 0) - 1 || yy < 0 || rowHas(yy)) break;
    tr = yy;
  }
  const nt = Math.min(tr / S, t.line.y0);
  if (Math.abs(nt - e.top) >= 1 && !e.topBy48 && !e.topBy50) {
    e.top = nt;
    return tr;
  }
  return null;
}

/**
 * R46: neighbouring boxes never overlap. For a question and the next one down
 * in the same label column (labels within 20 pt), overlapping boxes split the
 * gap between the upper one's last ink row and the lower one's first in the
 * middle; if the inks touch, the upper bottom stops at the lower top.
 */
function r46NoOverlap(props: Prop[]) {
  for (const b of props) {
    for (const a of props) {
      if (a === b || a.box[1] >= b.box[1] || a.box[3] <= b.box[1]) continue;
      if (a.box[2] <= b.box[0] || b.box[2] <= a.box[0]) continue;
      if (Math.abs(a.t!.x - b.t!.x) > 20 || b.t!.line.y0 < a.t!.line.y1) continue;
      const ia = a.real!.inkBottom;
      const ib = b.real!.inkTop;
      if (!Number.isFinite(ib)) continue;
      if (ia < ib) {
        const m = (ia + ib) / 2;
        if (a.box[3] > m) a.box[3] = Math.max(ia + 0.5, m);
        if (b.box[1] < m) b.box[1] = Math.min(ib - 0.5, m);
      } else a.box[3] = b.box[1];
    }
  }
}

/**
 * R37: "?" on a box holding a numbered list that was dropped as nested, except
 * a matching exercise (every dropped label level with a lettered item) and a
 * list set inside a paragraph (prose at the list's own x just above and below).
 */
function r37HoldsDroppedList(dropped: Token[][], props: Prop[], colLines: Line[], heads: Head[]) {
  for (const d of dropped) {
    const f = d[0];
    if (d.every((u) => u.line.items.some((it) => it !== u.item && /^\(?[A-Za-z][.)](?:\s|$)/.test(it.s)))) continue;
    const prose = (l: Line | undefined) =>
      !!l && !l.hasToken && Math.abs(l.items[0].x0 - f.x) < 3 && /[A-Za-z]{3}/.test(l.text) && !heads.some((h) => h.l === l);
    if (prose(colLines[f.li - 1]) && prose(colLines[last(d).li + 1])) continue;
    const host = props.find((q) => q.box[1] <= f.line.y0 && q.box[3] >= f.line.y0 && q.box[0] <= f.x + 1 && q.box[2] > f.x);
    if (host) (host.why ??= []).push(HOLDS_LIST);
  }
}

/**
 * R67: two questions' boxes that overlap by more than 3 pt each way, not cells
 * of a grid, are each one to check: one runs into the other's column or lines
 * (IGCSE CIM Book 1 p. 18, whose Q7 ran across three columns).
 */
function r67Overlaps(props: Prop[]) {
  const qs = props.filter((q) => q.type === "question" && !q.grid);
  const over = (a: Prop, b: Prop) =>
    Math.min(a.box[2], b.box[2]) - Math.max(a.box[0], b.box[0]) > 3 &&
    Math.min(a.box[3], b.box[3]) - Math.max(a.box[1], b.box[1]) > 3;
  for (const a of qs) if (qs.some((b) => b !== a && over(a, b))) (a.why ??= []).push(OVERLAPS);
}

/**
 * R68: a box that holds its number and nothing else, one line tall and no wider
 * than its label: the question's text is elsewhere or not in the PDF (IGCSE CIM
 * Book 1 p. 18's Q16).
 */
function r68OnlyNumber(props: Prop[]) {
  for (const q of props) {
    const t = q.t;
    if (q.type !== "question" || !t || !/^\(?(?:Q|EX)?\s*\d{1,3}\s*[.):]?\)?$/i.test(t.item.s.trim())) continue;
    if (q.box[2] - q.box[0] <= t.item.x1 - t.item.x0 + 2 * PAD + 6 && q.box[3] - q.box[1] <= t.line.y1 - t.line.y0 + 2 * PAD + 2) {
      (q.why ??= []).push(ONLY_NUMBER);
    }
  }
}

// --- the page's frame: answers, footer, cover, columns ------------------------------

/**
 * R41: the page's own footer: the lowest line in the bottom 12% that is a page
 * number with nothing below it (not one in a figure: inside a placed image, or
 * with drawn ink more than 2 pt clear of it on its band), or a page frame's
 * bottom rule (side rules end on it, starting in the top 12% and above the first
 * label line), whichever is higher. Returns the limit, or null.
 */
function r41PageFooter(P: Page, lines: Line[]): number | null {
  const low = lines.filter((l) => l.y0 > P.H * 0.88);
  const inFigure = (l: Line) => {
    const x0 = l.items[0].x0;
    const x1 = last(l.items).x1;
    if (P.rects.some((r) => x0 >= r.x0 - 1 && x1 <= r.x1 + 1 && l.y0 >= r.y0 - 1 && l.y1 <= r.y1 + 1)) return true;
    const X0 = Math.max(0, Math.floor((l.items[0].x0 - 12) * S));
    const X1 = Math.min(P.cw - 1, Math.ceil((last(l.items).x1 + 12) * S));
    const Y0 = Math.floor((l.y0 - 1) * S);
    const Y1 = Math.min(P.ch - 1, Math.ceil((l.y1 + 0.3 * (l.y1 - l.y0) + 1) * S));
    let n = 0;
    for (let y = Y0; y <= Y1; y++) {
      for (let x = X0; x <= X1; x++) {
        if (P.dark(x, y) && !l.items.some((it) => x >= (it.x0 - 2) * S && x <= (it.x1 + 2) * S)) n++;
      }
    }
    return n >= 6;
  };
  let foot: number | null = null;
  const pns = low.filter((l) => PAGE_NO.test(l.text.trim()) && !inFigure(l));
  const pn = pns.length ? last(pns) : null;
  if (pn && !lines.some((l) => l !== pn && l.y0 > pn.y1)) foot = pn.y0 - 1;
  if (P.frame) {
    const frame = P.frame;
    const firstLab = lines.find((l) => FIRST.test(l.items[0].s) || FIRST_MERGED.test(l.items[0].s));
    const pageFrame = (y: number) =>
      frame.spans.some(
        (sp) => sp.top <= P.ch * 0.12 && (!firstLab || sp.top < firstLab.y0 * S) && Math.abs(sp.bot - y) <= 3 * S,
      );
    let ry = -1;
    for (let y = Math.ceil(P.ch * 0.9); y < P.ch; y++) {
      if (frame.row[y] && pageFrame(y)) {
        ry = y;
        break;
      }
    }
    if (ry >= 0) {
      const v = ry / S - 1;
      if (foot === null || v < foot) foot = v;
    }
  }
  return foot;
}

/**
 * R42: with no footer of the page's own, the footer band never cuts a line: a
 * line starting above the band with its baseline in it, or carrying the text on
 * into it, moves the band below it.
 */
function r42WholeLines(lines: Line[], foot: number, bodyH: number): number {
  for (const l of lines) if (l.y0 < foot && l.y1 + bodyH * 0.3 > foot) foot = Math.max(foot, l.y1 + bodyH * 0.5);
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].y1 > foot && lines[i].y0 - lines[i - 1].y1 < bodyH && lines[i - 1].y0 < foot) {
      foot = Math.max(foot, lines[i].y1 + bodyH * 0.5);
    }
  }
  return foot;
}

/**
 * R43: footer furniture ends the questions above it: a line in the bottom 15%
 * repeated at one height on half the pages, or "turn over", "continues on the
 * next page", "do not extend your answer", "end of paper". Returns the limit, or null.
 */
function r43FooterFurniture(P: Page, lines: Line[], foot: number): number | null {
  const rx =
    /^(?:please\s+)?turn over\b|^p\.?t\.?o\.?$|continues on the next page|do not extend your answer|^end(?: of (?:paper|test|exam))?$/i;
  let found: number | null = null;
  for (const l of lines) {
    if (l.y0 < P.H * 0.85) continue;
    const t = l.text.trim();
    if ((repeatedOnHalf(P.file, l) || (t.length < 60 && rx.test(t))) && l.y0 - 1 < foot) {
      foot = l.y0 - 1;
      found = foot;
    }
  }
  return found;
}

/** v1: a cover, a "Name:" line and a "School:" line. It holds a contents list and rules for students, never a question. */
const isCover = (lines: Line[]) =>
  lines.some((l) => /^name\s*:/i.test(l.text)) && lines.some((l) => /^school\s*:/i.test(l.text));

/**
 * R7: a Name/School test header (with a SCORE, START/END TIME, MAX TIME or
 * DURATION field) heads a question page, not a cover. Returns the header's
 * foot, below which labels are read, or null.
 */
function r7TestHeader(P: Page, lines: Line[]): number | null {
  const fields =
    /^(?:name|school|score|grade|date|class|section|start\s*time|end\s*time|max(?:imum)?\s*time|duration|time\s*(?:allowed|taken)?|marks?|total)\b[^:]{0,20}:/i;
  const hdr = lines.filter(
    (l) =>
      l.y0 < P.H * 0.4 &&
      (fields.test(l.text) || /\b(?:score|start\s*time|end\s*time|max(?:imum)?\s*time|duration)\s*:/i.test(l.text)),
  );
  if (!hdr.some((l) => /\b(?:score|start\s*time|end\s*time|max(?:imum)?\s*time|duration)\b/i.test(l.text))) return null;
  return Math.max(...hdr.map((l) => l.y1));
}

/** R8: a Contents or Index page proposes nothing. */
const r8Contents = (lines: Line[]) => lines.some((l) => /^(?:table of )?contents$|^index$/i.test(l.text.trim()));

/** R38: the gutter is the centre of the widest run of empty bins inside v1's sparse band. */
function r38WidestEmptyRun(bins: number[], band: [number, number], g: number, W: number): number {
  let z: [number, number] | null = null;
  for (let k = band[0]; k <= band[1]; k++) {
    if (bins[k] !== 0) continue;
    let j = k;
    while (j + 1 <= band[1] && bins[j + 1] === 0) j++;
    if (!z || j - k > z[1] - z[0]) z = [k, j];
    k = j;
  }
  return z ? ((z[0] + z[1] + 1) / 2 / 100) * W : g;
}

/** R40: a drawn divider (R44's page-long rule) inside the 30-70% band is the gutter. */
function r40Divider(P: Page, g: number): number {
  if (!P.frame) return g;
  const cand: number[] = [];
  for (let x = Math.floor(P.W * 0.3 * S); x <= Math.ceil(P.W * 0.7 * S); x++) if (P.frame.col[x]) cand.push(x);
  if (!cand.length) return g;
  const gx = median(cand) / S;
  return Math.abs(gx - g) > 0.5 ? gx : g;
}

/**
 * R39: no gutter through a placed figure (under 60% of the page wide: not a
 * background), nor between a table's columns: 70% of 3 or more left labels
 * level with a right one, the right side neither continuing the left nor
 * restarting at 1.
 */
function r39GutterRefused(P: Page, items: Item[], g: number, limit: number, bodyH: number): boolean {
  const W = P.W;
  const crossed = P.rects.some((r) => r.x0 < g - 2 && r.x1 > g + 2 && r.y1 - r.y0 > 12 && r.x1 - r.x0 < 0.6 * W);
  const L = runsOf(bodyLines(items.filter((i) => i.x1 <= g + 1), bodyH), limit, bodyH, P, [0, g]).kept.flat();
  const R = runsOf(bodyLines(items.filter((i) => i.x0 >= g - 1), bodyH), limit, bodyH, P, [g, W]).kept.flat();
  const level = L.filter((a) =>
    R.some((b) => Math.abs((a.line.y0 + a.line.y1) / 2 - (b.line.y0 + b.line.y1) / 2) < bodyH * 0.5),
  ).length;
  const lastL = Math.max(...L.map((t) => t.n));
  const firstR = Math.min(...R.map((t) => t.n));
  const table = L.length >= 3 && level >= 0.7 * L.length && firstR !== lastL + 1 && firstR !== 1;
  return crossed || table;
}

/**
 * R40: the left column's right edge covers its own text: a body line inside the
 * questions' span that starts in it and runs past the gutter into blank space,
 * never past the right column's first label or onto its text. Returns the edge, or null.
 */
function r40LeftColumnEdge(P: Page, items: Item[], g: number, limit: number, bodyH: number): number | null {
  const W = P.W;
  const rightItems = items.filter((i) => i.x0 >= g - 1);
  const rLab = runsOf(bodyLines(rightItems, bodyH), limit, bodyH, P, [g, W]).kept.flat();
  const rx = rLab.length ? Math.min(...rLab.map((t) => t.x)) - PAD : g + 0.25 * W;
  const y0q = Math.min(
    ...runsOf(bodyLines(items.filter((i) => i.x1 <= g + 1), bodyH), limit, bodyH, P, [0, g])
      .kept.flat()
      .map((t) => t.line.y0),
  );
  const own = items.filter(
    (i) =>
      i.x0 < g - 1 &&
      i.x1 > g + 1 &&
      i.x1 < rx &&
      i.y0 >= y0q - 1 &&
      !rightItems.some((o) => o.x0 < i.x1 + 2 && o.y1 > i.y0 - 1 && o.y0 < i.y1 + 1),
  );
  return own.length ? Math.min(rx, Math.max(...own.map((i) => i.x1)) + 1) : null;
}

/**
 * The page's columns, as [left, right] in points: v1's gutter (an empty band in
 * the middle 30-70% of the width, with a run of two or more on each side), with
 * R38-R40. The left column's right edge comes back too, when R40 moved it.
 */
function columnsOf(
  P: Page,
  items: Item[],
  limit: number,
  bodyH: number,
): { columns: [number, number][]; colRight0: number | null } {
  const W = P.W;
  const bins = new Array<number>(100).fill(0);
  for (const it of items) {
    for (let k = Math.floor((it.x0 / W) * 100); k <= Math.min(99, Math.floor((it.x1 / W) * 100)); k++) bins[k]++;
  }
  const tol = Math.max(1, items.length * 0.03);
  let band: [number, number] | null = null;
  for (let k = 30; k <= 70; k++) {
    if (bins[k] > tol) continue;
    let j = k;
    while (j + 1 <= 70 && bins[j + 1] <= tol) j++;
    if (!band || j - k > band[1] - band[0]) band = [k, j];
    k = j;
  }
  if (!band) return { columns: [[0, W]], colRight0: null };
  let g = ((band[0] + band[1] + 1) / 2 / 100) * W;
  g = r38WidestEmptyRun(bins, band, g, W);
  g = r40Divider(P, g);
  const side = (keep: (i: Item) => boolean) =>
    runsOf(bodyLines(items.filter(keep), bodyH), limit, bodyH, P, [0, W]).kept.some((r) => r.length >= 2);
  let ok = side((i) => i.x1 <= g + 1) && side((i) => i.x0 >= g - 1);
  if (ok && r39GutterRefused(P, items, g, limit, bodyH)) ok = false;
  if (!ok) return { columns: [[0, W]], colRight0: null };
  return {
    columns: [
      [0, g],
      [g, W],
    ],
    colRight0: r40LeftColumnEdge(P, items, g, limit, bodyH),
  };
}

// --- shared boxes (R50, R52, R53) ---------------------------------------------------

/**
 * R50: a line just above a label holding only "(3)", "2 marks" or "(2 marks)",
 * in the column's right third and nearer the label than the line above it, is
 * that question's first line. ("[4]" closes the part above, in IB and Cambridge papers.)
 */
function r50MarksLines(all: Token[], colLines: Line[], cx0: number, cx1: number) {
  for (const t of all) {
    const a = colLines[t.li - 1];
    const b = colLines[t.li - 2];
    if (!a || a.hasToken) continue;
    const s = a.text.trim();
    if (!/^(?:\(\d{1,2}\)|\(?\d{1,2}\s*marks?\)?)$/i.test(s) || a.items[0].x0 < cx0 + ((cx1 - cx0) * 2) / 3) continue;
    const gapBelow = t.line.y0 - a.y1;
    const gapAboveA = b ? a.y0 - b.y1 : Infinity;
    if (gapBelow < gapAboveA) t.markLine = a;
  }
}

/** R52: label-free lines naming the questions a stimulus serves ("Use the graph for questions 5-9"). */
function r52StemLines(colLines: Line[]): StemLine[] {
  const out: StemLine[] = [];
  for (const l of colLines) {
    if (l.hasToken) continue;
    const s = l.text.trim();
    for (const rx of STEM_RANGE) {
      const m = s.match(rx);
      if (!m) continue;
      const a = +m[1];
      const b = m[2] ? +m[2] : a;
      if (b >= a && b - a < 40) {
        out.push({ l, y0: l.y0, x0: l.items[0].x0, x1: last(l.items).x1, from: a, to: b });
        break;
      }
    }
  }
  return out;
}

/**
 * R53 (i): up to 6 label-free lines directly above the first label of a run of
 * two or more (from 1, or under a heading), at the margin, after a gap, a
 * heading or the page top: an instruction block, the run's shared stem.
 */
function r53Blocks(
  P: Page,
  kept: Token[][],
  colLines: Line[],
  heads: Head[],
  stemLines: StemLine[],
  bodyH: number,
): Block[] {
  const blocks: Block[] = [];
  for (const r of kept) {
    const t0 = r[0];
    if (r.length < 2) continue;
    let i = t0.li - 1;
    let n = 0;
    const blk: Line[] = [];
    while (i >= 0 && n < 6) {
      const l = colLines[i];
      if (
        l.hasToken ||
        heads.some((h) => h.l === l) ||
        isFurniture(P, l) ||
        l.y1 < P.H * 0.06 ||
        stemLines.some((h) => h.l === l)
      ) {
        break;
      }
      const below = blk.length ? blk[0] : t0.line;
      if (below.y0 - l.y1 >= bodyH) break;
      blk.unshift(l);
      n++;
      i--;
    }
    if (!blk.length) continue;
    const above = colLines[i];
    const headAbove = !!above && heads.some((h) => h.l === above);
    const gapOk =
      !above || headAbove || isFurniture(P, above) || above.y1 < P.H * 0.06 || blk[0].y0 - above.y1 > 1.2 * bodyH;
    if (!gapOk || blk[0].items[0].x0 > t0.x + 6) continue;
    if (t0.n !== 1 && !headAbove) continue;
    blocks.push({
      run: r,
      y0: blk[0].y0,
      x0: Math.min(...blk.map((l) => l.items[0].x0)),
      x1: Math.max(...blk.map((l) => last(l.items).x1)),
      y1: t0.line.y0 - 1,
      lines: blk,
    });
  }
  return blocks;
}

/** R52 and R53 (i): each "questions N-M" line, and each instruction block, as a stem box down to its first question. */
function r52r53Stems(P: Page, c: Column): Prop[] {
  const out: Prop[] = [];
  for (const h of c.stemLines) {
    const below = c.all.filter((u) => u.line.y0 > h.y0).sort((a, b) => a.line.y0 - b.line.y0);
    const first = below.find((u) => u.n === h.from) || below[0];
    const bx = inkBox(P, c.cx0, h.y0 - PAD, c.cx1, first ? first.line.y0 - 1 : c.limit);
    if (bx) out.push({ type: "stem", n: h.from, grid: false, box: bx, col: c.ci, forRange: [h.from, h.to] });
  }
  for (const b of c.blocks) {
    const bx = inkBox(P, c.cx0, b.y0 - PAD, c.cx1, b.y1);
    if (bx) out.push({ type: "stem", n: b.run[0].n, grid: false, box: bx, col: c.ci, forList: b.run.map((u) => u.n) });
  }
  return out;
}

/**
 * R53 (ii): a "Model N" or "Read this" heading is a context box down to the
 * first label below it, for every following question until the next Model
 * heading, a run restarting at 1, or a new sheet (a Name: line).
 */
function r53Contexts(P: Page, lines: Line[], colInfo: Column[]): Prop[] {
  const out: Prop[] = [];
  if (lines.some((l) => l.y0 < P.H * 0.2 && NAME_LINE.test(l.text.trim()))) {
    P.file.model = null;
    P.modelReset = true;
  }
  for (const c of colInfo) {
    for (const h of c.heads) {
      if (!/^(?:Model\s+\d+|Read (?:this|the passage))\b/i.test(h.l.text.trim())) continue;
      const nextTok = c.kept
        .flat()
        .filter((u) => u.line.y0 > h.l.y1)
        .sort((a, b) => a.line.y0 - b.line.y0)[0];
      const bx = inkBox(P, c.cx0, h.l.y0 - PAD, c.cx1, nextTok ? nextTok.line.y0 - 1 : c.limit);
      if (!bx) continue;
      const label = h.l.text.trim();
      const ctx: Prop = { type: "context", n: 0, grid: false, box: bx, col: c.ci, for: [], label, page: P.p, sections: [] };
      out.push(ctx);
      P.file.model = ctx;
    }
  }
  return out;
}

/**
 * R53 (ii): each question goes to the last context above it on its page, or else
 * the one carried from before. A run restarting at 1 ends it, and so does a
 * section heading after it, or a question under a heading (R29) none of its
 * earlier questions sat under (Accel Bio unit 1 p. 18's "Fill in the Venn").
 */
function r53ContextFor(P: Page, qs: Prop[], proposals: Prop[], carried: Prop | null) {
  const ctxs = proposals
    .filter((x) => x.type === "context" && x.page === P.p)
    .sort((a, b) => a.col - b.col || a.box[1] - b.box[1]);
  for (const q of qs) {
    const here = ctxs.filter((c) => c.col < q.col || (c.col === q.col && c.box[1] <= q.box[1]));
    const ctx = here.length ? last(here) : P.modelReset ? null : carried;
    if (!ctx || ctx.closed) continue;
    const from = { page: ctx.page!, col: ctx.col, y: ctx.box[3] };
    const newSection = !!q.section && ctx.for!.length > 0 && !ctx.sections!.includes(q.section);
    if ((q.n === 1 && ctx.for!.length) || newSection || headingBetween(P.file, from, { page: P.p, col: q.col, y: q.box[1] })) {
      ctx.closed = true;
      continue;
    }
    ctx.for!.push({ page: P.p, n: q.n });
    if (q.section) ctx.sections!.push(q.section);
  }
  const lastCtx = ctxs.length ? last(ctxs) : P.modelReset ? null : carried;
  P.file.model = lastCtx && !lastCtx.closed ? lastCtx : null;
}

// --- continuations (R51) --------------------------------------------------------

/** R51: below a thin rule (2 pt or less, half the column wide) at a region's top, 2 pt of blank under it: the real top. */
function r51SkipTopRule(P: Page, x0: number, y0: number, x1: number, y1: number): number {
  const X0 = Math.max(0, Math.floor(x0 * S));
  const X1 = Math.min(P.cw - 1, Math.ceil(x1 * S) - 1);
  const rowInk = (y: number) => {
    let n = 0;
    let run = 0;
    let best = 0;
    for (let x = X0; x <= X1; x++) {
      if (P.dark(x, y)) {
        n++;
        run++;
        best = Math.max(best, run);
      } else run = 0;
    }
    return { n, best };
  };
  let y = Math.floor(y0 * S);
  const Y1 = Math.floor(y1 * S);
  while (y < Y1 && rowInk(y).n === 0) y++;
  let r = y;
  while (r < Y1 && rowInk(r).best >= 0.5 * (X1 - X0)) r++;
  if (r === y || r - y > 2 * S) return y0;
  let b = r;
  while (b < Y1 && rowInk(b).n === 0) b++;
  return b - r >= 2 * S ? b / S : y0;
}

/**
 * R51: the question left open at the foot of the previous page (or of the left
 * column) continues here: the ink above the first label, or the whole page if it
 * has none, is its next box, with "?". Only when the question's ink reached the
 * foot, or the block opens on a bare sub-part at its label's x, or the page
 * says it continues; never when the block opens on a heading, a short centred
 * title, a source tag, a "questions N-M" line, an answers line, an unfound
 * label, a stem line just above a lone label, or a lone Title Case line just
 * above the first label. It ends at a heading that ends something, a source
 * tag (below it), an unfound label, a stem line or an instruction block.
 */
function r51Continuation(P: Page, kind: PageKind, colInfo: Column[], lines: Line[], proposals: Prop[]) {
  const st = P.file;
  const bodyH = P.bodyH;
  // Top-band text is furniture only as a page number or a line repeated on half the pages.
  const furn = (l: Line) =>
    isFurniture(P, l) || (l.y1 <= P.H * 0.06 && (PAGE_NO.test(l.text.trim()) || repeatedOnHalf(st, l)));
  const first = lines.find((l) => !furn(l));
  const marked =
    !!first &&
    /\bcontinued\b/i.test(first.text) &&
    /\b(?:FRQ|Exercise|Section|Prompt|Question|Sample|Your Response)\b/i.test(first.text);
  if (!st.open && marked && st.lastQ) st.open = { page: st.lastQ.page, n: st.lastQ.n, boxes: 1, full: true };
  const add = (open: Open | null, bx: number[] | null, col: number) => {
    if (!open || open.boxes >= 4 || !bx || bx[3] - bx[1] < (bodyH || 8)) return;
    open.boxes++;
    proposals.push({
      type: "continuation",
      n: open.n,
      grid: false,
      box: bx,
      col,
      for: [{ page: open.page, n: open.n }],
      boxNo: open.boxes,
      why: [CONTINUES],
    });
  };
  if (kind === "none" || kind === "blank" || !colInfo.length) {
    if (st.open && st.open.full && (kind === "none" || (kind === "digital" && !colInfo.length))) {
      add(st.open, inkBox(P, 0, P.H * 0.06, P.W, P.H * 0.94), 0);
    }
    return;
  }
  colInfo.forEach((c, i) => {
    const left = i === 0 ? undefined : lastQuestion(colInfo[0]);
    const open = i === 0 ? st.open : left ? r51OpenQuestion(left, colInfo[0], P.p) : null;
    if (!open) return;
    const toks = c.kept.flat().sort((a, b) => a.line.y0 - b.line.y0);
    const firstTok = toks[0] as Token | undefined;
    const own = c.colLines.filter((l) => !furn(l));
    const body = own.filter((l) => !firstTok || l.y1 <= firstTok.line.y0);
    if (!body.length && firstTok) return;
    const b0 = body[0] as Line | undefined;
    const marginX = own.length ? Math.min(...own.map((l) => l.items[0].x0)) : c.cx0;
    // An unfound label: a number at the margin then words ("22. Find", "7 Which"),
    // alone with its stop hanging left of the next line's text ("29."), or a bold
    // one with the next number further along its line ("18 y 19 y").
    const unfound = (l: Line) => {
      const m = l.items[0].x0 <= marginX + 6 && l.items[0].s.match(/^(\d{1,3})[.)]?(?:\s|$)/);
      if (!m) return false;
      const nx = own[own.indexOf(l) + 1];
      const alone = l.items.length === 1 && /^\d{1,3}[.)]$/.test(l.items[0].s);
      if (alone && nx && nx.items[0].x0 >= l.items[0].x1 + 6) return true;
      if (/[A-Za-z]{3}/.test(l.text.replace(/^\s*\d{1,3}[.)]?/, ""))) return true;
      return !!l.items[0].bold && l.items.slice(1).some((it) => new RegExp(`^${+m[1] + 1}[.)]?$`).test(it.s));
    };
    // A centred title: centred to 5% of the column, starting where the next line
    // does not, on no part or option letter, not ending in a part's marks.
    const centredTitle = (l: Line) => {
      const t = l.text.trim();
      const a = l.items[0].x0;
      const b = last(l.items).x1;
      if (
        !(
          t.length <= 60 &&
          /[A-Za-z]{3}/.test(t) &&
          Math.abs((a + b) / 2 - (c.cx0 + c.cx1) / 2) < 0.05 * (c.cx1 - c.cx0) &&
          a > marginX + 2 * (bodyH || 10)
        )
      ) {
        return false;
      }
      const nx = own[own.indexOf(l) + 1];
      return (
        !(nx && Math.abs(nx.items[0].x0 - a) < 3) &&
        !SUBPART.test(l.items[0].s) &&
        !BARE_SUB.test(l.items[0].s) &&
        !/^\(?[A-E][.)]$|^\(?[A-E][.)]\s/.test(l.items[0].s) &&
        !ENDS_MARKS.test(t)
      );
    };
    // A caption ("Fig. 1.2", "Extract 2", "Table 1") belongs to the material it heads.
    const caption = (l: Line) => /^(?:fig(?:ure)?|table|extract|source|graph|diagram|chart|photo)\b/i.test(l.text.trim());
    const titleLike = (l: Line) =>
      !marksLine(l.text.trim()) &&
      !caption(l) &&
      (SOURCE_TAG.test(l.text.trim()) || c.heads.some((h) => h.l === l) || centredTitle(l));
    // The opener: the first line of words that is not a caption (a figure and its caption may come first).
    const opener = body.find((l) => /[A-Za-z]{3}/.test(l.text) && !caption(l)) || b0;
    const it0 = opener ? opener.items[0] : undefined;
    const part =
      !!opener &&
      !!it0 &&
      (SUBPART.test(it0.s) ||
        (BARE_SUB.test(it0.s) && (open.x == null || Math.abs(it0.x0 - open.x) <= 8 || it0.x0 <= marginX + 2)) ||
        (b0 !== opener && !!b0 && SUBPART.test(b0.items[0].s)));
    if (!open.full && !part && !marked) return;
    if (b0) {
      // A source tag heading the page belongs to the open question when its own text follows.
      const tagOpens = SOURCE_TAG.test(b0.text.trim()) && !!body[1] && !titleLike(body[1]) && !unfound(body[1]);
      const isHead =
        ((titleLike(b0) && !tagOpens) ||
          c.heads.some((h) => h.l !== b0 && h.l.y0 < b0.y1 + 0.5 * (bodyH || 10) && h.l.y1 > b0.y0 && titleLike(h.l))) &&
        !marked;
      const isStem =
        c.stemLines.some((h) => h.l === b0) ||
        c.blocks.some((b) => b.lines.includes(b0)) ||
        /\bquestions?\s*\(?\d{1,3}\s*(?:-|–|—|to)\s*\d{1,3}/i.test(b0.text);
      const isAns = ANSWERS.test(b0.text.trim()) || ANSWERS_V.test(b0.text.trim());
      // One line just above a label standing alone on its line is that label's own stem.
      const ownStem =
        body.length === 1 &&
        !!firstTok &&
        firstTok.line.items.length === 1 &&
        firstTok.line.y0 - b0.y1 < (bodyH || 10) &&
        b0.items[0].x0 > firstTok.x;
      // A lone Title Case line straight above the first label titles that label's section.
      const words = b0.text
        .trim()
        .split(/\s+/)
        .filter((w) => /^[A-Za-z]{3,}/.test(w));
      const lonelyTitle =
        body.length === 1 &&
        !!firstTok &&
        firstTok.line.y0 - b0.y1 < 2 * (bodyH || 10) &&
        b0.text.trim().length <= 50 &&
        words.length >= 2 &&
        words.every((w) => /^[A-Z]/.test(w)) &&
        !/[.?:;,]$/.test(b0.text.trim()) &&
        !ENDS_MARKS.test(b0.text.trim()) &&
        !SUBPART.test(b0.items[0].s);
      if (isHead || isStem || isAns || ownStem || lonelyTitle || unfound(b0)) return;
    }
    // It starts at the first ink under the running header (a figure above the
    // first text line is in it), never inside a text line, never on the header's rule.
    const hdr = c.colLines.filter((l) => furn(l) && (!b0 || l.y1 <= b0.y0));
    let y0 = b0 ? b0.y0 - PAD : P.H * 0.06;
    y0 = Math.min(y0, hdr.length ? Math.max(...hdr.map((l) => l.y1 + 0.3 * (l.y1 - l.y0))) + 1 : P.H * 0.06);
    let y1 = firstTok ? firstTok.line.y0 - PAD : c.limit;
    for (const l of own) {
      if (l === b0 || !(l.y0 > y0 + PAD && l.y0 < y1)) continue;
      if (/\bcontinued\b/i.test(l.text)) continue; // "(Continued in next page…)" ends nothing
      const h = c.heads.find((g) => g.l === l);
      const ends = h
        ? !marksLine(l.text.trim()) && (strongHead(h) || (!!firstTok && c.effective(h, firstTok)) || r29HeadEnds(h, c))
        : SOURCE_TAG.test(l.text.trim()) || unfound(l);
      // A source tag closes the question: the box ends below it.
      if (ends && !h && SOURCE_TAG.test(l.text.trim())) {
        y1 = Math.min(y1, l.y1 + 0.3 * (l.y1 - l.y0) + 1);
        break;
      }
      if (ends) {
        y1 = l.y0 - 1;
        break;
      }
    }
    for (const h of c.stemLines) if (h.y0 > y0 + PAD && h.y0 < y1) y1 = h.y0 - 1;
    for (const b of c.blocks) if (b.y0 > y0 + PAD && b.y0 < y1) y1 = b.y0 - 1;
    let bx = inkBox(P, c.cx0, y0, c.cx1, y1);
    if (bx) {
      const top = r51SkipTopRule(P, c.cx0, bx[1] + PAD, c.cx1, y1);
      if (top > bx[1] + PAD + 0.5) bx = inkBox(P, c.cx0, top, c.cx1, y1);
    }
    if (bx) {
      for (const l of c.colLines) {
        if (bx[1] > l.y0 + 0.5 && bx[1] < l.y1 - 0.5) {
          bx = furn(l)
            ? inkBox(P, c.cx0, l.y1 + 0.3 * (l.y1 - l.y0) + 1, c.cx1, y1)
            : [bx[0], Math.max(0, l.y0 - PAD), bx[2], bx[3]];
          break;
        }
      }
    }
    add(open, bx, c.ci);
  });
}

/** A column's last question, top to bottom. */
function lastQuestion(c: Column): Prop | undefined {
  const qs = c.props.filter((q) => q.type === "question").sort((a, b) => a.box[1] - b.box[1]);
  return qs.length ? last(qs) : undefined;
}

/** R51: a column's last question is open when no label below it ended its box; full when its ink reached the foot. */
function r51OpenQuestion(q: Prop, c: Column, page: number): Open | null {
  return q.real!.capByLimit ? { page, n: q.n, boxes: 1, full: q.box[3] >= c.limit - 25, x: q.t!.x } : null;
}

/**
 * R29: a heading ends the box above it unless the first line after it, before
 * the next heading or the column's end, opens a lettered part or is a table row:
 * then it is the question's own sub-heading or table header.
 */
function r29HeadEnds(h: Head, c: Column): boolean {
  if (h.ends != null) return h.ends;
  const nh = c.heads.find((g) => g.li > h.li);
  const endY = nh ? nh.l.y0 : c.limit;
  const f = c.colLines.find((l) => l.y0 > h.l.y1 - 0.5 && l.y0 < endY && !isFurniture(c.P, l));
  if (!f || c.all.some((u) => u.line === f)) return (h.ends = true);
  return (h.ends = !(SUBPART.test(f.items[0].s) || tableRow(f, c.bodyH) || r29InRuledTable(f, c.P, c.bodyH)));
}

// --- the file -------------------------------------------------------------------

/** A file about to be read, from its pre-pass (preRead of every page, in order). */
export function startFile(pre: PreLine[][]): FileState {
  return {
    pre,
    answersFrom: Infinity,
    inAnswers: false,
    open: null,
    lastQ: null,
    prefixX: null,
    model: null,
    hangXs: [],
    rows: [],
    questions: [],
    sectionMarks: [],
  };
}

/**
 * One page, read in order after the pages before it: its kind (R1-R6), its
 * answers (R9-R14), its footer (R41-R43), columns (R38-R40), labels, runs and
 * boxes, its shared boxes (R50-R53), and the question it leaves open (R51).
 * `ops` is readOperators of its operator list, on the pages needsOperators names.
 */
export function proposePage(file: FileState, input: PageInput, ops: OperatorFacts | null) {
  const { vp, ink } = input;
  const p = input.page;
  const img = ink.data;
  const { coverage, rects } = imagesOf(input.images, vp);
  r48Specks(rects, ops);
  const dark0 = darkOf(ink);
  const P: Page = {
    p,
    vp,
    W: vp.width,
    H: vp.height,
    cw: ink.width,
    ch: ink.height,
    dark0,
    dark: dark0,
    rects,
    file,
    boldShare: 0,
    minX: 0,
    fewChars: false,
    bodyH: 0,
    allLines: [],
    medDensity: null,
    frame: null,
    ocrFonts: null,
    answerKeyPage: false,
    modelReset: false,
  };
  const carriedModel = file.model;
  const frame = r44FrameMask(P, img);
  if (frame) {
    P.frame = frame;
    P.dark = (x, y) => !frame.col[x] && !frame.row[y] && dark0(x, y);
  }
  let items = itemsOf(input.content, vp, input.bold);
  const tot = items.reduce((n, it) => n + it.s.length, 0) || 1;
  P.boldShare = items.reduce((n, it) => n + (it.bold ? it.s.length : 0), 0) / tot;
  P.ocrFonts = ops ? ops.invisibleFonts : null;
  items = items.filter((it) => r2VisibleItem(ink, it));
  const chars = items.reduce((n, it) => n + it.s.length, 0);
  P.minX = items.length ? Math.min(...items.filter((i) => i.y0 < P.H * 0.94).map((i) => i.x0)) : 0;

  // Kind of page. v1: scanned when the largest image covers half the page, else
  // digital at 20 characters, else none.
  let kind: PageKind = coverage >= 0.5 ? "scanned" : chars >= 20 ? "digital" : "none";
  let overImage = false;
  if (coverage >= 0.5 && chars >= 20 && r1VisibleTextOverImage(ops, rects)) {
    kind = "digital";
    overImage = true;
  }
  P.fewChars = r3FewChars(kind, chars, coverage);
  const readable = kind === "digital" || P.fewChars;
  if (!readable && items.length && !(file.inAnswers || p > file.answersFrom) && r12AnswersOnAnyPage(P, items)) {
    file.answersFrom = Math.min(file.answersFrom, p);
    file.inAnswers = true;
  }
  if (readable && file.inAnswers && p > file.answersFrom && r13NewSheet(P, items)) file.inAnswers = false;

  let proposals: Prop[] = [];
  let colInfo: Column[] = [];
  let cover = false;
  let lines: Line[] = [];
  let headTexts: string[] | null = null;
  let lineFirsts: Set<string> | null = null;
  if (readable && !file.inAnswers) {
    const bodyH = bodyHeight(items);
    P.bodyH = bodyH;
    lines = bodyLines(items, bodyH);
    P.allLines = lines;
    // The answers heading ends the questions, on this page and every one after (R11: one that looks like a heading).
    let ansLine: Line | null = null;
    for (let i = 0; i < lines.length && !ansLine; i++) {
      if (answersForm(lines[i], bodyH, i < 2) && r11LooksLikeHeading(lines[i], bodyH, P, lines)) ansLine = lines[i];
    }
    if (ansLine) {
      file.answersFrom = Math.min(file.answersFrom, p);
      file.inAnswers = true;
    }
    // Footer: v1's outer 6%, or the page's own (R41-R43).
    let foot = P.H * 0.94;
    let footerFound = false;
    const own = r41PageFooter(P, lines);
    if (own !== null) {
      foot = own;
      footerFound = true;
    }
    if (!footerFound) foot = r42WholeLines(lines, foot, bodyH);
    const furniture = r43FooterFurniture(P, lines, foot);
    if (furniture !== null) {
      foot = furniture;
      footerFound = true;
    }
    const limit = ansLine ? ansLine.y0 - 1 : foot;
    cover = isCover(lines);
    let headerBottom = -Infinity;
    if (cover) {
      const hb = r7TestHeader(P, lines);
      if (hb !== null) {
        cover = false;
        headerBottom = hb;
      }
    }
    if (!cover && r8Contents(lines)) cover = true;
    const { columns, colRight0 } = cover
      ? { columns: [] as [number, number][], colRight0: null }
      : columnsOf(P, items, limit, bodyH);
    const pageStems: Prop[] = [];
    columns.forEach(([cx0, cx1v], ci) => {
      const cx1 = ci === 0 && colRight0 && columns.length > 1 ? colRight0 : cx1v;
      const colLines =
        columns.length > 1 ? bodyLines(items.filter((i) => i.x0 >= cx0 - 1 && i.x1 <= cx1 + 1), bodyH) : lines;
      const R = runsOf(colLines, limit, bodyH, P, [cx0, cx1]);
      let kept = R.kept;
      if (headerBottom > -Infinity) {
        kept = kept.map((r) => r.filter((t) => t.line.y0 > headerBottom)).filter((r) => r.length); // R7
      }
      const all = kept.flat();
      r50MarksLines(all, colLines, cx0, cx1);
      const stemLines = r52StemLines(colLines);
      const blocks = r53Blocks(P, kept, colLines, R.heads, stemLines, bodyH);
      const heads = R.heads;
      const headAboveToken = (h: Head) => !!colLines[h.li + 1] && colLines[h.li + 1].hasToken;
      // R29: a heading straight above another that stops a box ("Linear Regression" over "Exercise 7") stops it too.
      const headAboveHead = (h: Head): boolean => {
        const g = heads.find((x) => x.li === h.li + 1);
        return !!g && !g.title27 && (strongHead(g) || headAboveToken(g) || headAboveHead(g));
      };
      for (const h of heads) {
        if ((strongHead(h) || headAboveToken(h)) && !stemLines.some((x) => x.l === h.l)) {
          file.sectionMarks.push({ page: p, col: ci, y: h.l.y0 });
        }
      }
      const c: Column = {
        P,
        ci,
        cx0,
        cx1,
        colLines,
        bodyH,
        limit,
        footerFound,
        all,
        kept,
        heads,
        effective: R.effective,
        stemLines,
        blocks,
        props: [],
      };
      const prevLine = (t: Token, clear = -1) => {
        for (let i = t.li - 1; i >= 0; i--) {
          const l = colLines[i];
          if (l.y1 <= t.line.y0 - clear && last(l.items).x1 > t.x - PAD && l.items[0].x0 < cx1) return l;
        }
        return null;
      };
      const C: BoxColumn = { ...c, prevLine, headAboveToken, headAboveHead, headEnds: (h) => r29HeadEnds(h, c) };
      for (const r of kept) {
        const grid = new Set(r.map((t) => t.li)).size < r.length; // two labels on one line
        for (const t of r) {
          const real = boxFor(t, C, grid, r);
          const q: Prop = { type: "question", n: t.n, grid, box: real.box, col: ci, t, real, run: r };
          if (real.split) q.why = [IMAGE_SPLIT];
          const hs = heads.filter((h) => h.l.y1 <= r[0].line.y0 + 0.5 && (R.effective(h, r[0]) || headAboveToken(h)));
          if (hs.length) q.section = last(hs).l.text.trim(); // R29: the heading the run sits under
          c.props.push(q);
        }
      }
      r46NoOverlap(c.props);
      r37HoldsDroppedList(R.dropped, c.props, colLines, heads);
      pageStems.push(...r52r53Stems(P, c));
      colInfo.push(c);
      proposals.push(...c.props);
    });
    r67Overlaps(proposals);
    r68OnlyNumber(proposals);
    // R15's second signal: this page's section headings, and every line's first words.
    headTexts = colInfo.flatMap((c) =>
      c.heads.filter((h) => h.kind !== "size" || /^[A-Za-z]/.test(h.l.text)).map((h) => norm(h.l.text)),
    );
    lineFirsts = new Set(lines.flatMap((l) => [norm(l.text), norm(l.items[0].s)]));
    if (!cover) pageStems.push(...r53Contexts(P, lines, colInfo));
    proposals.push(...pageStems);
  }

  // R1 and R3 decide the kind by the outcome: a page they read is digital only if it yields a question.
  const questionCount = () => proposals.filter((q) => q.type === "question").length;
  if (overImage && questionCount() === 0) {
    kind = "scanned";
    proposals = [];
    colInfo = [];
  }
  if (P.fewChars) {
    if (questionCount() > 0) kind = "digital";
    else {
      proposals = [];
      colInfo = [];
    }
  }

  if (!cover && kind !== "scanned" && !file.inAnswers) r51Continuation(P, kind, colInfo, lines, proposals);
  else file.open = null;
  if (colInfo.length) {
    const q = lastQuestion(last(colInfo));
    if (q) file.open = r51OpenQuestion(q, last(colInfo), p);
  }

  // Kind of page after the text rules: blank (R5), then render-failed (R6).
  let stats: ReturnType<typeof inkStats> | null = null;
  const st = () => (stats ??= inkStats(P, img));
  if (proposals.length === 0 && r5Blank(P, items, chars, st().inner)) kind = "blank";
  if (r6RenderFailed(kind, coverage, chars, st, ops)) kind = "render-failed";

  // Questions in reading order: columns left to right, then top to bottom.
  const qs = proposals.filter((q) => q.type === "question").sort((a, b) => a.col - b.col || a.box[1] - b.box[1]);
  for (const q of qs) file.questions.push({ page: p, q });
  r53ContextFor(P, qs, proposals, carriedModel);
  if (qs.length) file.lastQ = { page: p, n: last(qs).n };
  for (const q of qs) {
    if ((q.t!.via === "R24" || q.t!.via === "R25") && !file.hangXs.some((x) => Math.abs(x - q.t!.x) < 0.5)) {
      file.hangXs.push(q.t!.x);
    }
  }
  if ((kind === "digital" || kind === "none") && proposals.length === 0 && !cover && rects.length) {
    if (r4PicturePage(P, st().all, st().inImg)) kind = "scanned";
  }
  const answers = file.inAnswers || P.answerKeyPage;
  // R51: a page marked answers keeps no continuation.
  if (answers) proposals = proposals.filter((x) => x.type !== "continuation");
  file.rows.push({ page: p, vp, kind, chars, coverage: +coverage.toFixed(3), answers, proposals, headTexts, lineFirsts });
  // R35: the x of the file's "Question N" labels.
  const px = proposals.filter((q) => q.t && q.t.prefixed).map((q) => q.t!.x);
  if (px.length) file.prefixX = Math.min(file.prefixX ?? Infinity, ...px);
}

/**
 * R52: a stem's questions, wherever they fall after it: the numbers it names,
 * or its run's, up to the next section heading after its box. Questions R15
 * took out do not count.
 */
function r52For(file: FileState) {
  for (const row of file.rows) {
    for (const q of row.proposals) {
      if (!q.forRange && !q.forList) continue;
      const want = new Set(
        q.forList || Array.from({ length: q.forRange![1] - q.forRange![0] + 1 }, (_, i) => q.forRange![0] + i),
      );
      q.for = [];
      const from = { page: row.page, col: q.col, y: q.box[3] };
      for (const { page, q: x } of file.questions) {
        if (x.gone || page < row.page || (page === row.page && x.box[1] < q.box[1] && x.col === q.col)) continue;
        if (headingBetween(file, from, { page, col: x.col, y: x.box[1] })) break;
        if (want.has(x.n)) {
          q.for.push({ page, n: x.n });
          want.delete(x.n);
        }
      }
    }
  }
}

/** A box on the displayed page, [left, top, right, bottom], as a suggestion's view and PDF box. */
function place(vp: Viewport, b: number[]): { view: ViewRect; box: PdfBox } {
  const [ax, ay] = vp.convertToPdfPoint(b[0], b[1]);
  const [bx, by] = vp.convertToPdfPoint(b[2], b[3]);
  return {
    view: { x: Math.min(b[0], b[2]), y: Math.min(b[1], b[3]), w: Math.abs(b[2] - b[0]), h: Math.abs(b[3] - b[1]) },
    box: { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) },
  };
}

/** After the last page: what needs the whole file (R15, R52), and every page's suggestions. */
export function finishFile(file: FileState): FileSuggestions {
  if (!r15SectionsRepeat(file)) r15HeadingsRepeat(file);
  r52For(file);
  const pages = file.rows.map((row): PageSuggestions => ({
    kind: row.kind,
    answers: row.answers,
    chars: row.chars,
    coverage: row.coverage,
    proposals: row.proposals.map((q) => {
      const s: Suggestion = { type: q.type, n: q.n, grid: q.grid, ...place(row.vp, q.box) };
      if (q.for) s.for = q.for;
      if (q.boxNo !== undefined) s.boxNo = q.boxNo;
      if (q.why) s.check = q.why;
      if (q.section !== undefined) s.section = q.section;
      if (q.label !== undefined) s.label = q.label;
      return s;
    }),
  }));
  return {
    pages,
    answerKey: pages.length > 0 && pages.every((pg) => pg.answers && pg.proposals.length === 0),
  };
}
