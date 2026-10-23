#!/bin/zsh
# Renders menu-details phones from ../index.html with throwaway headless Chrome
# profiles under /tmp/sipply-v46-chrome-menu-*. Only processes whose command line
# carries that profile path are ever killed. Jan's Chrome is never touched.
#   ./tools/render.sh OUT.png HASH [scale] [query]    e.g. home.png campari-home 2
set -u
HERE=${0:A:h}; DIR=${HERE:h}
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT=$1; HASH=$2; SCALE=${3:-2}; Q=${4:-}
PROF="/tmp/sipply-v46-chrome-menu-$$-${OUT:t:r}"
mkdir -p "$PROF"; rm -f "$OUT"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --allow-file-access-from-files \
  --user-data-dir="$PROF" --force-device-scale-factor=$SCALE --virtual-time-budget=8000 --window-size=440,956 \
  --screenshot="$OUT" "file://$DIR/index.html$Q#$HASH" >/dev/null 2>&1 &
i=0; while [[ ! -s "$OUT" && $i -lt 80 ]]; do sleep 0.5; i=$((i+1)); done
sleep 1; pkill -f -- "$PROF" 2>/dev/null; sleep .5; pgrep -f -- "$PROF" >/dev/null && pkill -9 -f -- "$PROF"
rm -rf "$PROF"
[[ -s "$OUT" ]] && echo "ok $OUT" || echo "FAILED $OUT"
