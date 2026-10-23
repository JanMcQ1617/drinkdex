#!/bin/zsh
# Renders the campari phones of ../index.html with throwaway headless Chrome
# profiles under /tmp/sipply-v46-chrome-proof-*. Only processes whose command
# line carries that profile path are killed. Jan's own Chrome is never touched.
#   ./tools/render.sh OUTDIR SCALE [QUERY] screen...   e.g. ./tools/render.sh /tmp/x 2 '' home dex
set -u
HERE=${0:A:h}; DIR=${HERE:h}
OUT=$1; SCALE=$2; Q=$3; shift 3
ROOT="/tmp/sipply-v46-chrome-proof-$$"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FLAGS=(--headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --allow-file-access-from-files)
reap() { pkill -f -- "$1" 2>/dev/null; sleep 0.5; pgrep -f -- "$1" >/dev/null && pkill -9 -f -- "$1"; return 0; }
mkdir -p "$OUT"
for s in "$@"; do
  f="$OUT/$s.png"; prof="$ROOT/$s"; mkdir -p "$prof"; rm -f "$f"
  "$CHROME" $FLAGS --user-data-dir="$prof" --force-device-scale-factor=$SCALE \
    --virtual-time-budget=8000 --window-size=440,956 --screenshot="$f" "file://$DIR/index.html$Q#campari-$s" >/dev/null 2>&1 &
  i=0; while [[ ! -s "$f" && $i -lt 80 ]]; do sleep 0.5; i=$((i+1)); done
  sleep 1; reap "$prof"
  [[ -s "$f" ]] && echo "ok $f" || echo "FAILED $f"
done
reap "$ROOT"; rm -rf "$ROOT"
