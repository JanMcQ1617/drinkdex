# The walnut tile for v3.3 "brass" (specs/v3-3-mockups/brass/spec.md, D8). Deterministic: fixed seeds.
# Python 3.10 + numpy + Pillow (both already on Jan's Mac for scripts/lib/tungsten.py).
# Usage: python3 tools/walnut.py assets/images/walnut.webp   -> 1024x320 webp, ~10 KB.
# Prints the darkest, brightest and mean pixel: the brightest is the worst case for text (spec.md section 2).
import numpy as np
from PIL import Image
W, H = 1024, 320

def smooth(w, h, sx, sy, seed):
    r = np.random.default_rng(seed).random((sy, sx)).astype(np.float32)
    im = Image.fromarray((r * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(im).astype(np.float32) / 255

y = np.arange(H, dtype=np.float32)[:, None] * np.ones((1, W), np.float32)
warp = smooth(W, H, 4, 3, 1) * 34 + smooth(W, H, 12, 8, 2) * 7
base = (y + warp) * (0.045 + 0.03 * smooth(W, H, 2, 6, 11)) + smooth(W, H, 3, 2, 3) * 3
f = base - np.floor(base)
late = np.exp(-((f - 0.5) ** 2) / 0.012)          # dark latewood lines
streak = smooth(W, H, 10, 260, 6)                    # long fibre streaks along x
streak2 = smooth(W, H, 30, 320, 8)
figure = smooth(W, H, 7, 5, 9)                       # broad colour variation
pores = (smooth(W, H, 700, 300, 5) > 0.86).astype(np.float32)
v = 0.62 + 0.20 * (streak - 0.5) + 0.12 * (streak2 - 0.5) + 0.18 * (figure - 0.5) - 0.34 * late - 0.10 * pores
v = np.clip(v, 0, 1)
v = (v - v.min()) / (v.max() - v.min())

dark = np.array([0x31, 0x23, 0x1C], np.float32)
mid = np.array([0x48, 0x34, 0x29], np.float32)
lite = np.array([0x58, 0x42, 0x33], np.float32)
vv = v[..., None]
img = np.where(vv < 0.55, dark + (mid - dark) * (vv / 0.55), mid + (lite - mid) * ((vv - 0.55) / 0.45))
img = np.clip(img, 0, 255).astype(np.uint8)
import sys
out = sys.argv[1] if len(sys.argv) > 1 else 'walnut.webp'
Image.fromarray(img, 'RGB').save(out, quality=84)
a = img.reshape(-1, 3)
lum = a @ np.array([0.2126, 0.7152, 0.0722])
print('min', a[lum.argmin()], 'max', a[lum.argmax()], 'mean', a.mean(0).round())
