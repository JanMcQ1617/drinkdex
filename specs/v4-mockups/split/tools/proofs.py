"""
Mock images for the Split direction (v4). Two faces per drink:

  img/<id>.jpg        the studio master as it is: full colour, cool grey
                      seamless, no tungsten re-light (spec section 7).
  img/proof/<id>.jpg  the "proof": a drink you have not caught, as a pale
                      grey impression of the same frame. Luminance only,
                      compressed into a narrow band just under white, so it
                      sits on `tint` #F4F4F4 with no seam and never competes
                      with a caught photo. Colour is what you have caught.

  python3 tools/proofs.py            (from specs/v4-mockups/split/)

Reads ~/Desktop/CLINK DEX PHOTOS/<id>.png (the 1024px masters the app's
photo build already reads). Writes only under this folder.
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.expanduser('~/Desktop/CLINK DEX PHOTOS')

COLOUR = [
    'negroni', 'paper-plane', 'daiquiri', 'americano', 'boulevardier', 'tom-collins',
    'gin-fizz', 'margarita', 'caesar', 'brandy-alexander', 'espresso-martini',
    'white-russian', 'ramos-gin-fizz', 'frozen-margarita', 'aperol-spritz',
    'old-fashioned', 'aviation', 'last-word', 'clover-club', 'french-75', 'gimlet',
    'whiskey-sour', 'bloody-mary', 'martini', 'mojito', 'cape-codder',
]
PROOF = [
    'greyhound', 'grasshopper', 'porto-flip', 'bushwacker', 'miami-vice',
    'negroni-sbagliato', 'white-negroni', 'martini', 'mojito', 'cape-codder',
]

# The proof band, in sRGB 0..255: the master's seamless (~0.78 luminance)
# lands on TINT so the tile has no edge; the darkest glass lands near FLOOR.
TINT = 244.0
FLOOR = 186.0
SEAMLESS = 0.80


def colour(i):
    im = Image.open(os.path.join(SRC, f'{i}.png')).convert('RGB').resize((900, 900), Image.LANCZOS)
    im.save(os.path.join(HERE, 'img', f'{i}.jpg'), quality=86, optimize=True)


def proof(i):
    im = Image.open(os.path.join(SRC, f'{i}.png')).convert('RGB').resize((360, 360), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255.0
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    # Distance from the seamless, both ways, compressed into the band.
    out = TINT - (SEAMLESS - lum) * (TINT - FLOOR) / SEAMLESS
    out = np.clip(out, FLOOR - 8, 252)
    g = Image.fromarray(out.astype(np.uint8), 'L').convert('RGB')
    g.save(os.path.join(HERE, 'img', 'proof', f'{i}.jpg'), quality=88, optimize=True)


if __name__ == '__main__':
    for i in COLOUR:
        colour(i)
    for i in PROOF:
        proof(i)
    print('colour', len(COLOUR), 'proof', len(PROOF))
