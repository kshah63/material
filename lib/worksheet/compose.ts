// The worksheet PDF (docs/WORKSHEETS.md §6). drawBox draws each box alone with
// pdf.js, at 300 dpi of the size it prints, and keeps it as a JPEG (§6.3); save
// puts every question's JPEGs on copies of the template page, where layout.ts
// says, with its source line under them (§6.1, §6.2). Only the boxes' pixels
// reach the worksheet, so nothing else on a bank's page goes with them. Client
// only, and loaded with import() when the worksheet modal opens: it carries
// pdf-lib, which never reads a bank, only the template and the JPEGs.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { clipToPage, renderRegion, toViewRect, type PdfBox } from "./source";
import {
  DPI,
  LINE_GREY,
  LINE_SIZE,
  PAGE,
  contentArea,
  layout,
  sourceLine,
  type BoxSize,
  type Label,
} from "./layout";

/** A box drawn for the worksheet: its JPEG and its size in pixels, at 300 dpi of its printed size. */
export interface Jpeg {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * A box's size as displayed on its page, at scale 1: what the layout takes. Only
 * its part on the page counts, as only that is drawn (renderRegion); null if no
 * part of it is on the page.
 */
export function boxSize(page: PDFPageProxy, box: PdfBox): BoxSize | null {
  const shown = clipToPage(page, box);
  if (!shown) return null;
  const r = toViewRect(page.getViewport({ scale: 1 }), shown);
  return { w: r.w, h: r.h };
}

/**
 * One box drawn alone at `scale` (§6.2's, for its question) × 300 ÷ 72 pixels
 * per point, through renderRegion with the display intent, and encoded as JPEG
 * at quality 0.9 (§6.3). Aborting cancels the render.
 */
export async function drawBox(
  page: PDFPageProxy,
  box: PdfBox,
  scale: number,
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
): Promise<Jpeg> {
  const task = renderRegion(page, box, (scale * DPI) / 72, canvas);
  const cancel = () => task.cancel();
  signal.addEventListener("abort", cancel);
  try {
    await task.promise;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.9));
  if (!blob) throw new Error("its picture could not be made");
  return { blob, width: canvas.width, height: canvas.height };
}

const templates = new Map<Label, Promise<ArrayBuffer>>();

/** The template page for the label (§6.1), fetched once per tab; a failure is not kept. */
export function template(label: Label): Promise<ArrayBuffer> {
  let t = templates.get(label);
  if (!t) {
    t = fetch(`/worksheet/template-${label}.pdf`).then((r) => {
      if (!r.ok) throw new Error(`the ${label} template answered ${r.status}`);
      return r.arrayBuffer();
    });
    t.catch(() => templates.delete(label));
    templates.set(label, t);
  }
  return t;
}

/** A question as save takes it: its boxes' sizes and JPEGs in box_no order, and its source. */
export interface SheetQuestion {
  boxes: BoxSize[];
  jpegs: Jpeg[];
  fileName: string;
  pages: number[];
}

/**
 * The worksheet: one copy of the template page per worksheet page, drawn as its
 * background (embedPdf once, drawPage on each), every JPEG on top with its bytes
 * unchanged (embedJpg), and each question's source line in Helvetica. Pages are
 * PAGE, the templates' own size, so the template is drawn as it is. Each
 * picture is drawn at exactly 300 dpi, its own pixels setting its size, which is
 * within half a pixel of its box's. The PDF's Title is `title`.
 */
export async function save(
  questions: SheetQuestion[],
  templateBytes: ArrayBuffer,
  title: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const [bg] = await pdf.embedPdf(templateBytes, [0]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const placed = layout(
    questions.map((q) => q.boxes),
    PAGE,
  );
  const pages = Array.from({ length: placed.pages }, () => {
    const p = pdf.addPage([PAGE.width, PAGE.height]);
    p.drawPage(bg, { x: 0, y: 0, width: PAGE.width, height: PAGE.height });
    return p;
  });
  const fit = {
    width: contentArea(PAGE).width,
    measure: (t: string) => font.widthOfTextAtSize(t, LINE_SIZE),
  };
  for (const [i, q] of questions.entries()) {
    const at = placed.questions[i];
    for (const [k, jpeg] of q.jpegs.entries()) {
      const b = at.boxes[k];
      const image = await pdf.embedJpg(new Uint8Array(await jpeg.blob.arrayBuffer()));
      const w = (jpeg.width * 72) / DPI;
      const h = (jpeg.height * 72) / DPI;
      pages[b.page].drawImage(image, { x: b.x, y: b.y + b.h - h, width: w, height: h });
    }
    pages[at.line.page].drawText(sourceLine(q.fileName, q.pages, fit), {
      x: at.line.x,
      y: at.line.y,
      size: LINE_SIZE,
      font,
      color: rgb(LINE_GREY.r, LINE_GREY.g, LINE_GREY.b),
    });
  }
  pdf.setTitle(title);
  return pdf.save();
}
