# The walnut tile for v3.3 Brass (specs/v3-3-mockups/brass/spec.md, D8).
#
# Usage: python3 scripts/build-walnut.py
#   -> assets/images/walnut.webp (1024 x 320, about 10 KB)
#
# WHY A GENERATED TILE. Walnut is the one material Brass cannot draw from
# Views: a flat brown reads as a swatch, and per-row SVG grain in a 2,089-cell
# Dex would be work on every scroll. One small tile, decoded once and shared
# by every shelf, the counter and the Profile plaque, costs one 1.3 MB bitmap
# for the whole app. It is not a photograph and needs no licence.
#
# DETERMINISTIC. Fixed seeds, so the same file comes out every run (the mock's
# tools/walnut.py, ported unchanged in its maths). Python 3 + numpy + Pillow,
# already on Jan's Mac for scripts/lib/tungsten.py; nothing to install.
#
# WHAT IT PRINTS IS WHAT THE AUDIT TRUSTS. check-contrast cannot decode WebP
# in plain Node, so theme.ts's `walnutTile` records the DECODED file's
# darkest and brightest pixel (by WCAG luminance) and its sha256. Lossy WebP
# lands a step brighter than the palette ramp it was drawn from (#584233
# drawn, #594537 decoded), and the brightest decoded pixel is the honest
# worst case under text. check-contrast hashes the asset and stops (exit 2)
# if it no longer matches, so a regenerated tile cannot ship unmeasured:
# paste the printed block into theme.ts and run the audit again.
import hashlib
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'images', 'walnut.webp')
W, H = 1024, 320
# The asset budget (v3.3 brief): at most one texture, at most 12 KB.
MAX_BYTES = 12 * 1024


def smooth(w, h, sx, sy, seed):
    r = np.random.default_rng(seed).random((sy, sx)).astype(np.float32)
    im = Image.fromarray((r * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(im).astype(np.float32) / 255


y = np.arange(H, dtype=np.float32)[:, None] * np.ones((1, W), np.float32)
warp = smooth(W, H, 4, 3, 1) * 34 + smooth(W, H, 12, 8, 2) * 7
base = (y + warp) * (0.045 + 0.03 * smooth(W, H, 2, 6, 11)) + smooth(W, H, 3, 2, 3) * 3
f = base - np.floor(base)
late = np.exp(-((f - 0.5) ** 2) / 0.012)  # dark latewood lines
streak = smooth(W, H, 10, 260, 6)  # long fibre streaks along x
streak2 = smooth(W, H, 30, 320, 8)
figure = smooth(W, H, 7, 5, 9)  # broad colour variation
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
Image.fromarray(img, 'RGB').save(OUT, quality=84)

# Measure the file as a phone decodes it, not the array it was made from.
size = os.path.getsize(OUT)
if size > MAX_BYTES:
    sys.exit(f'walnut.webp is {size} bytes, over the {MAX_BYTES}-byte budget')
px = np.asarray(Image.open(OUT).convert('RGB')).reshape(-1, 3).astype(np.float64)
s = px / 255
lin = np.where(s <= 0.03928, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)
lum = lin @ np.array([0.2126, 0.7152, 0.0722])
hexof = lambda p: '#%02X%02X%02X' % tuple(int(c) for c in p)
digest = hashlib.sha256(open(OUT, 'rb').read()).hexdigest()

print(f'wrote {os.path.relpath(OUT, ROOT)}: {W}x{H}, {size} bytes')
print('theme.ts walnutTile:')
print(f"  darkest: '{hexof(px[lum.argmin()])}',")
print(f"  brightest: '{hexof(px[lum.argmax()])}',")
print(f"  mean: '{hexof(px.mean(0).round())}',")
print(f"  sha256: '{digest}',")
