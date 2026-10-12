"""
Daylight bake for the v4 "white" mock (specs/v4-mockups/white/spec.md section 6).

The tungsten bake (scripts/lib/tungsten.py) re-lights every master into a warm
pool that settles to the cellar's burgundy at the edges. On a monochrome page
that burgundy edge is the wine coming back in through the photographs, so this
direction goes the other way: it keeps the studio master's daylight and only
NEUTRALISES THE WALL. Pixels with almost no chroma (the cool grey seamless, a
warm stone counter, glass, ice) lose what tint they have; anything with real
chroma (the drink, the garnish) keeps every bit of its colour. The weight is a
smooth ramp on chroma, so there is no mask edge to see.

It also bakes the "not yet" print: the same frame in black and white, lifted
toward the slot's wash so it reads as a faded proof, never as a caught drink.

  python3 tools/daylight.py            # writes img/<id>.webp and img/bw/<id>.webp

Masters: ~/Desktop/CLINK DEX PHOTOS/<id>.png (1024 px). Needs numpy + Pillow.
Fixed maths, no randomness: the output is the same every run.
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'img')
SRC = os.path.join(os.path.expanduser('~'), 'Desktop', 'CLINK DEX PHOTOS')

COLOUR = [
    'negroni', 'paper-plane', 'aperol-spritz', 'martini', 'clover-club',
    'caesar', 'brandy-alexander', 'espresso-martini', 'white-russian', 'gin-fizz',
    'ramos-gin-fizz', 'daiquiri', 'americano', 'boulevardier', 'tom-collins',
    'last-word', 'old-fashioned', 'aviation', 'penicillin', 'margarita',
    'sidecar', 'negroni-sbagliato', 'white-negroni', 'greyhound', 'grasshopper',
    'porto-flip',
]
# "Not yet" prints: drinks Nico has not caught that the mock shows.
BW = ['greyhound', 'grasshopper', 'porto-flip', 'americano', 'negroni-sbagliato', 'white-negroni']

# Chroma (max - min channel, 0..255) under ONSET is wall and goes fully neutral;
# over ONSET + SPAN it is drink and is left exactly as shot.
ONSET, SPAN = 14.0, 26.0
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)


def load(name):
    p = os.path.join(SRC, name + '.png')
    if not os.path.exists(p):
        sys.exit(f'missing master {p}')
    return np.asarray(Image.open(p).convert('RGB'), np.float32)


def daylight(a):
    chroma = a.max(axis=2) - a.min(axis=2)
    w = np.clip((chroma - ONSET) / SPAN, 0.0, 1.0)
    w = w * w * (3 - 2 * w)  # smoothstep: no visible threshold
    y = (a @ LUMA)[..., None]
    out = y + (a - y) * w[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def faded(a):
    y = a @ LUMA
    # lift toward #F0F0F0: black lands at #6F6F6F, the wall near #D4D4D4
    out = 240.0 - (255.0 - y) * 0.52
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    os.makedirs(os.path.join(OUT, 'bw'), exist_ok=True)
    for n in COLOUR:
        im = Image.fromarray(daylight(load(n)))
        im.resize((800, 800), Image.LANCZOS).save(os.path.join(OUT, n + '.webp'), quality=84, method=6)
    for n in BW:
        im = Image.fromarray(faded(load(n)), 'L')
        im.resize((400, 400), Image.LANCZOS).save(os.path.join(OUT, 'bw', n + '.webp'), quality=84, method=6)
    print(f'baked {len(COLOUR)} daylight prints and {len(BW)} not-yet prints into {os.path.normpath(OUT)}')


if __name__ == '__main__':
    main()
