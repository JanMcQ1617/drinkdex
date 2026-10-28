#!/bin/bash
# Screenshot one page with headless Chrome, in its OWN profile (never Jan's,
# and not the ground task's either, so a shoot running beside this one is
# never killed). Only this profile's own processes are ever killed
# (memory: headless-chrome-blocks-real-chrome).
#   specs/v4.10/type/tools/shoot.sh <url> <out.png> <width> <height> [scale]
set -u
URL="$1"; OUT="$2"; W="$3"; H="$4"; S="${5:-2}"
PROFILE=/tmp/sipply-v410-type-chrome
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$PROFILE"
rm -f "$OUT"
"$CHROME" --headless=new --user-data-dir="$PROFILE" --no-first-run --no-default-browser-check \
  --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --force-device-scale-factor="$S" --window-size="$W,$H" \
  --virtual-time-budget=5000 --screenshot="$OUT" "$URL" >/dev/null 2>&1
pkill -f "$PROFILE" 2>/dev/null
pkill -9 -f "$PROFILE" 2>/dev/null
[ -f "$OUT" ] && echo "shot $OUT" || echo "FAILED $OUT"
