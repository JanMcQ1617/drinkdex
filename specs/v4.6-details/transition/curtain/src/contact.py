"""Contact sheet: 12 frames across the transition, labelled in ms from its start (t = 0.40 s).
  python3 -I contact.py <flat frames dir> <out.png>"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
T0 = 0.40
# seconds into the clip; frame n (1-based) is t = (n - 1) / 60
TIMES = [0.383, 0.45, 0.50, 0.55, 0.60, 0.667, 0.733, 0.817, 0.90, 1.00, 1.10, 1.30]
W, H = 260, 563  # each frame at a third (780 x 1688 -> 260 x 563)
COLS, PAD, LAB = 6, 24, 30
font = ImageFont.truetype(os.path.join(HERE, 'assets/fonts/InterLatin_500Medium.ttf'), 15)
head = ImageFont.truetype(os.path.join(HERE, 'assets/fonts/InterLatin_600SemiBold.ttf'), 20)
rows = (len(TIMES) + COLS - 1) // COLS
sheet = Image.new('RGB', (PAD + COLS * (W + PAD), 64 + rows * (H + LAB + PAD) + PAD), (233, 233, 233))
d = ImageDraw.Draw(sheet)
d.text((PAD, 22), 'Sipply v4.6 "Hairline curtain" v2: film end -> Home, 390 x 844 pt (ms from the end of the film)', font=head, fill=(10, 10, 10))
for i, t in enumerate(TIMES):
    n = round(t * 60) + 1
    im = Image.open(os.path.join(src, 'frame_%06d.png' % n)).convert('RGB').resize((W, H), Image.LANCZOS)
    x = PAD + (i % COLS) * (W + PAD)
    y = 64 + (i // COLS) * (H + LAB + PAD)
    ms = round((t - T0) * 1000)
    label = ('film end, %d ms' % ms) if ms < 0 else ('Home, +%d ms' % ms if t >= 1.22 else '+%d ms' % ms)
    d.text((x, y), label, font=font, fill=(60, 60, 60))
    sheet.paste(im, (x, y + LAB))
    d.rectangle([x - 1, y + LAB - 1, x + W, y + LAB + H], outline=(205, 205, 205))
sheet.save(out)
