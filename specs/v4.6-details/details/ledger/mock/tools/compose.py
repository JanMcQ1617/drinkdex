"""Builds detail-crops.png and board.png for the ledger direction (v2) from the
renders tools/render.sh makes (ledger/*.png at 2x, mock/out/*@3x.png).
Run after both render passes:  python3 -I tools/compose.py

v2: the board shows the phones at their full 2x size (they were shrunk to 1x
in v1, where a 1 px ruling vanished) and, under each phone, its rulings
cropped from the 3x render at 1:1, so what Jan approves is what a 3x phone
draws: 2 device px of #D0102C."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

MOCK = Path(__file__).resolve().parent.parent
LEDGER = MOCK.parent
OUT = MOCK / 'out'
FONTS = MOCK.parents[3].parent / 'assets' / 'fonts'
f = lambda w, s: ImageFont.truetype(str(FONTS / f'InterLatin_{w}.ttf'), s)
R, M6, M4 = f('400Regular', 1), f('600SemiBold', 1), f('500Medium', 1)
INK, MUTED, BG, CAMPARI = (10, 10, 10), (92, 92, 92), (236, 236, 236), (208, 16, 44)

# the crops, in app points (x0, y0, x1, y1); the 3x renders are 3 px per pt
CROPS = [
    ('home', (0, 180, 292, 240), 'Home: the head double rule (0.5 / 1 / 0.5 pt), centred between the story labels and the first ring'),
    ('home', (0, 800, 292, 872), 'Home: the 24 pt entry rule, centred in the gap between a post and the next one'),
    ('dex', (0, 226, 292, 300), 'Dex: the head rule, 6 pt under the section head, the grid 12 pt clear below it'),
    ('drink', (0, 576, 292, 800), 'Drink page: the margin rule at x 12 (name cap height to the last baseline) and the column rule between the facts'),
    ('profile', (0, 326, 292, 420), 'Profile: the margin rule beside the two ledger rows, cap height to baseline'),
]


def crop(state, screen, box):
    im = Image.open(OUT / f'{state}-{screen}@3x.png').convert('RGB')
    return im.crop(tuple(v * 3 for v in box))


def wrap(d, text, font, width):
    words, line, lines = text.split(' '), '', []
    for w in words:
        t = (line + ' ' + w).strip()
        if d.textlength(t, font=font) > width and line:
            lines.append(line); line = w
        else:
            line = t
    lines.append(line)
    return lines


def system_strip(im, d, x0, y0, width):
    """The five rulings drawn at 3 px per pt (the weight 2 px, as a 3x phone draws it), grey bars standing in for type."""
    GREY, k, w = (227, 227, 227), 3, 2
    tiles = [
        ('Head rule', 'Single, content width, 6 pt under a section head that opens a grid or list; 12 pt clear of any image'),
        ('Head double rule', '0.5 / gap 1 / 0.5 pt, Home only, centred between the stories and the feed'),
        ('Margin rule', 'Vertical at x 12, from the first cap height to the last baseline, beside a record of text'),
        ('Column rule', 'Vertical, centred in an existing 24 pt gutter between two text columns'),
        ('Entry rule', '24 pt at the text margin, centred in the gap that closes a feed post'),
    ]
    n, g = len(tiles), 24
    tw, th = (width - g * (n - 1)) // n, 200
    d.text((x0, y0 - 52), 'The system: one ruling, five placements. Campari #D0102C at 0.5 pt rounded to device pixels (1 px at 2x, 2 px at 3x), straight, square-ended, never closed into a box.',
           font=M4.font_variant(size=26), fill=INK)
    hl = lambda x1, x2, yy: d.rectangle((x1, yy, x2, yy + w - 1), fill=CAMPARI)
    vl = lambda xx, y1, y2: d.rectangle((xx, y1, xx + w - 1, y2), fill=CAMPARI)
    for i, (name, spec) in enumerate(tiles):
        x = x0 + i * (tw + g); y = y0
        d.rectangle((x, y, x + tw, y + th), fill=(255, 255, 255))
        cx, cy = x + 36, y + 40
        if i == 0:
            d.rectangle((cx, cy, cx + 200, cy + 22), fill=GREY); hl(cx, x + tw - 36, cy + 22 + 6 * k)
            d.rectangle((cx, cy + 22 + 18 * k, cx + 150, cy + 150), fill=GREY); d.rectangle((cx + 170, cy + 22 + 18 * k, cx + 320, cy + 150), fill=GREY)
        elif i == 1:
            for j in range(5): d.ellipse((cx + j * 80, cy - 6, cx + j * 80 + 60, cy + 54), fill=GREY)
            hl(cx, x + tw - 36, cy + 54 + 30); hl(cx, x + tw - 36, cy + 54 + 30 + w + k)
            d.ellipse((cx, cy + 54 + 30 + 2 * w + k + 30, cx + 40, cy + 54 + 30 + 2 * w + k + 70), fill=GREY)
        elif i == 2:
            vl(cx, cy, cy + 128)
            for j in range(4): d.rectangle((cx + 36, cy + j * 36, cx + 36 + [260, 160, 220, 120][j], cy + j * 36 + 20), fill=GREY)
        elif i == 3:
            mid = x + tw // 2
            vl(mid, cy, cy + 120)
            for j in range(3):
                d.rectangle((cx, cy + j * 50, mid - 36, cy + j * 50 + 20), fill=GREY); d.rectangle((mid + 36, cy + j * 50, x + tw - 36, cy + j * 50 + 20), fill=GREY)
        else:
            d.rectangle((cx, cy, cx + 300, cy + 20), fill=GREY); d.rectangle((cx, cy + 34, cx + 130, cy + 54), fill=GREY)
            hl(cx, cx + 24 * k, cy + 54 + 34)
            d.ellipse((cx, cy + 120, cx + 40, cy + 160), fill=GREY)
        d.text((x, y + th + 16), name, font=M6.font_variant(size=26), fill=INK)
        yy = y + th + 52
        for l in wrap(d, spec, R.font_variant(size=22), tw):
            d.text((x, yy), l, font=R.font_variant(size=22), fill=MUTED); yy += 30


def detail_crops():
    pad, gap, lab = 48, 32, 44
    pairs = [(crop('before', s, b), crop('after', s, b), cap) for s, b, cap in CROPS]
    W = pad * 2 + max(a.width + b.width + gap for a, b, _ in pairs)
    H = 120 + sum(a.height + lab + 74 for a, _, _ in pairs) + pad
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((pad, 40), 'Bar ledger v2: the rulings at 3x, 1:1 (1 pt = 3 px; every ruling is 2 px of #D0102C)', font=M6.font_variant(size=34), fill=INK)
    y = 120
    for a, b, cap in pairs:
        d.text((pad, y), cap, font=R.font_variant(size=24), fill=INK)
        y += lab
        d.text((pad, y + a.height + 8), 'without the rulings (v2 spacing)', font=R.font_variant(size=20), fill=MUTED)
        d.text((pad + a.width + gap, y + b.height + 8), 'after (ledger v2)', font=R.font_variant(size=20), fill=MUTED)
        im.paste(a, (pad, y)); im.paste(b, (pad + a.width + gap, y))
        y += a.height + 74
    im.save(LEDGER / 'detail-crops.png')


def board():
    pw, ph, g, x0, y0 = 880, 1912, 48, 60, 190
    W = x0 * 2 + 4 * pw + 3 * g
    caps = {
        'home': ['Head double rule between the stories and the feed', 'A 24 pt entry rule closing each post'],
        'dex': ['Head rule under each section head', 'The red 14 stays as it was: no underline'],
        'drink': ['Margin rule beside the record, name to last fact', 'Column rule between the two fact columns'],
        'profile': ['Margin rule beside your two ledger rows', 'The red 14 stays as it was: no underline'],
    }
    by_screen = {}
    for s, b, cap in CROPS:
        by_screen.setdefault(s, []).append((b, cap))
    # height of the tallest crop column
    col_h = max(sum(crop('after', s, b).height + 120 for b, _ in v) for s, v in by_screen.items())
    H = y0 + ph + 174 + col_h + 600
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((x0, 44), 'Sipply v4.6 details: Bar ledger (v2)', font=M6.font_variant(size=52), fill=INK)
    d.text((x0, 116), 'Campari rulings at 0.5 pt, ornament only: no word, count or icon added. At most two per screen, on top of the red places it already has. Phones at 2x; under each, its rulings at 3x, 1:1.',
           font=R.font_variant(size=28), fill=MUTED)
    for i, s in enumerate(['home', 'dex', 'drink', 'profile']):
        x = x0 + i * (pw + g)
        im.paste(Image.open(LEDGER / f'{s}.png').convert('RGB'), (x, y0))
        y = y0 + ph + 24
        for c in caps[s]:
            d.rectangle((x, y + 17, x + 22, y + 18), fill=CAMPARI)
            d.text((x + 36, y), c, font=R.font_variant(size=26), fill=INK)
            y += 40
        y = y0 + ph + 130
        d.text((x, y), 'At 3x, 1:1', font=M4.font_variant(size=24), fill=MUTED)
        y += 44
        for b, cap in by_screen[s]:
            c = crop('after', s, b)
            im.paste(c, (x, y)); y += c.height + 12
            for l in wrap(d, cap, R.font_variant(size=22), pw):
                d.text((x, y), l, font=R.font_variant(size=22), fill=INK); y += 30
            y += 40
    system_strip(im, d, x0, H - 480, W - 2 * x0)
    d.text((x0, H - 64), 'Never: on or near a photo (12 pt clear), on keys, chips or fields, in the tab bar or top bar, on story rings, under a tappable figure or any words, closed into a box, in any hue but Campari #D0102C.',
           font=R.font_variant(size=24), fill=MUTED)
    im.save(LEDGER / 'board.png', optimize=True)


detail_crops()
board()
print('ok detail-crops.png, board.png')
