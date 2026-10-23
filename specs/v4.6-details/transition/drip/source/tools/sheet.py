#!/usr/bin/env python3
"""out/flat -> ../frames.png: a contact sheet across the transition, labelled in ms from T0.
  python3 -I tools/sheet.py [ms ms ...]"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRE_F = 24
MS = [int(a) for a in sys.argv[1:]] or [0, 60, 110, 240, 360, 460, 500, 540, 600, 680, 780, 1300]
TW = 300
frames = []
for ms in MS:
    f = 1 + PRE_F + round(ms * 60 / 1000)  # png-sequence frames are numbered from 1
    im = Image.open(os.path.join(R, 'out', 'flat', 'frame_%06d.png' % f)).convert('RGB')
    frames.append((ms, f, im.resize((TW, round(im.height * TW / im.width)), Image.LANCZOS)))
cols = 6
rows = (len(frames) + cols - 1) // cols
th = frames[0][2].height
pad, lab = 20, 34
sheet = Image.new('RGB', (pad + cols * (TW + pad), pad + rows * (th + lab + pad)), (233, 233, 233))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype(os.path.join(R, 'assets', 'InterLatin_500Medium.ttf'), 18)
except Exception:
    font = ImageFont.load_default()
for i, (ms, f, im) in enumerate(frames):
    x = pad + (i % cols) * (TW + pad)
    y = pad + (i // cols) * (th + lab + pad)
    d.text((x, y + 4), '%d ms' % ms + ('  (Home)' if ms > 880 else ''), fill=(40, 40, 40), font=font)
    sheet.paste(im, (x, y + lab))
    d.rectangle([x - 1, y + lab - 1, x + TW, y + lab + th], outline=(200, 200, 200))
out = os.path.join(os.path.dirname(R), 'frames.png')
sheet.save(out)
print(out, sheet.size)
