import sys
from PIL import Image, ImageDraw, ImageFont
SP, D, FONTS = sys.argv[1:4]
f = lambda w, s: ImageFont.truetype(f"{FONTS}/InterLatin_{w}.ttf", s)
H1, LEDE, B, CAP, SM = f('600SemiBold', 38), f('400Regular', 20), f('600SemiBold', 19), f('400Regular', 18), f('500Medium', 16)
CAMP = '#D0102C'
W, H = 2400, 1500
im = Image.new('RGB', (W, H), '#EDEDED'); d = ImageDraw.Draw(im)
d.text((48, 40), 'Sipply v4.6 details: Cocktail menu', font=H1, fill='#0A0A0A')
d.text((48, 92), 'Four marks, all Campari, all ornament: the divider, the menu rule, the leader, the brackets. One or two per screen, never touching the six red places. Nothing new to read.', font=LEDE, fill='#3A3A3A')
phones = [
  ('home', 'Home', ['Divider between posts: 0.5 pt hairlines', 'and a 5 pt diamond, centred.']),
  ('dex', 'Dex', ['Leader from the section name to its', 'count: 1 pt dots, 4 pt pitch, on the baseline.']),
  ('drink', 'Drink page', ['Divider closes the facts, before your own', 'record. The plate and the key stay as they are.']),
  ('profile', 'Profile', ['Menu rule under the title bar (two 0.5 pt', 'lines, 2 pt apart). Leader to “1 running”.']),
]
x, y0, pw, ph, g = 48, 150, 440, 956, 28
for stem, name, lines in phones:
    p = Image.open(f"{D}/{stem}.png").convert('RGB').resize((pw, ph), Image.LANCZOS)
    im.paste(p, (x, y0)); d.rectangle((x-1, y0-1, x+pw, y0+ph), outline='#D0D0D0')
    yy = y0 + ph + 18
    d.text((x, yy), name, font=B, fill='#0A0A0A'); yy += 30
    for l in lines: d.text((x, yy), l, font=CAP, fill='#3A3A3A'); yy += 25
    x += pw + g
# right column: the three details at 3x, before over after
cx = x + 12; cw = W - 48 - cx
d.text((cx, y0 - 4), 'At 3x, before / after', font=B, fill='#0A0A0A')
yy = y0 + 36
crops = [('home', (110, 812, 330, 856), 'Divider'), ('profile', (230, 380, 416, 412), 'Leader'), ('lone', (12, 817, 160, 887), 'Brackets (staged; see rules)')]
for stem, (a, b, c, e), lab in crops:
    d.text((cx, yy), lab, font=SM, fill='#5C5C5C'); yy += 26
    for pre in ('b3', 'a3'):
        cr = Image.open(f"{SP}/{pre}-{stem}.png").convert('RGB').crop((a*3, b*3, c*3, e*3))
        s = cw / cr.width
        if cr.height * s > 150: s = 150 / cr.height
        cr = cr.resize((round(cr.width*s), round(cr.height*s)), Image.LANCZOS)
        im.paste(cr, (cx, yy)); d.rectangle((cx-1, yy-1, cx+cr.width, yy+cr.height), outline='#D0D0D0')
        yy += cr.height + 10
    yy += 22
# the budget, as a footnote
d.text((cx, yy + 4), 'Budget: at most 2 marks a screen, 48 pt apart,', font=CAP, fill='#3A3A3A')
d.text((cx, yy + 29), 'never in the tab bar, on a key, over a photo.', font=CAP, fill='#3A3A3A')
d.line((48, 1330, W-48, 1330), fill='#D0D0D0', width=1)
d.text((48, 1352), 'Never', font=B, fill='#0A0A0A')
d.text((48, 1384), 'In the tab bar · on or around a key, a plate, the logo or the Activity dot · on or over a photo · in a Dex grid cell, a person row or a drink row · on story rings or avatars · as text, a count or a state.', font=CAP, fill='#3A3A3A')
d.text((48, 1412), 'A second mark on a screen stands at least 48 pt from the first and 24 pt from any of the six red places. Brackets live only around a lone print (catch card, post sheet, your print on the drink page when it stands clear).', font=CAP, fill='#3A3A3A')
im.save(f"{D}/board.png"); print(im.size, yy)
