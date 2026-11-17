from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase.pdfmetrics import stringWidth
import sys

OUT = sys.argv[1]
W, H = letter
NAVY, ORANGE, INK, MUTED, PALE = HexColor("#1a2236"), HexColor("#ea6b14"), HexColor("#1c2333"), HexColor("#5b6477"), HexColor("#f3f5fa")
LINK = "https://freddyfixit.ca/?utm_source=checklist&utm_medium=pdf&utm_campaign=winter-checklist"
c = canvas.Canvas(OUT, pagesize=letter)
c.setTitle("Calgary Winter Home Checklist"); c.setAuthor("Freddy Fix It"); c.setSubject("Seasonal home maintenance checklist for Calgary homes")

# header
c.setFillColor(NAVY); c.rect(0, H - 118, W, 118, stroke=0, fill=1)
c.setFillColor(ORANGE); c.rect(40, H - 44, 34, 5, stroke=0, fill=1)
c.setFont("Helvetica-Bold", 9); c.drawString(82, H - 45, "FREDDY FIX IT   ·   CALGARY HOME SERVICES")
c.setFillColor(HexColor("#f0f4ff")); c.setFont("Helvetica-Bold", 30); c.drawString(40, H - 82, "Calgary Winter Home Checklist")
c.setFont("Helvetica", 11.5); c.setFillColor(HexColor("#c9d2e6")); c.drawString(40, H - 102, "Ten minutes now beats a burst pipe in January. Tick these off before the first deep freeze.")

def wrap(text, font, size, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if stringWidth(t, font, size) <= width: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def section(x, y, w, title, items):
    c.setFillColor(ORANGE); c.rect(x, y - 3, 4, 15, stroke=0, fill=1)
    c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 13); c.drawString(x + 11, y, title)
    y -= 21
    for text, tag in items:
        lines = wrap(text, "Helvetica", 10, w - 24 - (44 if tag else 0))
        c.setStrokeColor(NAVY); c.setLineWidth(1.1); c.setFillColor(HexColor("#ffffff")); c.roundRect(x, y - 2.5, 10.5, 10.5, 2, stroke=1, fill=1)
        c.setFillColor(INK); c.setFont("Helvetica", 10)
        for i, ln in enumerate(lines): c.drawString(x + 18, y - i * 12.6, ln)
        if tag:
            pro = tag == "PRO"
            c.setFillColor(ORANGE if pro else PALE); c.roundRect(x + w - 34, y - 3, 34, 12, 6, stroke=0, fill=1)
            c.setFillColor(HexColor("#ffffff") if pro else MUTED); c.setFont("Helvetica-Bold", 7); c.drawCentredString(x + w - 17, y + 0.5, tag)
        y -= len(lines) * 12.6 + 6.5
    return y - 9

LX, RX, CW = 40, 316, 256
y = H - 150
y = section(LX, y, CW, "Before the first deep freeze", [
    ("Shut off and drain outdoor taps, and disconnect garden hoses.", "DIY"),
    ("Find your main water shut-off valve and check that it turns.", "DIY"),
    ("Replace the furnace filter.", "DIY"),
    ("Have the furnace inspected if it has not been serviced this year.", "PRO"),
    ("Test smoke and carbon monoxide alarms and replace old batteries.", "DIY"),
    ("Clear leaves from eavestroughs and downspouts so meltwater can drain.", "DIY"),
    ("Check weatherstripping and caulking around doors and windows.", "DIY"),
    ("Make sure the furnace intake and exhaust vents outside are clear.", "DIY"),
    ("Have the fireplace or wood stove chimney checked before you use it.", "PRO"),
])
y = section(LX, y, CW, "Every month until spring", [
    ("Check the furnace filter and change it when it looks grey.", "DIY"),
    ("Keep outside vents, the gas meter and window wells clear of snow and ice.", "DIY"),
    ("On very cold nights, open cabinet doors under sinks on outside walls.", "DIY"),
    ("Run the taps in rooms you rarely use.", "DIY"),
    ("Look along the roof edge for thick ice or large icicles. Do not chip at them.", "PRO"),
    ("Going away? Leave the heat on and ask someone to look in on the house.", "DIY"),
])
y2 = H - 150
y2 = section(RX, y2, CW, "If a pipe freezes", [
    ("Shut off the main water valve.", None),
    ("Open the nearest tap to relieve the pressure.", None),
    ("Warm the pipe slowly with a hair dryer or warm towels. Never use an open flame.", None),
    ("If you cannot find or reach the frozen section, or it has split, call a plumber.", None),
])
y2 = section(RX, y2, CW, "Stop and get help right away", [
    ("You smell gas: leave the house, then call 911 or your gas utility's emergency line.", None),
    ("A carbon monoxide alarm sounds: get everyone outside and call 911.", None),
    ("The furnace keeps shutting off, or blows cold air.", None),
    ("A breaker trips again and again, or an outlet or switch feels warm.", None),
    ("A new water stain appears on a ceiling or wall.", None),
    ("Water is coming in at the roof edge or around a window.", None),
])
# key
c.setFont("Helvetica", 8.5); c.setFillColor(MUTED)
c.setFillColor(PALE); c.roundRect(RX, y2 - 4, 34, 12, 6, stroke=0, fill=1); c.setFillColor(MUTED); c.setFont("Helvetica-Bold", 7); c.drawCentredString(RX + 17, y2 - 0.5, "DIY")
c.setFont("Helvetica", 8.5); c.drawString(RX + 40, y2 - 1, "most people can do this themselves")
c.setFillColor(ORANGE); c.roundRect(RX, y2 - 22, 34, 12, 6, stroke=0, fill=1); c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold", 7); c.drawCentredString(RX + 17, y2 - 18.5, "PRO")
c.setFillColor(MUTED); c.setFont("Helvetica", 8.5); c.drawString(RX + 40, y2 - 19, "book a licensed professional")

# call to action
by = 60
c.setFillColor(NAVY); c.roundRect(40, by, W - 80, 84, 10, stroke=0, fill=1)
c.setFillColor(HexColor("#f0f4ff")); c.setFont("Helvetica-Bold", 15); c.drawString(58, by + 58, "Rather not do it yourself?")
c.setFont("Helvetica", 10.5); c.setFillColor(HexColor("#c9d2e6"))
for i, ln in enumerate(wrap("Describe the job once at freddyfixit.ca. Local Calgary pros send you estimates, you see the price before you choose, and you pick who does the work.", "Helvetica", 10.5, W - 80 - 36 - 170)):
    c.drawString(58, by + 41 - i * 13.5, ln)
c.setFillColor(ORANGE); c.roundRect(W - 196, by + 28, 138, 28, 8, stroke=0, fill=1)
c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold", 12); c.drawCentredString(W - 127, by + 38, "freddyfixit.ca")
c.linkURL(LINK, (40, by, W - 40, by + 84), relative=0)
c.setFillColor(MUTED); c.setFont("Helvetica", 7.5)
c.drawString(40, 44, "General guidance for typical Calgary homes, not a substitute for an inspection by a qualified professional. Gas, electrical panel, roof and")
c.drawString(40, 34, "structural work should be done by licensed trades. If you are unsure whether something is safe, stop and ask a professional.")
c.showPage(); c.save()
