"""
Images for split-min (v4 Split palette on the "less stuff" layout).

  img/<id>.jpg        studio master, full colour, untouched (Split spec section 7)
  img/proof/<id>.jpg  grey proof of a drink not yet caught (Dex only): luminance
                      compressed into 186..244 so the seamless lands on g9 #F4F4F4

Same maths as ../split/tools/proofs.py. Reads ~/Desktop/CLINK DEX PHOTOS/<id>.png,
writes only under this folder.   python3 tools/bake.py   (from split-min/)
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.expanduser('~/Desktop/CLINK DEX PHOTOS')
COLOUR = ['negroni', 'paper-plane', 'aperol-spritz', 'martini', 'margarita', 'caesar',
          'brandy-alexander', 'espresso-martini', 'aviation', 'old-fashioned', 'clover-club',
          'last-word', 'sidecar', 'penicillin', 'tom-collins', 'daiquiri',
          'negroni-sbagliato', 'white-negroni']
PROOF = ['greyhound', 'grasshopper', 'porto-flip', 'americano']
TINT, FLOOR, SEAMLESS = 244.0, 186.0, 0.80

def colour(i):
    im = Image.open(os.path.join(SRC, f'{i}.png')).convert('RGB').resize((900, 900), Image.LANCZOS)
    im.save(os.path.join(HERE, 'img', f'{i}.jpg'), quality=86, optimize=True)

def proof(i):
    im = Image.open(os.path.join(SRC, f'{i}.png')).convert('RGB').resize((400, 400), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255.0
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    out = np.clip(TINT - (SEAMLESS - lum) * (TINT - FLOOR) / SEAMLESS, FLOOR - 8, 252)
    Image.fromarray(out.astype(np.uint8), 'L').convert('RGB').save(
        os.path.join(HERE, 'img', 'proof', f'{i}.jpg'), quality=88, optimize=True)

if __name__ == '__main__':
    for i in COLOUR: colour(i)
    for i in PROOF: proof(i)
    print('colour', len(COLOUR), 'proof', len(PROOF))
