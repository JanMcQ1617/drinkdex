#!/bin/zsh
# Renders the campari phones at 2x (880 x 1912) from index.html, before
# (out/before-<screen>.png) and with the pen marks (out/pen-<screen>.png),
# or any hash given (SCALE=3 ./tools/render.sh campari-dex.pen ...). Throwaway
# headless Chrome profiles under /tmp/sipply-v46-chrome-pen-*; only processes
# whose command line carries that profile path are killed. Jan's Chrome is
# never touched.
set -u
HERE=${0:A:h}; DIR=${HERE:h}; OUT=$DIR/out; mkdir -p $OUT
ROOT="/tmp/sipply-v46-chrome-pen-$$"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$DIR/index.html"
FLAGS=(--headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --allow-file-access-from-files)
reap() { pkill -f -- "$1" 2>/dev/null; sleep 0.5; pgrep -f -- "$1" >/dev/null && pkill -9 -f -- "$1"; return 0; }
shot() { # out hash scale
  local prof="$ROOT/${1:t:r}"
  mkdir -p "$prof"; rm -f "$1"
  "$CHROME" $FLAGS --user-data-dir="$prof" --force-device-scale-factor=${3:-2} \
    --virtual-time-budget=8000 --window-size=440,956 --screenshot="$1" "$URL#$2" >/dev/null 2>&1 &
  local i=0
  while [[ ! -s "$1" && $i -lt 80 ]]; do sleep 0.5; i=$((i+1)); done
  sleep 1; reap "$prof"
  [[ -s "$1" ]] && echo "ok ${1:t}" || echo "FAILED ${1:t}"
}
SCREENS=(home dex drink profile)
if (( $# )); then
  for h in "$@"; do shot "$OUT/${h//./-}${SCALE:+-${SCALE}x}.png" "$h" ${SCALE:-2}; done
else
  for s in $SCREENS; do shot "$OUT/before-$s.png" "campari-$s"; shot "$OUT/pen-$s.png" "campari-$s.pen"; done
fi
reap "$ROOT"; rm -rf "$ROOT"
