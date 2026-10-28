#!/bin/bash
# Rebuild the v4.10 final proof (repo root):
#   bash specs/v4.10/board-final/tools/render.sh
# The figure and the drip from src/ (tools/build.mjs), then each screen
# alone at 440 x 956 @3x (an iPhone Pro Max's scale, so each ground texel
# lands as 3 x 3 pixels, as on the phone), the sign-in slab as it was before
# the bare-ground hold, and the three side by side @2x.
set -eu
T=specs/v4.10/board-final/tools
O=specs/v4.10/board-final
B="file://$PWD/$O/index.html"
NODE_NO_WARNINGS=1 node $T/build.mjs
for s in home drink signin; do
  bash $T/shoot.sh "$B?s=$s" "$O/$s.png" 440 956 3
done
# The sign-in slab as build 35 had it before lib/bareGround: the sweep's foot under a bare page.
bash $T/shoot.sh "$B?s=signin&before=1" "$O/signin-before.png" 440 956 3
bash $T/shoot.sh "$B" "$O/sheet.png" 1496 1150 2
