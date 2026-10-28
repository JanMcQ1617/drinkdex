"""v4.10 ground: the sheets the options are judged on (repo root):

    python3 -I specs/v4.10/ground/tools/sheets.py

Reads board/shots/<option>-<screen>.png and check-<option>-<screen>.png
(440 x 956 @2x, from render.sh) and writes:

  board/arm-length.png   every option on the three screens at 25%: about
                         the size a 6.9in phone is at arm's length when
                         the sheet is seen on a laptop. Judged here first:
                         what reads as calm at a glance, and what reads as
                         pattern, dirt or a fault.
  board/ground-100.png   the lower right of Saved (empty) at 100% of the
                         @2x pixels, where only the ground is: the texture
                         itself, side by side.
  board/structure.png    Saved (empty) and Home with the levels 236..255
                         stretched to the full range (x 13): what the eye
                         could find in each ground if it looked for it,
                         the 8-bit steps of a ramp, a seam at a bar, a
                         lattice, made visible. Never how it looks.
  board/checks.png       the survivors on the screens with wash surfaces,
                         and your row moved onto the foot, at 25%.

and prints each option's ground down the empty right margin of Saved and
across the tab bar's top edge, so a seam between a bar and the page, or a
level darker than the README says, shows as a number; and the wash of
your row against the ground beside it on the foot probe.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[4]
BOARD = ROOT / 'specs/v4.10/ground/board'
SHOTS = BOARD / 'shots'
def _face(*names):
    """The sheets' labels: Inter as judged, or Archivo once v4.10's type has replaced it in assets/fonts."""
    for n in names:
        if (ROOT / 'assets/fonts' / n).exists():
            return str(ROOT / 'assets/fonts' / n)
    raise SystemExit(f'sheets: none of {names} is in assets/fonts')


FONT = _face('InterLatin_500Medium.ttf', 'ArchivoLatin_500Medium.ttf')
FONT_B = _face('InterLatin_600SemiBold.ttf', 'ArchivoLatin_600SemiBold.ttf')

GROUNDS = [
    ('white', '0  Plain white'),
    ('grain', 'Today: the grain'),
    ('sweep', 'A  Sweep, #F8F8F8'),
    ('sweep251', 'A  Sweep, #FBFBFB *'),
    ('window', 'B  Window light'),
    ('topfade', 'C  Top fade'),
    ('ledger', 'D  Ruled ledger'),
    ('dots', 'E  Dot grid'),
    ('mark', 'F  The s, watermarked'),
]
TUNING = [
    ('sweep246', 'A  Sweep, #F6F6F6'),
    ('sweeppng', 'A  #FBFBFB, shipped PNG'),
]
CHECKS = [
    ('white', '0  Plain white'),
    ('grain', 'Today: the grain'),
    ('sweep', 'A  Sweep, #F8F8F8'),
    ('sweep251', 'A  Sweep, #FBFBFB *'),
    ('sweeppng', 'A  #FBFBFB, shipped PNG'),
    ('window', 'B  Window light'),
    ('topfade', 'C  Top fade'),
]
SCREENS = [('home', 'Home'), ('saved-empty', 'Saved, empty'), ('activity-empty', 'Activity, empty')]
CHECK_SCREENS = [
    ('dex', 'Dex'),
    ('board', 'Tournaments'),
    ('board-foot', 'Your row\non the foot'),
    ('profile', 'Profile'),
    ('home-end', 'Home, its end'),
]
WALL = (236, 236, 236)
INK = (10, 10, 10)
MUTED = (92, 92, 92)


def shot(g, s, check=False):
    return Image.open(SHOTS / (f'check-{g}-{s}.png' if check else f'{g}-{s}.png')).convert('RGB')


def grid(path, cols, rows, get, w=220, h=478):
    gap, left, top = 24, 150, 64
    sheet = Image.new('RGB', (left + len(cols) * (w + gap), top + len(rows) * (h + gap) + 10), WALL)
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT_B, 15)
    fs = ImageFont.truetype(FONT, 15)
    for i, (g, label) in enumerate(cols):
        x = left + i * (w + gap)
        d.text((x, 26), label, font=f, fill=INK)
        for j, (s, sl) in enumerate(rows):
            y = top + j * (h + gap)
            sheet.paste(get(g, s).resize((w, h), Image.LANCZOS), (x, y))
            if i == 0:
                d.multiline_text((20, y + h // 2 - 10), sl, font=fs, fill=MUTED, spacing=4)
    sheet.save(path, optimize=True)
    print('wrote', path, sheet.size)


def ground_100():
    # Saved, empty: x 220..440pt, y 556..956pt, at the @2x pixels (440 x 800 px a crop).
    box = (440, 1112, 880, 1912)
    items = GROUNDS + TUNING
    cw, ch = box[2] - box[0], box[3] - box[1]
    gap, top, cols = 20, 56, 4
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (gap + cols * (cw + gap), rows * (ch + top) + gap), WALL)
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT_B, 22)
    for i, (g, label) in enumerate(items):
        x = gap + (i % cols) * (cw + gap)
        y = (i // cols) * (ch + top) + top
        d.text((x, y - 36), label, font=f, fill=INK)
        sheet.paste(shot(g, 'saved-empty').crop(box), (x, y))
    sheet.save(BOARD / 'ground-100.png', optimize=True)
    print('wrote', BOARD / 'ground-100.png', sheet.size)


LO = 236


def stretched(im):
    """Levels LO..255 to 0..255; anything darker than LO (type, marks, photos) goes black."""
    lut = [0 if v < LO else round((v - LO) * 255 / (255 - LO)) for v in range(256)]
    return im.convert('L').point(lut).convert('RGB')


def levels():
    print('\n  The ground down Saved\'s right margin (x 432pt), grey level at each tenth of the height,')
    print('  and across the tab bar\'s top edge (x 165pt, y 870..876pt: page, then the bar\'s own slice):\n')
    for g, label in GROUNDS + TUNING:
        im = shot(g, 'saved-empty')
        down = [im.getpixel((864, min(1911, int(1912 * t / 10))))[0] for t in range(11)]
        seam = [im.getpixel((330, y * 2))[0] for y in range(870, 877)]
        print(f'  {label:<24} {" ".join(f"{v:3d}" for v in down)}   seam {" ".join(str(v) for v in seam)}')
    print('\n  Your row on the foot (the Tournaments page 190pt down): its wash against the ground beside it,')
    print('  at y 840pt (x 20pt inside the row, x 8pt outside it):\n')
    for g, label in CHECKS:
        im = shot(g, 'board-foot', check=True)
        wash, ground = im.getpixel((40, 1680))[0], im.getpixel((16, 1680))[0]
        print(f'  {label:<24} wash {wash}  ground {ground}')


if __name__ == '__main__':
    grid(BOARD / 'arm-length.png', GROUNDS, SCREENS, shot)
    ground_100()
    grid(BOARD / 'structure.png', GROUNDS + TUNING, SCREENS[:2], lambda g, s: stretched(shot(g, s)))
    grid(BOARD / 'checks.png', CHECKS, CHECK_SCREENS, lambda g, s: shot(g, s, check=True))
    levels()
