// Banks in the browser (docs/WORKSHEETS.md §4.5, §6.3): pdf.js's setup, one open
// bank per file per tab, drawing a box of a page, the two conversions between
// PDF space and the screen, and a bank's text-layer suggestions (§5.1), whose
// rules are lib/worksheet/propose.ts. Client only: pdf.js is loaded with
// import() on first use, so nothing here runs during server rendering.
// docs/worksheets/textlayer/compare.mjs also runs suggestFile, in Node.
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  PageViewport,
  RenderTask,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  INK_SCALE,
  finishFile,
  isBoldFont,
  needsOperators,
  preRead,
  proposePage,
  readOperators,
  startFile,
  type FileSuggestions,
  type OpCodes,
  type PageInput,
  type PreLine,
} from "./propose";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

/** A box in PDF user-space points, before /Rotate, CropBox offset included; y grows upwards. */
export interface PdfBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A rectangle on the displayed page, in viewport units; y grows downwards. */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the screen shows as the reason a bank did not open (§4.3, §8.3). */
export class BankError extends Error {
  /** Whether Try again can help: not for a PDF that needs a password, or is not one. */
  retry: boolean;
  constructor(message: string, retry = true) {
    super(message);
    this.retry = retry;
  }
}

// Copied from node_modules/pdfjs-dist by scripts/copy-pdfjs-assets.mjs.
const ASSETS = "/pdfjs/";
const ASSETS_MISSING =
  "This site's PDF reader is incomplete: its files under /pdfjs/ are missing, " +
  "unreachable or from another version, and scanned pages would draw blank. " +
  "Try again, and tell an admin if it stays.";
// The image decoders a scan needs. pdf.js fetches one only when a page has such
// an image, and if it cannot, draws that image as nothing (§8.3).
const DECODERS = ["wasm/jbig2.wasm", "wasm/openjpeg.wasm", "wasm/qcms_bg.wasm"];

let pdfjsLoading: Promise<PdfJs> | null = null;

/**
 * pdf.js, once per tab: the legacy build, because the modern one crashes on the
 * older Safari and Chromebook browsers schools keep (§8.3). Refuses to start
 * unless /pdfjs/ holds the worker's own version of its assets: without wasm/ a
 * JBIG2, JPEG 2000 or CCITT scan renders blank with only a console warning.
 */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsLoading ??= (async () => {
    const [pdfjs, assets] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      fetch(`${ASSETS}version.json`, { cache: "no-cache" })
        .then((r) => (r.ok ? (r.json() as Promise<{ version?: string }>) : null))
        .catch(() => null),
    ]);
    if (assets?.version !== pdfjs.version) throw new BankError(ASSETS_MISSING);
    // Turbopack emits the worker under /_next/static and gives back its URL.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  })();
  // A failure is not kept, so opening a bank again tries again.
  pdfjsLoading.catch(() => {
    pdfjsLoading = null;
  });
  return pdfjsLoading;
}

// Open banks, by file id. Each counts at its file size, which is the worker's
// copy: pdf.js transfers the bytes it is given, so the tab keeps no second one.
interface OpenBank {
  doc: Promise<PDFDocumentProxy>;
  bytes: number;
  holds: number;
  usedAt: number;
}
const banks = new Map<string, OpenBank>();
const BUDGET_BYTES = 100 * 1024 * 1024;

/**
 * Close least recently used banks until the open ones fit the budget. A held
 * bank (the one on screen, or one a worksheet is being made from) is never
 * closed, so a single bank over the budget still opens.
 */
function evict() {
  let total = 0;
  for (const b of banks.values()) total += b.bytes;
  const idle = Array.from(banks.entries())
    .filter(([, b]) => b.holds === 0)
    .sort(([, a], [, b]) => a.usedAt - b.usedAt);
  for (const [id, b] of idle) {
    if (total <= BUDGET_BYTES) break;
    banks.delete(id);
    total -= b.bytes;
    // Ends the bank's worker, and the copy of its bytes the worker holds.
    void b.doc.then((doc) => doc.loadingTask.destroy()).catch(() => {});
  }
}

async function download(url: string): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new BankError("The download failed. Try again.");
  }
  if (!res.ok) throw new BankError("The download failed. Try again.");
  try {
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    throw new BankError("The download failed. Try again.");
  }
}

/**
 * Whether the image decoders can be fetched now. Asked for every bank opened,
 * since each bank's worker fetches them afresh: version.json alone says the
 * folder was deployed, not that the browser can reach it.
 */
async function decodersReachable(): Promise<boolean> {
  const ok = await Promise.all(
    DECODERS.map((f) =>
      fetch(`${ASSETS}${f}`, { method: "HEAD", cache: "no-cache" }).then(
        (r) => r.ok,
        () => false,
      ),
    ),
  );
  return ok.every(Boolean);
}

async function load(entry: OpenBank, signUrl: () => Promise<string>): Promise<PDFDocumentProxy> {
  const [pdfjs, url, reachable] = await Promise.all([loadPdfJs(), signUrl(), decodersReachable()]);
  if (!reachable) throw new BankError(ASSETS_MISSING);
  const data = await download(url);
  entry.bytes = data.byteLength;
  const task = pdfjs.getDocument({
    data,
    // Fonts keep their names ("TimesNewRomanPS-BoldMT"), which is how the
    // suggestions tell a bold heading (§5.1, isBoldFont).
    fontExtraProperties: true,
    wasmUrl: `${ASSETS}wasm/`,
    cMapUrl: `${ASSETS}cmaps/`,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    iccUrl: `${ASSETS}iccs/`,
  });
  try {
    return await task.promise;
  } catch (err) {
    task.destroy().catch(() => {}); // ends its worker
    const name = (err as Error | null)?.name;
    // A bank locked against printing or copying opens like any other (§2.1
    // item 14); only one that needs a password just to open is refused.
    if (name === "PasswordException") {
      throw new BankError("This PDF needs a password to open. Upload an unlocked copy.", false);
    }
    if (name === "InvalidPDFException") throw new BankError("This file isn't a readable PDF.", false);
    throw new BankError(`This file couldn't be opened: ${(err as Error)?.message ?? String(err)}`);
  }
}

/**
 * Open a bank, or return the copy already open in this tab without signing or
 * downloading it again. signUrl is asked only when the bank must be fetched, and
 * should throw a BankError with the reason when it cannot sign (getViewUrl's
 * "Not found or not permitted."). The bank is held until release() is called:
 * call it when the bank leaves the screen.
 */
export async function openBank(
  fileId: string,
  sizeBytes: number | null,
  signUrl: () => Promise<string>,
): Promise<{ doc: PDFDocumentProxy; release: () => void }> {
  let entry = banks.get(fileId);
  if (!entry) {
    const fresh = { bytes: sizeBytes ?? 0, holds: 0, usedAt: Date.now() } as OpenBank;
    fresh.doc = load(fresh, signUrl);
    // A bank that failed to open is forgotten, so the next try starts over.
    fresh.doc.catch(() => {
      if (banks.get(fileId) === fresh) banks.delete(fileId);
    });
    banks.set(fileId, fresh);
    entry = fresh;
  }
  const held = entry;
  held.holds += 1;
  held.usedAt = Date.now();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    held.holds -= 1;
    held.usedAt = Date.now();
    evict();
  };
  try {
    const doc = await held.doc;
    evict();
    return { doc, release };
  } catch (err) {
    release();
    throw err;
  }
}

/**
 * Close a bank now, held or not, so that the next openBank downloads it again
 * into a new worker. Try again does this: pdf.js keeps an image decoder that
 * failed to load for the life of the bank's worker, so until then every scanned
 * page of the bank draws blank (§8.3).
 */
export function closeBank(fileId: string) {
  const b = banks.get(fileId);
  if (!b) return;
  banks.delete(fileId);
  void b.doc.then((doc) => doc.loadingTask.destroy()).catch(() => {});
}

/**
 * Whether an image on a page just drawn could not be decoded, and so drew as
 * nothing: how a JBIG2, JPEG 2000 or CCITT scan draws blank, or loses its text,
 * when pdf.js could not load the decoder (§8.3). pdf.js gives such an image as
 * null. Ask as soon as the render ends: cleaning the page up forgets its images.
 */
export function imagesFailed(page: PDFPageProxy): boolean {
  for (const objs of [page.objs, page.commonObjs]) {
    for (const [, data] of objs) if (data === null) return true;
  }
  return false;
}

/** The page's own box (its CropBox), as renderRegion takes it, to draw the whole page. */
export function pageBox(page: PDFPageProxy): PdfBox {
  const [x0, y0, x1, y1] = page.view;
  return { x0, y0, x1, y1 };
}

/**
 * The part of a box on its page, inside pageBox(page), or null if none is.
 * pdf.js does not clip to the CropBox, so a box reaching past it would draw
 * whatever the MediaBox holds there (§6.3). Only a crafted save stores such a
 * box: the page view keeps the boxes it draws on the page.
 */
export function clipToPage(page: PDFPageProxy, box: PdfBox): PdfBox | null {
  const p = pageBox(page);
  const out = {
    x0: Math.max(box.x0, p.x0),
    y0: Math.max(box.y0, p.y0),
    x1: Math.min(box.x1, p.x1),
    y1: Math.min(box.y1, p.y1),
  };
  return out.x1 > out.x0 && out.y1 > out.y0 ? out : null;
}

/** A PDF-space box on the displayed page. pdf.js applies /Rotate and the CropBox offset. */
export function toViewRect(viewport: PageViewport, box: PdfBox): ViewRect {
  const [ax, ay] = viewport.convertToViewportPoint(box.x0, box.y0) as number[];
  const [bx, by] = viewport.convertToViewportPoint(box.x1, box.y1) as number[];
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  };
}

// Corners are kept to 0.01 pt. The database stores them as real, which keeps
// such a number exactly as sent, so a stimulus copied into several questions
// with the same numbers reads back equal in each, and equal to what was drawn.
const round = (v: number) => Math.round(v * 100) / 100;

/** A rectangle on the displayed page, back in PDF space, as save_crops stores it. */
export function toPdfBox(viewport: PageViewport, rect: ViewRect): PdfBox {
  const [ax, ay] = viewport.convertToPdfPoint(rect.x, rect.y) as number[];
  const [bx, by] = viewport.convertToPdfPoint(rect.x + rect.w, rect.y + rect.h) as number[];
  return {
    x0: round(Math.min(ax, bx)),
    y0: round(Math.min(ay, by)),
    x1: round(Math.max(ax, bx)),
    y1: round(Math.max(ay, by)),
  };
}

/**
 * The only caller of page.render (§4.5) but suggestFile, which draws whole
 * pages for their ink: draws one box of a page onto the canvas, at `scale`
 * canvas pixels per point, only as much of it as is on the page (clipToPage).
 * The viewport's offsets put the box's top-left corner at the canvas origin,
 * and the canvas is sized to the box. pageBox(page) draws the whole page.
 * pdf.js's defaults are kept on purpose: the display intent and the default
 * annotation mode, so it draws what the page view showed; the print intent
 * turns on layers a teacher edition hides on screen (§6.3). Cancel the returned
 * task when the result is no longer wanted; its promise then rejects with a
 * RenderingCancelledException.
 */
export function renderRegion(page: PDFPageProxy, box: PdfBox, scale: number, canvas: HTMLCanvasElement): RenderTask {
  const shown = clipToPage(page, box);
  if (!shown) throw new Error("the box is off its page");
  const r = toViewRect(page.getViewport({ scale }), shown);
  canvas.width = Math.max(1, Math.round(r.w));
  canvas.height = Math.max(1, Math.round(r.h));
  const viewport = page.getViewport({ scale, offsetX: -r.x, offsetY: -r.y });
  return page.render({ canvas, viewport });
}

/** A cancelled render is not a failure. */
export function isCancelled(err: unknown): boolean {
  return (err as Error | null)?.name === "RenderingCancelledException";
}

// --- text-layer suggestions (§5.1) ----------------------------------------------

/**
 * A bank's text-layer suggestions (§5.1), worked out from the whole file by
 * propose.ts, as the lab finder works them out: a page's suggestions depend on
 * the pages before it and after it. Every page is read twice, in order: its
 * text, for the lines the file repeats; then its text, its ink (the page drawn
 * at INK_SCALE, on a canvas sized as the lab's is, with recordImages for where
 * its images fall), its fonts' weights and, where needsOperators says so, its
 * operator list. `canvas` makes a canvas of a size; `onPage` hears each page
 * read. Each page is cleaned up after it (§4.5).
 */
export async function suggestFile(
  doc: PDFDocumentProxy,
  OPS: OpCodes,
  canvas: (width: number, height: number) => HTMLCanvasElement,
  onPage?: (done: number, pages: number) => void,
): Promise<FileSuggestions> {
  const pre: PreLine[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    pre.push(preRead((await page.getTextContent()).items, page.getViewport({ scale: 1 })));
  }
  const file = startFile(pre);
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: INK_SCALE });
    const c = canvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    try {
      await page.render({ canvas: c, viewport, recordImages: true }).promise;
      const ink = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
      // Fonts are in commonObjs once the page is drawn.
      const content = (await page.getTextContent()).items;
      const bold = new Map<string, boolean>();
      for (const it of content) {
        if (!("fontName" in it) || bold.has(it.fontName)) continue;
        let b = false;
        try {
          b = page.commonObjs.has(it.fontName) && isBoldFont(page.commonObjs.get(it.fontName));
        } catch {
          b = false;
        }
        bold.set(it.fontName, b);
      }
      const input: PageInput = {
        page: p,
        vp: page.getViewport({ scale: 1 }),
        content,
        bold,
        ink,
        images: page.imageCoordinates,
      };
      const ops = needsOperators(input) ? readOperators(await page.getOperatorList(), OPS) : null;
      proposePage(file, input, ops);
    } finally {
      // Safari is slow to free a canvas's memory unless it is shrunk first.
      c.width = c.height = 0;
      // pdf.js waits for any render still running on the page, the one on screen included.
      page.cleanup();
    }
    onPage?.(p, doc.numPages);
  }
  return finishFile(file);
}

// Per open bank: its suggestions, once worked out, and how far the work has got.
interface BankSuggestions {
  file: Promise<FileSuggestions>;
  done: number;
  pages: number;
  listeners: Set<(done: number, pages: number) => void>;
}
const suggested = new WeakMap<PDFDocumentProxy, BankSuggestions>();

function newCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/**
 * A bank's text-layer suggestions (§5.1), every page's: a continuation or a
 * stem names questions on other pages. The bank is read for them once per open
 * bank, in the background from the first ask, and they come at the end;
 * `onProgress` hears how many pages are read until then. Suggestions are never
 * saved; the page view shows them until one is accepted.
 */
export function suggestionsFor(
  doc: PDFDocumentProxy,
  onProgress?: (done: number, pages: number) => void,
): Promise<FileSuggestions> {
  let bank = suggested.get(doc);
  if (!bank) {
    const fresh: BankSuggestions = {
      file: loadPdfJs().then((pdfjs) =>
        suggestFile(doc, pdfjs.OPS, newCanvas, (done, pages) => {
          fresh.done = done;
          for (const f of fresh.listeners) f(done, pages);
        }),
      ),
      done: 0,
      pages: doc.numPages,
      listeners: new Set(),
    };
    // A failure is not kept, so the bank is read again the next time a page asks.
    fresh.file.catch(() => {
      if (suggested.get(doc) === fresh) suggested.delete(doc);
    });
    suggested.set(doc, fresh);
    bank = fresh;
  }
  const held = bank;
  if (onProgress) {
    held.listeners.add(onProgress);
    onProgress(held.done, held.pages);
  }
  return held.file.finally(() => {
    if (onProgress) held.listeners.delete(onProgress);
  });
}
