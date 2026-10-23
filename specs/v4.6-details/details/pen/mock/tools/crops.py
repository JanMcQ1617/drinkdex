# Cuts the @3x crops the board and detail-crops.png use, from mock/out/*-3x.png.
# Boxes are in points (x0, y0, x1, y1); 1 pt = 3 px.
# v2: the ring and the pen tick are retired; the draw-on frames are new.
from PIL import Image
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'out')
def cut(src, name, box):
    im = Image.open(os.path.join(OUT, src))
    im.crop(tuple(round(v * 3) for v in box)).save(os.path.join(OUT, 'crop-' + name + '.png'))
for tag, suf in (('before', ''), ('after', '-pen')):
    cut(f'campari-dex{suf}-3x.png', f'{tag}-dexbar', (16, 64, 424, 116))
    cut(f'campari-drink{suf}-3x.png', f'{tag}-plates', (16, 638, 236, 690))
    cut(f'campari-home{suf}-3x.png', f'{tag}-rule', (16, 180, 424, 218))
cut('campari-dex-pen-3x.png', 'swash', (18, 66, 122, 114))
cut('campari-home-pen-3x.png', 'rule', (276, 184, 424, 216))
cut('campari-drink-pen-3x.png', 'drip', (18, 640, 110, 690))
# the draw-on that ends the intro: the rule at 30%, 65% and drawn
for f in ('30', '65'):
    cut(f'campari-home-pen-draw{f}-3x.png', f'draw{f}', (16, 203, 424, 214))
cut('campari-home-pen-3x.png', 'draw100', (16, 203, 424, 214))
