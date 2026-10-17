// The all-raster compose of docs/WORKSHEETS.md §6, measured in Node: every crop
// is rendered by pdf.js alone, at 300 dpi of the size it is printed (§6.2),
// encoded as JPEG (or PNG, to compare), and drawn on the template page.
// Every render goes through renderRegion with pdf.js's defaults, so the display
// intent (§4.5, §6.3), and a page's decoded images are released with
// page.cleanup() after its last pick (picks are in bank order).
// Usage, from a scratch dir holding
//   npm i pdfjs-dist@6.4.299 pdf-lib@1.17.1 @napi-rs/canvas@1.0.11
//   node compose.mjs <bank.pdf> <boxes.json> <template.pdf> <out.pdf> [options]
// Options:
//   --png         PNG instead of JPEG          --q=90   JPEG quality
//   --ppi=200     cap the density at a scan's own, to compare with 300 dpi
//   --spread=20   only the first box on each page, for 20 pages: every pick is
//                 the first on its page, so every pick decodes a page
//   --no-cleanup  never call page.cleanup(), to compare memory
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument } from "pdf-lib";

const [bankPath, boxesPath, tmplPath, outPath, ...flags] = process.argv.slice(2);
const opt = Object.fromEntries(flags.map((f) => [f.replace(/^--/, "").split("=")[0], f.split("=")[1] ?? true]));
const fmt = opt.png ? "png" : "jpeg";
const q = Number(opt.q ?? 90);
const MM = 72 / 25.4;
const AREA = { x: 15 * MM, top: (297 - 26) * MM, w: 180 * MM, h: 247 * MM };
const DPI = 300;
let peakRss = 0;
const tick = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 10);
const assets = path.resolve("node_modules/pdfjs-dist") + "/";
const bank = await pdfjs.getDocument({
  data: new Uint8Array(fs.readFileSync(bankPath)),
  standardFontDataUrl: assets + "standard_fonts/", cMapUrl: assets + "cmaps/",
  wasmUrl: assets + "wasm/", iccUrl: assets + "iccs/", verbosity: 0,
}).promise;
let boxes = JSON.parse(fs.readFileSync(boxesPath, "utf8"));
if (opt.spread) {
  const seen = new Set();
  boxes = boxes.filter((b) => !seen.has(b.page) && seen.add(b.page)).slice(0, Number(opt.spread));
}

// The one caller of page.render: the box's displayed rectangle, at `scale`,
// with the box's top-left corner at the canvas origin. pdf.js's defaults
// (intent "display"), never intent "print".
function displayedBox(page, b) {
  const v1 = page.getViewport({ scale: 1 });
  const [ax, ay] = v1.convertToViewportPoint(b.x0, b.y0);
  const [bx, by] = v1.convertToViewportPoint(b.x1, b.y1);
  return { vx: Math.min(ax, bx), vy: Math.min(ay, by), cw: Math.abs(bx - ax), ch: Math.abs(by - ay) };
}
async function renderRegion(page, d, scale, canvas) {
  canvas.width = Math.round(d.cw * scale);
  canvas.height = Math.round(d.ch * scale);
  await page.render({
    canvas, canvasContext: canvas.getContext("2d"),
    viewport: page.getViewport({ scale, offsetX: -d.vx * scale, offsetY: -d.vy * scale }),
  }).promise;
}

const t0 = performance.now();
const out = await PDFDocument.create();
const [bg] = await out.embedPdf(fs.readFileSync(tmplPath), [0]);
const canvas = createCanvas(1, 1); // one canvas, reused for every crop
const ms = { first: [], later: [] };
let encodeMs = 0, imgBytes = 0, maxPx = 0, maxKB = 0;
const placed = [];
for (let i = 0; i < boxes.length; i++) {
  const b = boxes[i];
  const page = await bank.getPage(b.page);
  const d = displayedBox(page, b);
  const s = Math.min(1.25, AREA.w / d.cw, (0.55 * AREA.h) / d.ch); // §6.2, on the displayed size
  const r = Math.min((s * DPI) / 72, opt.ppi ? Number(opt.ppi) / 72 : Infinity);
  let t = performance.now();
  await renderRegion(page, d, r, canvas);
  (boxes[i - 1]?.page === b.page ? ms.later : ms.first).push(performance.now() - t);
  maxPx = Math.max(maxPx, canvas.width * canvas.height);
  t = performance.now();
  const bytes = fmt === "png" ? await canvas.encode("png") : await canvas.encode("jpeg", q);
  encodeMs += performance.now() - t;
  imgBytes += bytes.length;
  maxKB = Math.max(maxKB, Math.round(bytes.length / 1024));
  const img = fmt === "png" ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  placed.push({ img, W: d.cw * s, H: d.ch * s });
  if (!opt["no-cleanup"] && boxes[i + 1]?.page !== b.page) page.cleanup(); // its last pick
}
canvas.width = canvas.height = 0;
const short = (p) => p.H <= 74 * MM; // §6.2: two short questions in a row share a page
let pages = 0;
for (let i = 0; i < placed.length; ) {
  const pg = out.addPage([bg.width, bg.height]);
  pg.drawPage(bg, { x: 0, y: 0 });
  pages++;
  const a = placed[i];
  pg.drawImage(a.img, { x: AREA.x, y: AREA.top - a.H, width: a.W, height: a.H });
  const b = placed[i + 1];
  if (short(a) && b && short(b)) {
    pg.drawImage(b.img, { x: AREA.x, y: AREA.top - AREA.h / 2 - b.H, width: b.W, height: b.H });
    i += 2;
  } else i += 1;
}
const pdf = await out.save();
const totalMs = performance.now() - t0;
fs.writeFileSync(outPath, pdf);
clearInterval(tick);
const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
console.log(JSON.stringify({
  bank: path.basename(bankPath), fmt, q, crops: placed.length, pages, cleanup: !opt["no-cleanup"],
  pdfKB: Math.round(pdf.length / 1024), perCropKB: Math.round(imgBytes / 1024 / placed.length), largestCropKB: maxKB,
  largestCropPx: maxPx, largestCanvasMB: +((maxPx * 4) / 1048576).toFixed(1),
  renderMsFirstOnPage: avg(ms.first), renderMsLaterOnPage: avg(ms.later),
  worstRenderMs: Math.round(Math.max(...ms.first, ...ms.later)),
  encodeMsPerCrop: Math.round(encodeMs / placed.length),
  totalMs: Math.round(totalMs), peakRssMB: Math.round(peakRss / 1048576),
}));
