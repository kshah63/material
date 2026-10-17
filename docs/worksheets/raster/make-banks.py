# Test banks for the all-raster compose measurement (docs/WORKSHEETS.md §6.3):
#   digital.pdf  4 pages of numbered questions, embedded TrueType, vector diagrams
#   scanned.pdf  the same pages as 200 ppi greyscale JPEG scans, tilted, with noise
#   rotated.pdf  digital page 1 with /Rotate 90
#   locked.pdf   digital.pdf locked against printing, copying and changes (AES-256)
#   layered.pdf  digital page 1 with an "Answers" layer, off for viewing and on
#                for printing, as a teacher edition might ship (§6.3, §9.1)
#   colour-scan.pdf  40 pages: the 4 digital pages as 300 ppi colour JPEG scans,
#                tilted, toned and noisy, so every pick on a new page is a new decode
#   boxes.json   the 16 question boxes, PDF points; boxes-max.json the largest crop;
#   boxes-rot.json page 1's, for rotated.pdf; boxes-layered.json question 1, under
#   the answer; boxes-colour.json the colour scan's 160
# Usage: python3 -I make-banks.py <out dir>   (needs reportlab, Pillow, numpy, pypdf, pdftoppm)
import io, json, os, random, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter
from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DecodedStreamObject, DictionaryObject, NameObject, TextStringObject
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
pdfmetrics.registerFont(TTFont("DV", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DVB", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
W, H = A4
random.seed(7)
np.random.seed(7)
texts = [
    "Simplify the expression 3x + 5y - 2x + 7y - 4 and state the coefficient of y.",
    "A rectangle has length (2x + 3) cm and width (x - 1) cm. Write an expression for its area.",
    "Find the value of 3/4 + 5/6 - 1/3. Give your answer as a mixed number in its simplest form.",
    "The mean of five numbers is 12. Four of the numbers are 9, 14, 11 and 15. Find the fifth number.",
    "Solve the simultaneous equations 2x + y = 11 and x - y = 1, showing all your working clearly.",
    "A shop sells pens at $1.20 each or a pack of 6 for $6.50. How much is saved per pen by buying a pack?",
]
boxes, qn = [], 1
c = canvas.Canvas(os.path.join(out, "digital.pdf"), pagesize=A4)
for p in range(1, 5):
    c.setFont("DV", 8)
    c.drawString(40, H - 30, "Grade 6 Mathematics  Practice Bank  Chapter %d" % p)
    c.drawString(W / 2 - 10, 25, str(p))
    y = H - 60
    while y >= 160:
        top = y
        c.setFont("DVB", 11); c.drawString(50, y - 12, "%d." % qn)
        c.setFont("DV", 11)
        line, ly = "", y - 12
        for w_ in random.choice(texts).split():
            if c.stringWidth(line + " " + w_, "DV", 11) > 440:
                c.drawString(75, ly, line.strip()); ly -= 15; line = ""
            line += " " + w_
        c.drawString(75, ly, line.strip()); ly -= 18
        kind = qn % 4
        if kind == 0:  # triangle
            c.setLineWidth(0.8)
            a, b, d = (110, ly - 70), (230, ly - 70), (150, ly - 5)
            c.line(*a, *b); c.line(*b, *d); c.line(*d, *a)
            c.setFont("DV", 9)
            c.drawString(160, ly - 82, "12 cm"); c.drawString(118, ly - 35, "8 cm"); c.drawString(195, ly - 35, "x")
            c.arc(a[0] - 10, a[1] - 10, a[0] + 10, a[1] + 10, 0, 58)
            ly -= 90
        elif kind == 1:  # number line
            c.setLineWidth(0.8); c.line(90, ly - 20, 480, ly - 20)
            for i in range(11):
                xx = 90 + i * 39
                c.line(xx, ly - 24, xx, ly - 16); c.setFont("DV", 8); c.drawCentredString(xx, ly - 34, str(i - 5))
            ly -= 45
        elif kind == 2:  # table
            c.setLineWidth(0.6)
            for r in range(4): c.line(90, ly - r * 16, 390, ly - r * 16)
            for cc in range(6): c.line(90 + cc * 60, ly, 90 + cc * 60, ly - 48)
            c.setFont("DV", 9)
            for r in range(3):
                for cc in range(5): c.drawCentredString(120 + cc * 60, ly - 12 - r * 16, str(random.randint(1, 40)))
            ly -= 58
        c.setFont("DV", 11); c.drawString(75, ly - 4, "(a) Show your working."); ly -= 22
        c.setDash(1, 2)
        for _ in range(2):
            c.line(75, ly - 4, 520, ly - 4); ly -= 18
        c.setDash()
        c.drawRightString(520, ly + 2, "[%d marks]" % random.randint(2, 5))
        boxes.append({"page": p, "x0": 46, "y0": ly - 4, "x1": 528, "y1": top - 2, "n": qn})
        y = ly - 16
        qn += 1
    c.showPage()
c.save()
json.dump(boxes, open(os.path.join(out, "boxes.json"), "w"))
json.dump([{"page": 1, "x0": 40, "y0": 400, "x1": 550, "y1": 785, "n": "max"}] * 3,
          open(os.path.join(out, "boxes-max.json"), "w"))

subprocess.run(["pdftoppm", "-r", "200", "-gray", os.path.join(out, "digital.pdf"), os.path.join(out, "pg")], check=True)
c = canvas.Canvas(os.path.join(out, "scanned.pdf"), pagesize=A4)
for p in range(1, 5):
    fn = next(f for f in sorted(os.listdir(out)) if f.startswith("pg") and f.endswith("-%d.pgm" % p))
    im = Image.open(os.path.join(out, fn)).convert("L").rotate(0.4, fillcolor=255, resample=Image.BICUBIC)
    a = np.asarray(im).astype(np.float32) * 0.93 + 12 + np.random.normal(0, 6, im.size[::-1])
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))
    bio = io.BytesIO(); im.save(bio, "JPEG", quality=80); bio.seek(0)
    c.drawImage(ImageReader(bio), 0, 0, W, H); c.showPage()
    os.remove(os.path.join(out, fn))
c.save()

w = PdfWriter(); pg = PdfReader(os.path.join(out, "digital.pdf")).pages[0]; pg.rotate(90); w.add_page(pg)
w.write(os.path.join(out, "rotated.pdf"))
json.dump([b for b in boxes if b["page"] == 1], open(os.path.join(out, "boxes-rot.json"), "w"))
w = PdfWriter(clone_from=os.path.join(out, "digital.pdf"))
w.encrypt(user_password="", owner_password="owner-secret", permissions_flag=0, algorithm="AES-256")
w.write(os.path.join(out, "locked.pdf"))

# An answer in red, in question 1's box, inside an optional-content group that
# pdf.js hides for intent "display" and shows for intent "print".
N = NameObject
w = PdfWriter(); w.add_page(PdfReader(os.path.join(out, "digital.pdf")).pages[0])
ocg = w._add_object(DictionaryObject({
    N("/Type"): N("/OCG"), N("/Name"): TextStringObject("Answers"),
    N("/Usage"): DictionaryObject({
        N("/View"): DictionaryObject({N("/ViewState"): N("/OFF")}),
        N("/Print"): DictionaryObject({N("/PrintState"): N("/ON")})})}))
w._root_object[N("/OCProperties")] = DictionaryObject({
    N("/OCGs"): ArrayObject([ocg]),
    N("/D"): DictionaryObject({
        N("/ON"): ArrayObject([ocg]), N("/Order"): ArrayObject([ocg]),
        N("/AS"): ArrayObject([
            DictionaryObject({N("/Event"): N("/View"), N("/OCGs"): ArrayObject([ocg]), N("/Category"): ArrayObject([N("/View")])}),
            DictionaryObject({N("/Event"): N("/Print"), N("/OCGs"): ArrayObject([ocg]), N("/Category"): ArrayObject([N("/Print")])})])})})
page = w.pages[0]
res = page["/Resources"].get_object()
res[N("/Properties")] = DictionaryObject({N("/Ans"): ocg})
res["/Font"].get_object()[N("/FAns")] = DictionaryObject({
    N("/Type"): N("/Font"), N("/Subtype"): N("/Type1"), N("/BaseFont"): N("/Helvetica")})
b1 = boxes[0]
def stream(data):
    st = DecodedStreamObject(); st.set_data(data); return w._add_object(st)
ans = b"/OC /Ans BDC BT 0.85 0 0 rg /FAns 16 Tf %d %d Td (Answer: x + 12y - 4) Tj ET EMC" % (
    300, int((b1["y0"] + b1["y1"]) / 2))
old = page[N("/Contents")]
old = list(old.get_object()) if isinstance(old.get_object(), ArrayObject) else [old]
page[N("/Contents")] = ArrayObject([stream(b"q"), *old, stream(b"Q"), stream(ans)])
w.write(os.path.join(out, "layered.pdf"))
json.dump([b1], open(os.path.join(out, "boxes-layered.json"), "w"))

subprocess.run(["pdftoppm", "-r", "300", os.path.join(out, "digital.pdf"), os.path.join(out, "cs")], check=True)
base = [Image.open(os.path.join(out, f)).convert("RGB")
        for f in sorted(f for f in os.listdir(out) if f.startswith("cs") and f.endswith(".ppm"))]
rng = np.random.default_rng(3)
tone = np.array([248, 244, 232], np.float32) / 255.0  # paper
c = canvas.Canvas(os.path.join(out, "colour-scan.pdf"), pagesize=A4)
cboxes = []
for i in range(40):
    im = base[i % 4].rotate(rng.uniform(-0.6, 0.6), fillcolor=(255, 255, 255), resample=Image.BICUBIC)
    a = np.asarray(im).astype(np.float32) * tone * 0.95 + 8 + rng.normal(0, 5, (im.size[1], im.size[0], 3))
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.4))
    bio = io.BytesIO(); im.save(bio, "JPEG", quality=75); bio.seek(0)
    c.drawImage(ImageReader(bio), 0, 0, W, H); c.showPage()
    cboxes += [dict(b, page=i + 1) for b in boxes if b["page"] == i % 4 + 1]
c.save()
for f in os.listdir(out):
    if f.startswith("cs") and f.endswith(".ppm"): os.remove(os.path.join(out, f))
json.dump(cboxes, open(os.path.join(out, "boxes-colour.json"), "w"))
print(len(boxes), "boxes;", len(cboxes), "on the colour scan,",
      round(os.path.getsize(os.path.join(out, "colour-scan.pdf")) / 1e6, 1), "MB")
