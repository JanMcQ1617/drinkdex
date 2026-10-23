import sys
from PIL import Image, ImageDraw, ImageFont
SP, OUT, FONTS = sys.argv[1], sys.argv[2], sys.argv[3]
f = lambda w, s: ImageFont.truetype(f"{FONTS}/InterLatin_{w}.ttf", s)
H1, CAP, SM = f('600SemiBold', 30), f('400Regular', 24), f('500Medium', 22)
rows = [  # (file stem, box in pt, title)
  ('home',    (110, 812, 330, 856), 'The divider: 40 pt of 0.5 pt hairline, 7 pt air, a 5 pt diamond, 7 pt air, 40 pt. Between posts.'),
  ('profile', (24, 374, 416, 418),  'The leader: 1 pt dots on a 4 pt pitch, on the baseline, 8 pt off each word. Only where a value ends the row.'),
  ('lone',    (12, 817, 300, 887),  'The brackets: 1 pt, 6 pt arms, 4 pt off the print. Staged: the drink page’s own print with nothing pinned over it.'),
]
S = 3; pad = 48; gap = 40
crops = []
for stem, (x0, y0, x1, y1), t in rows:
    b = Image.open(f"{SP}/b3-{stem}.png").convert('RGB').crop((x0*S, y0*S, x1*S, y1*S))
    a = Image.open(f"{SP}/a3-{stem}.png").convert('RGB').crop((x0*S, y0*S, x1*S, y1*S))
    crops.append((b, a, t))
W = pad*2 + max(b.width*2 + gap for b, a, t in crops)
H = pad + 60 + sum(b.height + 110 for b, a, t in crops) + pad
im = Image.new('RGB', (W, H), '#EDEDED'); d = ImageDraw.Draw(im)
d.text((pad, pad), 'Before / after at 3x (iPhone pixels, not resampled)', font=H1, fill='#0A0A0A')
y = pad + 70
for b, a, t in crops:
    d.text((pad, y), t, font=CAP, fill='#3A3A3A'); y += 44
    for i, (img, lab) in enumerate(((b, 'before'), (a, 'after'))):
        x = pad + i*(b.width + gap)
        im.paste(img, (x, y + 30)); d.text((x, y), lab, font=SM, fill='#5C5C5C')
        d.rectangle((x-1, y+29, x+img.width, y+30+img.height), outline='#D6D6D6')
    y += b.height + 30 + 36
im.save(OUT); print(im.size)
