// The worksheet's layout (lib/worksheet/layout.ts, docs/WORKSHEETS.md §6.2):
// boxes in, positions out, on the templates' page, plus the source line, the
// file name and print order. The source line is drawn with pdf-lib's Helvetica,
// as compose draws it, so whatever winAnsi() leaves must encode. Needs no
// database.
//   node worksheet.mjs   (run.sh runs it)
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as L from "../../lib/worksheet/layout.ts";

const MM = L.MM;
const A = L.contentArea(L.PAGE);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.01, `${what}: ${a} is not ${b}`);
let n = 0;
const ok = (msg) => console.log(`ok ${++n} - ${msg}`);
const one = (boxes) => L.layout([boxes], L.PAGE).questions[0];

near(A.x, 15 * MM, "left");
near(A.width, 180 * MM, "width");
near(A.top, L.PAGE.height - 26 * MM, "top");
near(A.bottom, 24 * MM, "bottom");
// 247 mm, and 0.01 mm more: the templates are 841.92 pt tall, not A4's 841.89.
assert.ok(Math.abs(A.height / MM - 247) < 0.02, `content area ${A.height / MM} mm tall`);

// A one-box question: at the top-left of the content area, at its width's scale
// (180 mm ÷ 500 pt under 1.25), its source line 2 mm under it.
{
  const q = one([{ w: 500, h: 100 }]);
  const s = (180 * MM) / 500;
  near(q.scale, s, "scale");
  assert.equal(q.boxes.length, 1);
  const [b] = q.boxes;
  assert.equal(b.page, 0);
  near(b.x, A.x, "x");
  near(b.y + b.h, A.top, "top edge");
  near(b.w, 500 * s, "w");
  near(b.h, 100 * s, "h");
  assert.equal(q.line.page, 0);
  near(q.line.x, A.x, "line x");
  near(q.line.y, b.y - 2 * MM - 6, "line baseline");
  assert.equal(L.layout([[{ w: 500, h: 100 }]], L.PAGE).pages, 1);
  ok("a one-box question sits top-left at min(1.25, 180 mm ÷ its width), its source line 2 mm under it");
}

// A narrow box is printed at 1.25 at most.
near(one([{ w: 200, h: 50 }]).scale, 1.25, "narrow box");
ok("a narrow box prints at 1.25 at most");

// Two short questions share a page; a third short one starts a page of its own,
// a question that is not short gets one, and two short ones after it pair again.
{
  const short = [{ w: 400, h: 80 }]; // 100 pt tall at 1.25, plus the line: under 74 mm
  const long = [{ w: 400, h: 300 }]; // 375 pt at 1.25: over 74 mm
  const out = L.layout([short, short, short, long, short, short], L.PAGE);
  assert.deepEqual(
    out.questions.map((q) => q.boxes[0].page),
    [0, 0, 1, 2, 3, 3],
  );
  assert.equal(out.pages, 4);
  near(out.questions[0].boxes[0].y + out.questions[0].boxes[0].h, A.top, "first at the top");
  near(out.questions[1].boxes[0].y + out.questions[1].boxes[0].h, A.top - A.height / 2, "second at the midpoint");
  near(out.questions[5].boxes[0].y + out.questions[5].boxes[0].h, A.top - A.height / 2, "sixth at the midpoint");
  // 74 mm is short, boxes and source line together; a hair over is not.
  const block = 2 * MM + 8;
  const exactly = [{ w: 100, h: (74 * MM - block) / 1.25 }];
  assert.deepEqual(L.layout([exactly, exactly], L.PAGE).questions.map((q) => q.boxes[0].page), [0, 0]);
  const over = [{ w: 100, h: (74 * MM - block) / 1.25 + 0.1 }];
  assert.deepEqual(L.layout([over, exactly], L.PAGE).questions.map((q) => q.boxes[0].page), [0, 1]);
  ok("two short questions share a page, the second at the midpoint; 74 mm with the source line is short");
}

// A four-box question over a page break: one scale, never shrunk to fit; boxes
// one under another with no gap; the third does not fit under the second and
// starts the next page; the source line follows the last box; the next
// question starts a page of its own.
{
  const boxes = [1, 2, 3, 4].map(() => ({ w: 500, h: 250 }));
  const out = L.layout([boxes, [{ w: 400, h: 80 }]], L.PAGE);
  const q = out.questions[0];
  const s = (180 * MM) / 500;
  near(q.scale, s, "a four-box question keeps its width's scale");
  assert.deepEqual(q.boxes.map((b) => b.page), [0, 0, 1, 1]);
  near(q.boxes[0].y + q.boxes[0].h, A.top, "box 1 at the top");
  near(q.boxes[1].y + q.boxes[1].h, q.boxes[0].y, "box 2 right under box 1");
  near(q.boxes[2].y + q.boxes[2].h, A.top, "box 3 at the top of the next page");
  near(q.boxes[3].y + q.boxes[3].h, q.boxes[2].y, "box 4 right under box 3");
  for (const b of q.boxes) near(b.h, 250 * s, "every box at full scale");
  assert.equal(q.line.page, 1);
  near(q.line.y, q.boxes[3].y - 2 * MM - 6, "the line under the last box");
  assert.equal(out.questions[1].boxes[0].page, 2);
  assert.equal(out.pages, 3);
  ok("a four-box question flows over a page break at its width's scale, the line under its last box");
}

// The last box needs room for the source line too, so the line never sits alone.
{
  const s = (180 * MM) / 500;
  const first = (A.height - 30) / s; // leaves 30 pt under box 1
  const q = one([
    { w: 500, h: first },
    { w: 500, h: 20 / s }, // 20 pt: fits the 30 pt, but not with the 13.7 pt line
  ]);
  assert.deepEqual(q.boxes.map((b) => b.page), [0, 1]);
  assert.equal(q.line.page, 1);
  const r = one([
    { w: 500, h: first },
    { w: 500, h: 15 / s }, // 15 pt plus the line fits the 30 pt
  ]);
  assert.deepEqual(r.boxes.map((b) => b.page), [0, 0]);
  ok("a last box moves to the next page when its source line would not fit under it");
}

// A box wider than 180 mm is scaled down to exactly the content area's width.
{
  const q = one([{ w: 600, h: 100 }]);
  near(q.scale, (180 * MM) / 600, "scale");
  near(q.boxes[0].w, 180 * MM, "printed width");
  near(q.boxes[0].x + q.boxes[0].w, 195 * MM, "right edge at 195 mm");
  const two = one([{ w: 300, h: 40 }, { w: 700, h: 60 }]);
  near(two.scale, (180 * MM) / 700, "the widest box sets the scale");
  near(two.boxes[0].w, 300 * two.scale, "one scale for both");
  ok("a box wider than 180 mm is scaled to the content area's width, and so are its question's other boxes");
}

// A question nearly a page tall is not shrunk to leave room for working: it
// prints at its width's scale, as one a little taller that flows does.
{
  const q = one([{ w: 400, h: 500 }]); // 625 pt at 1.25: fits the 700 pt page
  near(q.scale, 1.25, "a tall question keeps its width's scale");
  near(q.boxes[0].h, 625, "printed 625 pt tall");
  const sum = one([{ w: 400, h: 200 }, { w: 400, h: 250 }]); // 562.5 pt: fits
  near(sum.scale, 1.25, "a tall stacked question too");
  assert.deepEqual(sum.boxes.map((b) => b.page), [0, 0]);
  // A box from a digital bank that just fits, and the same box 20 pt taller,
  // which no longer fits a page with its line: within 2% of each other.
  const fits = L.scaleOf([{ w: 482, h: 640 }], A.height);
  const over = L.scaleOf([{ w: 482, h: 660 }], A.height);
  assert.ok(fits.fits && !over.fits);
  near(fits.scale, (180 * MM) / 482, "the one that fits, at its width's scale");
  assert.ok(over.scale / fits.scale > 0.98, `${over.scale} against ${fits.scale}`);
  ok("a question nearly a page tall prints at its width's scale, like one a little taller");
}

// A box taller than a page at its width's scale: never cut, and brought down only
// until it fits a page with its source line, alone; a box no taller than an A4
// page then prints at 81% or more.
{
  const a4 = 297 * MM;
  const q = one([{ w: 500, h: a4 }]);
  near(q.boxes[0].h, A.height - (2 * MM + 8), "fills the page but for the line");
  assert.ok(q.scale >= 0.81, `scale ${q.scale}`);
  assert.equal(q.line.page, 0);
  assert.ok(q.line.y - 0.207 * 8 >= A.bottom - 0.01, "the line's descenders stay in the content area");
  const with2 = one([{ w: 500, h: 100 }, { w: 500, h: a4 }]);
  near(with2.scale, q.scale, "the tall box sets its question's scale");
  assert.deepEqual(with2.boxes.map((b) => b.page), [0, 1]);
  ok("a box taller than a page is never cut: it fits a page alone, at 81% or more for an A4 page's box");
}

// Every layout keeps every box and line inside the content area, never overlaps
// two boxes, keeps a question's boxes in order, never shrinks a question that
// does not fit, and never lets a question start before the one before it ends.
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let run = 0; run < 400; run++) {
    const qs = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () =>
      Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({
        w: 40 + rnd() * 700,
        h: 10 + rnd() * (rnd() < 0.2 ? 900 : 300),
      })),
    );
    const out = L.layout(qs, L.PAGE);
    const onPage = new Map();
    let last = -1;
    out.questions.forEach((q, i) => {
      const { scale, fits } = L.scaleOf(qs[i], A.height);
      assert.equal(q.scale, scale);
      const width = Math.min(1.25, (180 * MM) / Math.max(...qs[i].map((b) => b.w)));
      if (!fits) {
        const tallest = Math.max(...qs[i].map((b) => b.h));
        near(q.scale, Math.min(width, (A.height - 2 * MM - 8) / tallest), "a question that flows keeps its scale");
      } else near(q.scale, width, "a question that fits keeps its width's scale");
      assert.ok(q.boxes[0].page >= last, "starts after the one before");
      q.boxes.forEach((b, k) => {
        assert.ok(b.x >= A.x - 0.01 && b.x + b.w <= A.x + A.width + 0.01, "inside across");
        assert.ok(b.y >= A.bottom - 0.01 && b.y + b.h <= A.top + 0.01, "inside up and down");
        if (k) {
          const p = q.boxes[k - 1];
          assert.ok(b.page > p.page || (b.page === p.page && Math.abs(b.y + b.h - p.y) < 0.01), "in order");
        }
        const list = onPage.get(b.page) ?? [];
        for (const o of list) assert.ok(b.y + b.h <= o.y + 0.01 || o.y + o.h <= b.y + 0.01, "no overlap");
        list.push(b);
        onPage.set(b.page, list);
      });
      const end = q.boxes.at(-1);
      assert.equal(q.line.page, end.page);
      assert.ok(q.line.y - 0.207 * 8 >= A.bottom - 0.01, "the line inside the area");
      last = end.page;
    });
    assert.equal(out.pages, last + 1);
  }
  ok("400 random worksheets: everything inside the content area, in order, never overlapping, never shrunk to flow");
}

// The source line: the file name without .pdf, and its pages.
{
  assert.equal(L.sourceLine("U4 BOOKLET WORKSHEET 1 (L1-8).pdf", [12]), "U4 BOOKLET WORKSHEET 1 (L1-8) · p. 12");
  assert.equal(L.sourceLine("U4 BOOKLET WORKSHEET 1 (L1-8).PDF", [12, 13]), "U4 BOOKLET WORKSHEET 1 (L1-8) · pp. 12–13");
  assert.equal(L.sourceLine("Fractions.pdf", [12, 12, 13]), "Fractions · pp. 12–13");
  assert.equal(L.sourceLine("Fractions.pdf", [13, 12]), "Fractions · pp. 12–13");
  assert.equal(L.sourceLine("Fractions.pdf", [9, 4]), "Fractions · pp. 4, 9");
  assert.equal(L.sourceLine("Fractions.pdf", [4, 5, 9, 10, 11]), "Fractions · pp. 4–5, 9–11");
  assert.equal(L.sourceLine("notes.pdf.pdf", [1]), "notes.pdf · p. 1");
  ok("the source line reads 'name · p. 12' for one page and 'name · pp. 12–13' for two");
}

// Helvetica, as compose draws the line.
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const measure = (t) => font.widthOfTextAtSize(t, L.LINE_SIZE);

// A file name with characters outside WinAnsi: replaced, never a throw.
{
  const name = "Ôn tập Đại số 数学\tII — ½ ✓ ő.pdf";
  const line = L.sourceLine(name, [3]);
  assert.equal(line, "Ôn tâp Ðai sô ?? II — ½ ? o · p. 3");
  // Every accent WinAnsi has stays: "ố" keeps its "ô", "ậ" its "â".
  assert.equal(L.winAnsi("ố ễ ậ ǘ ő Đ đ"), "ô ê â ü o Ð d");
  assert.throws(() => font.encodeText("Đ"), /WinAnsi cannot encode/);
  font.encodeText(line);
  doc.addPage().drawText(line, { x: 10, y: 10, size: L.LINE_SIZE, font });
  // Whatever any character becomes, Helvetica can draw it.
  for (let c = 0; c <= 0xffff; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    const out = L.winAnsi(String.fromCodePoint(c));
    try {
      font.encodeText(out);
    } catch (err) {
      assert.fail(`U+${c.toString(16)} became ${JSON.stringify(out)}: ${err.message}`);
    }
  }
  assert.equal(L.winAnsi("😀"), "?");
  ok("a non-WinAnsi file name is replaced character by character, keeping every accent Helvetica can draw");
}

// A name too long for the content area is cut with "…", and the pages stay.
{
  const fit = { width: A.width, measure };
  const long = `${"Question Bank - Unit 5 and 6 (Textbook only) ".repeat(8)}.pdf`;
  const line = L.sourceLine(long, [12, 13], fit);
  assert.ok(measure(line) <= A.width, "fits");
  assert.ok(line.endsWith("… · pp. 12–13"), line);
  assert.ok(measure(line.replace("…", "Q…")) > A.width - 10, "no shorter than it need be");
  const short = L.sourceLine("Fractions.pdf", [4], fit);
  assert.equal(short, "Fractions · p. 4");
  ok("a source line too long for 180 mm cuts the name with '…' and keeps the pages");
}

// The file name (§6.5).
{
  const at = new Date(2026, 9, 17, 14, 30);
  assert.equal(L.worksheetName("homework", { code: "IM2T", name: "IM2 Trig" }, at), "MathVision Homework IM2T 2026-10-17 1430");
  assert.equal(L.worksheetName("lesson", { code: null, name: "Gr 5: banks/2026 [A] (x)" }, at), "MathVision Lesson Gr 5 banks2026 [A] (x) 2026-10-17 1430");
  assert.equal(L.worksheetName("lesson", { code: "  ", name: "Ünïcode ✓ Kurs" }, new Date(2026, 0, 2, 9, 5)), "MathVision Lesson Ünïcode Kurs 2026-01-02 0905");
  ok("the file name is 'MathVision {Label} {code, else name} {YYYY-MM-DD HHmm}', letters, digits, spaces, hyphens and brackets only");
}

// Print order: by bank, then box by box in box_no order by page and reading order.
{
  const q = (id, bank, ...boxes) => ({ id, bank, file: bank, boxes: boxes.map(([page, pos]) => ({ page, pos })) });
  const order = L.printOrder([
    q("e", "B / b.pdf", [1, 0]),
    q("d", "A / a.pdf", [2, 0]),
    q("b", "A / a.pdf", [1, 0], [1, 2]), // under the stimulus at p. 1 pos 0: its second box decides
    q("c", "A / a.pdf", [1, 0], [1, 1]),
    q("a", "A / a.pdf", [1, 3]),
  ]).map((x) => x.id);
  assert.deepEqual(order, ["c", "b", "a", "d", "e"]);
  const folders = [
    { id: "1", parent_id: null, name: "Banks" },
    { id: "2", parent_id: "1", name: "Gr 5" },
  ];
  assert.equal(L.bankPath("Fractions.pdf", "2", folders), "Banks / Gr 5 / Fractions.pdf");
  assert.equal(L.bankPath("Loose.pdf", null, folders), "Loose.pdf");
  ok("picks print in bank order, questions under one stimulus by their second box");
}
console.log(`1..${n}`);
