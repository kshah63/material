// The page view's cost on a bank (docs/WORKSHEETS.md §4.5, §8.1): render each
// page whole at fit-width, as flipping through the bank does, with or without
// page.cleanup() when leaving the page, and report time per page and peak memory.
// Usage, from the scratch dir compose.mjs runs in:
//   node flip.mjs <bank.pdf> [pages=40] [--no-cleanup] [--width=2048]
import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const [bankPath, nStr = "40", ...flags] = process.argv.slice(2);
const noCleanup = flags.includes("--no-cleanup");
const width = Number(flags.find((f) => f.startsWith("--width="))?.split("=")[1] ?? 2048);
let peakRss = 0;
const tick = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 10);
const assets = path.resolve("node_modules/pdfjs-dist") + "/";
const bank = await pdfjs.getDocument({
  data: new Uint8Array(fs.readFileSync(bankPath)),
  standardFontDataUrl: assets + "standard_fonts/", cMapUrl: assets + "cmaps/",
  wasmUrl: assets + "wasm/", iccUrl: assets + "iccs/", verbosity: 0,
}).promise;
const canvas = createCanvas(1, 1);
const times = [];
const n = Math.min(Number(nStr), bank.numPages);
for (let p = 1; p <= n; p++) {
  const page = await bank.getPage(p);
  const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const t = performance.now();
  await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
  times.push(performance.now() - t);
  if (!noCleanup) page.cleanup(); // leaving the page
}
clearInterval(tick);
times.sort((a, b) => a - b);
console.log(JSON.stringify({
  bank: path.basename(bankPath), pages: n, width, cleanup: !noCleanup,
  medianMs: Math.round(times[n >> 1]), maxMs: Math.round(times[n - 1]), peakRssMB: Math.round(peakRss / 1048576),
}));
