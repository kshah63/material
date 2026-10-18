// Finder v2.2's port (lib/worksheet/propose.ts, run through source.ts
// suggestFile as the page view runs it) against the lab finder it was ported
// from, propose.mjs beside this file, on the same banks. Each bank is opened
// once for each: the port in this process, the lab finder as a child process
// run from the repository root, so both use this checkout's pdfjs-dist and
// @napi-rs/canvas. Prints one line per bank, EQUAL or DIFF with the first
// differences, and a last line ALL EQUAL or NOT ALL EQUAL. Usage, from anywhere:
//   node docs/worksheets/textlayer/compare.mjs [--finder <finder.mjs>] [--list <file>] [bank.pdf ...]
// --finder names another lab finder (default: propose.mjs here). --list names a
// file of bank paths, one per line. A bank path is only ever an argument:
// nothing runs from a bank's directory.
//
// Compared, per page: kind, chars, coverage, answers; per proposal, in order:
// type, n, grid, its box on the displayed page and in PDF space (each corner
// to 0.5 pt), for, box number, the "?" with its reasons, section and label;
// per file, the answer-key flag (the lab's: every page answers, nothing
// proposed). Not compared, as the port does not make them: the lab's rule
// attribution (rules, rules_fired, tags), ai (there is no AI step) and its
// diagnostics (cover, invisible_items). The lab runs with every rule it has on
// (V2_OFF cleared), as the port does.
import { execFile } from "node:child_process";
import fs from "node:fs";
import { register } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// source.ts imports "./propose" without an extension, as the app's bundler
// reads it; Node needs the ".ts".
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) {
  const bare = /^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]s$/.test(s);
  return next(bare && c.parentURL && c.parentURL.endsWith(".ts") ? s + ".ts" : s, c);
}`),
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LIB = path.join(ROOT, "node_modules/pdfjs-dist");
const pdfjs = await import(path.join(LIB, "legacy/build/pdf.mjs"));
const { suggestFile } = await import(path.join(ROOT, "lib/worksheet/source.ts"));

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const finder = flag("--finder") ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "propose.mjs");
const list = flag("--list");
const banks = [...(list ? fs.readFileSync(list, "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : []), ...args];
if (!banks.length) {
  console.error("usage: node compare.mjs [--finder <finder.mjs>] [--list <file>] [bank.pdf ...]");
  process.exit(2);
}

/** The port: the bank opened as source.ts opens it, with Node's canvases. */
async function port(bank) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(bank)),
    fontExtraProperties: true,
    wasmUrl: LIB + "/wasm/",
    cMapUrl: LIB + "/cmaps/",
    standardFontDataUrl: LIB + "/standard_fonts/",
    iccUrl: LIB + "/iccs/",
    verbosity: 0,
  }).promise;
  try {
    return await suggestFile(doc, pdfjs.OPS, (w, h) => doc.canvasFactory.create(w, h).canvas);
  } finally {
    await doc.loadingTask.destroy();
  }
}

/** The lab finder, its JSON on stdout. With V2_NOPNG it writes no overlays, so its output directory stays untouched. */
function lab(bank) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [path.resolve(finder), path.resolve(bank), os.tmpdir()],
      { cwd: ROOT, env: { ...process.env, V2_NOPNG: "1", V2_OFF: "" }, maxBuffer: 1 << 30 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`${err.message}\n${stderr}`));
        else resolve(JSON.parse(stdout));
      },
    );
  });
}

const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 0.5);
const corners = (b) => [Math.min(b[0], b[2]), Math.min(b[1], b[3]), Math.max(b[0], b[2]), Math.max(b[1], b[3])];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function compare(mine, theirs) {
  const bad = [];
  let proposals = 0;
  if (mine.pages.length !== theirs.length) bad.push(`${mine.pages.length} pages against ${theirs.length}`);
  theirs.forEach((t, i) => {
    const m = mine.pages[i];
    if (!m) return;
    const p = `p${t.page}`;
    for (const k of ["kind", "chars", "coverage", "answers"]) if (m[k] !== t[k]) bad.push(`${p} ${k} ${m[k]} / ${t[k]}`);
    if (m.proposals.length !== t.proposals.length) {
      bad.push(`${p} ${m.proposals.length} proposals / ${t.proposals.length}`);
      return;
    }
    t.proposals.forEach((y, j) => {
      const x = m.proposals[j];
      proposals++;
      const v = [x.view.x, x.view.y, x.view.x + x.view.w, x.view.y + x.view.h];
      const pdf = [x.box.x0, x.box.y0, x.box.x1, x.box.y1];
      const tpdf = [y.pdf.x0, y.pdf.y0, y.pdf.x1, y.pdf.y1];
      const diffs = [];
      if (x.type !== y.type) diffs.push(`type ${x.type}/${y.type}`);
      if (x.n !== y.n || x.grid !== y.grid) diffs.push(`n ${x.n}/${y.n} grid ${x.grid}/${y.grid}`);
      if (!near(v, corners(y.box))) diffs.push(`box [${v.map((a) => a.toFixed(1))}] / [${y.box}]`);
      if (!near(pdf, tpdf)) diffs.push("pdf box");
      if (!same(x.for, y.for)) diffs.push(`for ${JSON.stringify(x.for)} / ${JSON.stringify(y.for)}`);
      if (!same(x.boxNo, y.box_no)) diffs.push(`box_no ${x.boxNo}/${y.box_no}`);
      if (!same(x.check, y.check ? y.why : undefined)) {
        diffs.push(`check ${JSON.stringify(x.check)} / ${JSON.stringify(y.why)}`);
      }
      if (!same(x.section, y.section)) diffs.push(`section "${x.section}" / "${y.section}"`);
      if (!same(x.label, y.label)) diffs.push(`label "${x.label}" / "${y.label}"`);
      if (diffs.length) bad.push(`${p} #${j} ${y.type} ${y.n}: ${diffs.join(", ")}`);
    });
  });
  const key = theirs.length > 0 && theirs.every((t) => t.answers && t.proposals.length === 0);
  if (mine.answerKey !== key) bad.push(`answerKey ${mine.answerKey} / ${key}`);
  return { bad, proposals };
}

let all = true;
let pages = 0;
let proposals = 0;
const t0 = Date.now();
for (const bank of banks) {
  const name = path.basename(bank, ".pdf").slice(0, 60);
  try {
    const [theirs, mine] = await Promise.all([lab(bank), port(bank)]);
    const r = compare(mine, theirs);
    pages += theirs.length;
    proposals += r.proposals;
    all &&= !r.bad.length;
    const what = r.bad.length ? "  " + r.bad.slice(0, 4).join(" | ") : "";
    console.log(`${r.bad.length ? "DIFF " : "EQUAL"} ${name.padEnd(60)} pages=${theirs.length} proposals=${r.proposals}${what}`);
  } catch (err) {
    all = false;
    console.log(`FAIL  ${name.padEnd(60)} ${String(err.message || err).split("\n")[0]}`);
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`${all ? "ALL EQUAL" : "NOT ALL EQUAL"}: ${banks.length} banks, ${pages} pages, ${proposals} proposals, ${secs} s`);
process.exit(all ? 0 : 1);
