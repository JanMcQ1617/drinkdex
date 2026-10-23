#!/bin/zsh
# index.html -> ../preview.mp4 (780 x 1688 = 390 x 844 pt at 2x, 60 fps) and ../frames.png
# Hyperframes 0.8.92 png-sequence under the shared Chrome lock, flattened onto exact
# #FFFFFF, then encoded the way the intro film is (d-the-tag/tools/encode.sh): H.264
# High, yuv420p, BT.709 limited range, tagged. The CLI's own mp4 lands white at 251-253.
set -e
cd ${0:a:h}
rm -rf out && mkdir -p out
lockf -k -t 1800 /tmp/claude-501/hf-chrome.lock npx --yes hyperframes@0.8.92 render \
  --fps 60 --format png-sequence --no-browser-gpu --output out/png
python3 -I - <<'EOF'
import os
from PIL import Image
src, dst = 'out/png', 'out/flat'
os.makedirs(dst, exist_ok=True)
for n in sorted(x for x in os.listdir(src) if x.endswith('.png')):
    im = Image.open(os.path.join(src, n)).convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    Image.alpha_composite(bg, im).convert('RGB').save(os.path.join(dst, n), compress_level=1)
EOF
ffmpeg -v error -y -framerate 60 -i out/flat/frame_%06d.png \
  -vf "format=rgb24,scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int+bitexact,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709" \
  -c:v libx264 -profile:v high -preset veryslow -crf 6 -g 60 -bf 2 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -an -movflags +faststart -r 60 ../preview.mp4
python3 -I contact.py out/flat ../frames.png
ls -l ../preview.mp4 ../frames.png
