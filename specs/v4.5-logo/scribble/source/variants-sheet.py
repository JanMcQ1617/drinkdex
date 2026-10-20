#!/usr/bin/env python3
"""The clean-icon comparison sheet (final/icon-variants.png). Rebuild:
  node source/final.js DIR --variants && python3 -I source/raster.py DIR --variants
  python3 -I source/variants-sheet.py DIR ../scribble/icon-1024.png
  source/shot.sh OUT.png 2400 1900 file://DIR/sheet.html
The second argument is the v2 (drip) icon, shown first for reference.
"""
import sys, os
from PIL import Image

D, OLD = sys.argv[1], sys.argv[2]
FONT = '/Users/janmcqueeny/Projects/drinkdex-worktrees/polish/assets/fonts'
im = Image.open(OLD)
im.save(os.path.join(D, 'old-1024.png'))
for s in (29, 40, 60):
    im.resize((s, s), Image.LANCZOS).save(os.path.join(D, f'old-{s}.png'))

V = [('old', 'v2 now (drip), for reference'), ('A', 'A &middot; tilted 9&deg;, pool, v2 size'),
     ('B', 'B &middot; upright, wordmark angle, v2 size'), ('C9', 'C &middot; tilted 9&deg;, scaled up'),
     ('C0', 'C &middot; upright, scaled up')]


def home(k, bg, fg):
    tile = '#A3A3A3' if fg != '#fff' else '#3A3A3C'
    return (f'<div class=home style="background:{bg}"><div class=c><img class=m src="{k}-1024.png" style="width:120px;height:120px">'
            f'<span style="color:{fg};font-size:24px">Sipply</span></div><div class=c><div class=m style="width:120px;height:120px;background:{tile}"></div>'
            f'<span style="color:{fg};font-size:24px">Photos</span></div></div>')


rows = ''
for k, l in V:
    thr = ''.join(f'<div class=c><img class=m src="{k}-1024.png" style="width:{s*3}px;height:{s*3}px"><span>{s}@3x</span></div>' for s in (29, 40, 60))
    one = ''.join(f'<div class=c><img class=m src="{k}-{s}.png" style="width:{s}px;height:{s}px"><span>{s}@1x</span></div>' for s in (29, 40, 60))
    px = ''.join(f'<div class=c><img class=m src="{k}-{s}.png" style="width:{s*3}px;height:{s*3}px;image-rendering:pixelated"><span>{s}@1x &times;3</span></div>' for s in (29, 40))
    rows += (f'<div class=row><div class=lab>{l}</div><img class=m src="{k}-1024.png" style="width:260px;height:260px">'
             f'<div class=lad>{thr}</div><div class=lad>{one}</div><div class=lad>{px}</div>'
             f'{home(k, "linear-gradient(160deg,#EDEBE8,#CFCDD6)", "#1C1C1E")}{home(k, "linear-gradient(160deg,#2B2B30,#050507)", "#fff")}</div>')

html = f'''<!doctype html><html><head><meta charset=utf-8><style>
@font-face{{font-family:Inter;src:url(file://{FONT}/InterLatin_400Regular.ttf);font-weight:400}}
@font-face{{font-family:Inter;src:url(file://{FONT}/InterLatin_600SemiBold.ttf);font-weight:600}}
*{{box-sizing:border-box;margin:0}} body{{background:#F5F5F5;font:400 14px Inter;color:#0A0A0A;padding:30px;width:2400px}}
h1{{font:600 28px Inter;margin-bottom:6px}} .sub{{color:#5C5C5C;margin-bottom:20px}}
.row{{display:flex;align-items:flex-end;gap:34px;padding:18px 22px;background:#fff;border-radius:6px;box-shadow:0 0 0 1px #E3E3E3;margin-bottom:14px;position:relative;padding-top:44px}}
.lab{{position:absolute;left:22px;top:14px;font:600 14px Inter;letter-spacing:1px;text-transform:uppercase;color:#5C5C5C}}
.m{{border-radius:22.37%;display:block}} .lad{{display:flex;align-items:flex-end;gap:16px}}
.c{{display:flex;flex-direction:column;align-items:center;gap:6px;color:#5C5C5C;font-size:13px}}
.home{{display:flex;gap:26px;padding:20px 26px 12px;border-radius:6px}}
</style></head><body><h1>Clean icon s &middot; comparison</h1><div class=sub>Same generator, nib, pool and stroke (21) as the wordmark's s; no drip. Optical centre = halfway between area centroid and bbox centre, lifted 0.8% of the tile. Masked as iOS draws it. <b>Pick: C, tilted 9&deg;, scaled up.</b> The tilt keeps the thrown-on tag (B reads as a set italic S); without the drip the s can take 70% of the tile and holds at 29@1x.</div>{rows}</body></html>'''
open(os.path.join(D, 'sheet.html'), 'w').write(html)
