"""Daylight thumbs for the drinks this mock shows, made with ../white/tools/daylight.py's own bake
(neutral wall, the drink as shot) at 240 px. Masters: ~/Desktop/CLINK DEX PHOTOS. Deterministic."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'white', 'tools'))
from daylight import daylight, load  # noqa: E402
from PIL import Image  # noqa: E402
OUT = os.path.join(HERE, '..', 'img')
IDS = ['gin-fizz', 'gin-rickey', 'negroni', 'tom-collins', 'daiquiri', 'boulevardier', 'old-fashioned',
       'whiskey-highball', 'americano', 'garibaldi', 'martini']
os.makedirs(OUT, exist_ok=True)
for n in IDS:
    Image.fromarray(daylight(load(n))).resize((240, 240), Image.LANCZOS).save(os.path.join(OUT, n + '.webp'), quality=84, method=6)
print('baked', len(IDS), 'thumbs into', os.path.normpath(OUT))
