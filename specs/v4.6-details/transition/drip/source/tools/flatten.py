#!/usr/bin/env python3
"""out/png (RGBA, transparent ground) -> out/flat (RGB on exact #FFFFFF).
ffmpeg's lavfi colour source lands at 253, not 255, so this is done here.
  python3 -I tools/flatten.py"""
import os
from PIL import Image
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, dst = os.path.join(R, 'out', 'png'), os.path.join(R, 'out', 'flat')
import shutil; shutil.rmtree(dst, ignore_errors=True); os.makedirs(dst)
names = sorted(n for n in os.listdir(src) if n.endswith('.png'))
for n in names:
    im = Image.open(os.path.join(src, n)).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    Image.alpha_composite(bg, im).convert('RGB').save(os.path.join(dst, n), compress_level=1)
print(len(names), 'frames flattened')
