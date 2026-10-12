"""
Daylight prints this mock needs that ../../white/img does not have (Gin Rickey,
for the "You can make" list). Same maths as ../../white/tools/daylight.py,
imported from it, so the print matches the rest of the wall exactly.

  python3 tools/bake.py     # writes img/<id>.webp
"""
import importlib.util
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = importlib.util.spec_from_file_location(
    'daylight', os.path.join(HERE, '..', '..', '..', 'white', 'tools', 'daylight.py'))
daylight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(daylight)

OUT = os.path.join(HERE, '..', 'img')
for n in ['gin-rickey']:
    im = Image.fromarray(daylight.daylight(daylight.load(n)))
    im.resize((800, 800), Image.LANCZOS).save(os.path.join(OUT, n + '.webp'), quality=84, method=6)
    print('baked', n)
