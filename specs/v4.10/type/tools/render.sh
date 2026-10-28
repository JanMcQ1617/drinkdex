#!/bin/bash
# Rebuild every v4.10 type shot (repo root):
#   bash specs/v4.10/type/tools/render.sh
# The marker candidates beside the wordmark, then each direction's three
# screens alone at 440 x 956 @2x and its sheet (the three phones and the
# spec cards the same role table writes) @2x, and last the control (every
# line in the marker, Jan's words taken literally) on the same three
# screens. board/index.html with no query is the whole wall, for a browser.
set -eu
T=specs/v4.10/type/tools
O=specs/v4.10/type/board
B="file://$PWD/$O/index.html"
bash $T/shoot.sh "file://$PWD/$O/markers.html" "$O/00-markers.png" 1800 1250 1
for d in A:tag B:menu C:label; do
  L=${d%%:*}; D=${d#*:}
  for s in home drink dex; do
    bash $T/shoot.sh "$B?d=$D&s=$s" "$O/$L-$D-$s.png" 440 956 2
  done
  bash $T/shoot.sh "$B?d=$D" "$O/$L-$D.png" 1464 1490 2
done
for s in home drink dex; do
  bash $T/shoot.sh "$B?d=all&s=$s" "$O/00-all-marker-$s.png" 440 956 2
done
