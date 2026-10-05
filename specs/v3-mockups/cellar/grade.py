# Night grade: the pipeline step proposed for scripts/build-drink-photos.mjs.
# The grey studio seamless is re-lit as a warm, dim back-bar wall: a soft pool
# of tungsten light behind the glass that falls off to the app's night ground.
# The drink itself (saturated or bright pixels) keeps its own colour.
import glob, os
import numpy as np
from PIL import Image, ImageFilter

def hexlin(h):
    c = np.array([int(h[i:i+2],16) for i in (1,3,5)], float)/255.0
    return srgb_to_lin(c)
def srgb_to_lin(c): return np.where(c <= 0.04045, c/12.92, ((c+0.055)/1.055)**2.4)
def lin_to_srgb(c): return np.where(c <= 0.0031308, c*12.92, 1.055*np.power(np.clip(c,0,None),1/2.4)-0.055)

NIGHT = None
def grade(path, locked=False, cx=0.5, cy=0.46):
    night = hexlin('#140E0D'); warm = hexlin('#7C5642')
    a = np.asarray(Image.open(path).convert('RGB'), float) / 255.0
    h, w, _ = a.shape
    lin = srgb_to_lin(a)
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    lum = 0.2126*lin[...,0] + 0.7152*lin[...,1] + 0.0722*lin[...,2]
    top = lum[: h//8].reshape(-1); bg = float(np.median(top))
    bd = np.clip(1 - (sat-0.06)/0.14, 0, 1)                  # unsaturated
    
    bd *= np.clip((lum - bg*0.25)/(bg*0.25), 0, 1)           # not a deep shadow / dark liquid
    yy, xx = np.mgrid[0:h, 0:w]
    dx = (xx/w - cx) / 0.40; dy = (yy/h - cy) / 0.46
    pool = np.exp(-(dx*dx + dy*dy) * 1.1)
    thr = bg*(1.40 + 2.5*(1-pool)**2)                        # highlights survive only near the glass
    bd *= np.clip((thr - lum)/(bg*0.35), 0, 1)
    bd = np.asarray(Image.fromarray((bd*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), float)/255.0
    yy, xx = np.mgrid[0:h, 0:w]
    dx = (xx/w - cx) / 0.40; dy = (yy/h - cy) / 0.46
    pool = np.exp(-(dx*dx + dy*dy) * 1.1)
    tex = np.clip(lum / bg, 0, 1.6) ** 1.3
    wall = (night + (warm - night) * pool[..., None]) * tex[..., None]
    subj = lin * np.array([1.06, 0.98, 0.88]) * (0.55 + 0.45*pool)[..., None]
    out = subj * (1 - bd[..., None]) + wall * bd[..., None]
    # far edges settle on the ground so a full-bleed frame has no seam
    d = np.minimum(np.minimum(xx/w, 1-xx/w), np.minimum(yy/h, 1-yy/h))
    e = np.clip(1 - d/0.10, 0, 1)**2 * 0.85
    out = out*(1-e[...,None]) + night*e[...,None]
    if locked:
        g = 0.2126*out[...,0] + 0.7152*out[...,1] + 0.0722*out[...,2]
        out = (out*0.10 + g[...,None]*0.90) * 0.38 + night*0.62
    res = np.clip(lin_to_srgb(np.clip(out,0,1)), 0, 1)
    return Image.fromarray((res*255+0.5).astype(np.uint8))

if __name__ == '__main__':
    os.makedirs('img/night', exist_ok=True); os.makedirs('img/night-locked', exist_ok=True)
    for p in sorted(glob.glob('img/*.webp')):
        n = os.path.basename(p)
        grade(p).resize((768,768), Image.LANCZOS).save('img/night/'+n, quality=86)
        grade(p, locked=True).resize((768,768), Image.LANCZOS).save('img/night-locked/'+n, quality=86)
    print('ok')
