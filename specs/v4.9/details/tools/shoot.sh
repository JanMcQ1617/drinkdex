#!/bin/bash
# Screenshot one page with headless Chrome, in its OWN profile (never Jan's).
#   tools/shoot.sh <url> <out.png> <width> <height> [scale]
# The profile lives under /tmp/sipply-v49-details-chrome and only its own
# processes are ever killed (memory: headless-chrome-blocks-real-chrome).
set -u
URL="$1"; OUT="$2"; W="$3"; H="$4"; S="${5:-2}"
PROFILE=/tmp/sipply-v49-details-chrome
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
