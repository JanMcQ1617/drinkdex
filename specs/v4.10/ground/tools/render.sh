#!/bin/bash
# Rebuild the v4.10 ground board and every shot (repo root):
#   bash specs/v4.10/ground/tools/render.sh
# Each option on the same three screens at 440 x 956 @2x; the tuning of A
# (its foot, and the pick drawn from the PNG the app would ship); the
# checks (the wash surfaces, and your row moved onto the foot); then the
# sheets (tools/sheets.py) and the contrast audit (tools/measure.mjs).
set -eu
T=specs/v4.10/ground/tools
O=specs/v4.10/ground/board/shots
B="file://$PWD/specs/v4.10/ground/board/index.html"
NODE_NO_WARNINGS=1 node $T/sweep-png.mjs
NODE_NO_WARNINGS=1 node $T/build-board.mjs
mkdir -p "$O"
for g in white grain sweep window topfade ledger dots mark sweep251 sweep246 sweeppng; do
  for f in home saved-empty activity-empty; do
    bash $T/shoot.sh "$B?g=$g&f=$f" "$O/$g-$f.png" 440 956 2
  done
done
for g in white grain sweep sweep251 sweeppng window topfade; do
  for f in dex board profile home-end; do
    bash $T/shoot.sh "$B?g=$g&f=$f" "$O/check-$g-$f.png" 440 956 2
  done
  bash $T/shoot.sh "$B?g=$g&f=board&shift=190" "$O/check-$g-board-foot.png" 440 956 2
done
python3 -I $T/sheets.py
NODE_NO_WARNINGS=1 node $T/measure.mjs
