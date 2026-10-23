#!/bin/zsh
# out/png -> ../preview.mp4: flatten onto #FFFFFF, then H.264 High, yuv420p,
# BT.709 tagged, 60 fps, 1170 x 2532 (390 x 844 pt at 3x), no audio.
cd ${0:a:h}/..
python3 -I tools/flatten.py
ffmpeg -v error -y -framerate 60 -i out/flat/frame_%06d.png \
  -vf "format=rgb24,scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int+bitexact,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709" \
  -c:v libx264 -profile:v high -level 5.1 -preset slow -crf 12 -g 60 \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -an -movflags +faststart -r 60 ../preview.mp4
ls -l ../preview.mp4
