// The text-layer suggestions of docs/WORKSHEETS.md §5.1, as measured on the
// centre's own banks (§9.2.1): classify each page, find the question numbers in
// its text layer, and draw each question's box from the rendered page's ink.
// Writes p<N>.png with the boxes drawn on (orange: a question, green: a grid
// cell) and prints one JSON array, a row per page.
// Usage, from the scratch dir compose.mjs runs in:
//   node propose.mjs <bank.pdf> <outDir>
// Not here: the ink test that rejects invisible (render mode 3) text on a
// digital page (§5.1, kind of page, step 2). None of the sample banks had any.
import fs from "node:fs";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const [bankPath, outDir] = process.argv.slice(2);
const assets = path.resolve("node_modules/pdfjs-dist") + "/";
const doc = await pdfjs.getDocument({
  data: new Uint8Array(fs.readFileSync(bankPath)),
  standardFontDataUrl: assets + "standard_fonts/", cMapUrl: assets + "cmaps/",
  wasmUrl: assets + "wasm/", iccUrl: assets + "iccs/", verbosity: 0,
}).promise;

// A label is a line's first token. A bare number needs a prefix ("Q2", "EX 1");
// unprefixed it must be followed by . ) or :, or every table of data with
// consecutive values down its first column is a run of questions.
const FIRST = /^(?:(?:Q(?:uestion)?|EX|Example)\s*(\d{1,3})(?:\s*[.):](?!\d)|$)|(\d{1,3})[.):](?!\d))/i;
const FIRST_MERGED = /^(?:(?:Q(?:uestion)?|EX|Example)\s*)?(\d{1,3})[.):]\s+\S/i;
// Later in a line, only as the next cell of a grid row: "2." or "2. y = ...".
const INLINE = /^(\d{1,3})[.)](?:\s+\S.*)?$/;
// "Answers", "Answer Key", or a title ending "(Answers)". Not any line ending
// in "answer": "Justify your answer" wraps onto lines of its own.
const ANSWERS = /^(?:answers?|answer key|mark scheme|solutions?)\s*:?$|\((?:answers?|answer key|mark scheme|solutions?)\)\s*$/i;
const S = 2, PAD = 4; // render at 144 dpi; 4 pt round every box
let answersFrom = Infinity;

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

// Lines from body-size items only: Word's maths sets every sub- and superscript
// as a separate small item, and as lines of their own they shrink the gap above
// a label to nothing. Each small item then joins the nearest line beside it, so
// that line's top and bottom take in a fraction's numerator; left out, the next
// question's dy/dx reads as the last ink of the one above.
function bodyLines(items, bodyH) {
  const lines = linesOf(items.filter((it) => it.y1 - it.y0 >= bodyH * 0.75));
  for (const it of items.filter((it) => it.y1 - it.y0 < bodyH * 0.75)) {
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

// Labels chained into runs of consecutive numbers. Every run is kept, because a
// bank page restarts its numbering for each section (AP MCQ 1-6, then AP FRQ
// 1-3). A run needs no gap above its labels; a lone label does, measured against
// body text height, since a line holding a big fraction is tall.
function runsOf(lines, limit, bodyH) {
  const toks = [];
  lines.forEach((l, li) => l.items.forEach((it, k) => {
    if (it.y0 >= limit) return;
    const m = k === 0 ? it.s.match(FIRST) || it.s.match(FIRST_MERGED) : it.s.match(INLINE);
    if (m) toks.push({ n: +(m[1] ?? m[2]), x: it.x0, li, line: l, first: k === 0 });
  }));
  const gapAbove = (t) => (t.li === 0 ? Infinity : t.line.y0 - lines[t.li - 1].y1);
  const spaced = (t) => gapAbove(t) > bodyH;
  const runs = [];
  for (const t of toks) {
    const open = runs.filter((r) => {
      const last = r.at(-1);
      if (last.n !== t.n - 1) return false;
      if (last.li === t.li) return true;                    // side by side: the next cell of a grid row
      return r.some((u) => Math.abs(u.x - t.x) < 6);        // under the run's own left edge
    });
    // Two runs can both want it: after "Question 3: Arrange in order: 1. 2. 3.",
    // a spaced-out "4." continues the spaced-out questions, not the list. Else
    // the latest run, the section this page is in now.
    const run = open.findLast((r) => spaced(t) === r.every(spaced)) ?? open.at(-1);
    if (run) run.push(t);
    else if (t.first) runs.push([t]);
  }
  // A run that sits wholly between two labels of another is a list inside that
  // question, never questions of its own.
  const inside = (r) => runs.some((o) => o !== r && o.some((a, k) => k + 1 < o.length &&
    a.line.y1 <= r[0].line.y0 && o[k + 1].line.y0 >= r.at(-1).line.y1 && Math.abs(a.x - r[0].x) < 6));
  return runs.filter((r) => (r.length >= 2 || spaced(r[0])) && !inside(r));
}

const result = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const rvp = page.getViewport({ scale: S });
  const { canvas, context } = doc.canvasFactory.create(Math.ceil(rvp.width), Math.ceil(rvp.height));
  await page.render({ canvas, viewport: rvp, recordImages: true }).promise;
  const ic = page.imageCoordinates;
  let coverage = 0;
  if (ic) for (let k = 0; k + 5 < ic.length; k += 6) {
    const xs = [ic[k], ic[k + 2], ic[k + 4]], ys = [ic[k + 1], ic[k + 3], ic[k + 5]];
    coverage = Math.max(coverage, (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)));
  }
  const img = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const dark = (x, y) => { const o = (y * canvas.width + x) * 4; return img[o] + img[o + 1] + img[o + 2] < 600; };

  const items = [];
  for (const it of (await page.getTextContent()).items) {
    if (!("str" in it) || !it.str.trim()) continue;
    const [a, b, c, d, e, f] = it.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b);
    const n1 = Math.hypot(a, b) || 1, n2 = Math.hypot(c, d) || 1;
    const ux = a / n1, uy = b / n1, vx = c / n2, vy = d / n2;
    const pts = [[e, f], [e + ux * it.width, f + uy * it.width], [e + vx * size * 0.8, f + vy * size * 0.8],
      [e + ux * it.width + vx * size * 0.8, f + uy * it.width + vy * size * 0.8]].map(([x, y]) => vp.convertToViewportPoint(x, y));
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    items.push({ s: it.str.trim(), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
  }
  const chars = items.reduce((n, it) => n + it.s.length, 0);
  // 20 characters, not 100: a page that is all graphs under one printed question still has its label.
  const kind = coverage >= 0.5 ? "scanned" : chars >= 20 ? "digital" : "none";
  const proposals = [];

  if (kind === "digital" && p <= answersFrom) {
    const hs = items.flatMap((it) => Array(Math.min(it.s.length, 50)).fill(it.y1 - it.y0)).sort((a, b) => a - b);
    const bodyH = hs[Math.floor(hs.length / 2)];
    const lines = bodyLines(items, bodyH);
    // The answers heading ends the questions, on this page and every one after.
    const ansLine = lines.find((l) => l.text.length < 80 && ANSWERS.test(l.text.trim()));
    if (ansLine) answersFrom = Math.min(answersFrom, p);
    const limit = ansLine ? ansLine.y0 - 1 : vp.height * 0.94;   // or the footer band, the outer 6%
    // A cover (a "Name:" line and a "School:" line) holds a contents list and
    // the rules for students, both numbered, and never a question.
    const cover = lines.some((l) => /^name\s*:/i.test(l.text)) && lines.some((l) => /^school\s*:/i.test(l.text));

    // Columns: an empty band in the middle 30-70% of the width is a gutter only
    // if each side carries a run of its own. A grid's cells, read one side at a
    // time, are odd and even numbers, which is no run, so a grid never splits.
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
    if (band && !cover) {
      const g = ((band[0] + band[1] + 1) / 2 / 100) * W;
      const side = (keep) => runsOf(bodyLines(items.filter(keep), bodyH), limit, bodyH).some((r) => r.length >= 2);
      if (side((i) => i.x1 <= g + 1) && side((i) => i.x0 >= g - 1)) columns = [[0, g], [g, W]];
    }

    for (const [cx0, cx1] of cover ? [] : columns) {
      const colLines = columns.length > 1 ? bodyLines(items.filter((i) => i.x0 >= cx0 - 1 && i.x1 <= cx1 + 1), bodyH) : lines;
      const kept = runsOf(colLines, limit, bodyH);
      const all = kept.flat();
      for (const r of kept) {
        const grid = new Set(r.map((t) => t.li)).size < r.length; // two labels on one line
        for (const t of r) {
          // Left: the label, or ink just left of it on its own line (a calculator icon).
          let left = t.x - PAD;
          const ly0 = Math.floor(t.line.y0 * S), ly1 = Math.ceil(t.line.y1 * S);
          for (let x = Math.floor((t.x - 2) * S); x >= Math.max(Math.floor(cx0 * S), Math.floor((t.x - 30) * S)); x--) {
            let ink = false;
            for (let y = ly0; y <= ly1 && !ink; y++) ink = dark(x, y);
            if (ink) left = Math.min(left, x / S - PAD);
          }
          left = Math.max(left, cx0);
          // Bottom, first: the next label under this one.
          let bottom = Math.min(limit, ...all.filter((u) => u !== t && u.line.y0 > t.line.y1 - 1 && Math.abs(u.x - t.x) < 6).map((u) => u.line.y0 - 1));
          // Right: on a grid, the next cell along the line. Otherwise a label at
          // least a quarter of the page to the right, inside this question's
          // span: never a list indented inside the question itself.
          const beside = all.filter((u) => u !== t && u.line.y1 > t.line.y0 &&
            (grid ? u.x > t.x + 20 && u.line.y0 < t.line.y1 : u.x > t.x + W / 4 && u.line.y0 < bottom));
          const right = beside.length ? Math.min(...beside.map((u) => u.x)) - PAD : cx1;
          // Bottom, then: any label below that starts inside this width, such as
          // the first of the next section further left.
          bottom = Math.min(bottom, ...all.filter((u) => u !== t && u.line.y0 > t.line.y1 - 1 && u.x < right - 20 && (grid || u.x > left - 200)).map((u) => u.line.y0 - 1));
          // Ink sets the box: the last inked row above the bottom, found from the
          // label's own column rightwards (the strip left of it holds the next
          // question's icon, which stands taller than its line), then the sides.
          const X0 = Math.max(0, Math.floor(left * S)), X1 = Math.min(canvas.width - 1, Math.ceil(right * S) - 1);
          const XL = Math.max(X0, Math.floor((t.x - PAD) * S));
          const Y0 = Math.floor((t.line.y0 - 1) * S);
          let Y1 = Math.floor(bottom * S);
          const rowInk = (y) => { for (let x = XL; x <= X1; x++) if (dark(x, y)) return true; return false; };
          while (Y1 > Y0 && !rowInk(Y1)) Y1--;
          let minX = X1, maxX = X0;
          for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) if (dark(x, y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
          const box = [Math.max(left, minX / S - PAD), Math.max(0, t.line.y0 - PAD), Math.min(right, maxX / S + PAD), Math.min(bottom, Y1 / S + PAD)];
          // The same box in PDF user space, which is what compose.mjs takes.
          const [ax, ay] = vp.convertToPdfPoint(box[0], box[1]), [bx, by] = vp.convertToPdfPoint(box[2], box[3]);
          proposals.push({ n: t.n, grid, box: box.map((v) => +v.toFixed(1)),
            pdf: { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) } });
        }
      }
    }
  }
  context.lineWidth = 3;
  for (const q of proposals) {
    context.strokeStyle = q.grid ? "rgba(20,150,60,0.9)" : "rgba(239,90,43,0.9)";
    context.strokeRect(q.box[0] * S, q.box[1] * S, (q.box[2] - q.box[0]) * S, (q.box[3] - q.box[1]) * S);
    context.fillStyle = "rgba(45,48,146,0.95)";
    context.font = "bold 22px sans-serif";
    context.fillText(`${q.n}`, q.box[2] * S - 40, q.box[1] * S + 22);
  }
  fs.writeFileSync(path.join(outDir, `p${p}.png`), canvas.toBuffer("image/png"));
  page.cleanup();
  result.push({ page: p, kind, chars, coverage: +coverage.toFixed(3), answers: p >= answersFrom, proposals });
}
console.log(JSON.stringify(result));
