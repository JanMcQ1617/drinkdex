#!/bin/zsh
# Renders the ledger phones from ../index.html with throwaway headless Chrome
# profiles under /tmp/sipply-v46-chrome-ledger-1. Only processes whose
# command line carries that profile path are killed; Jan's Chrome is never
# touched.
#   ./tools/render.sh                 # home/dex/drink/profile.png at 2x into ledger/
#   ./tools/render.sh crops           # before/after phones at 3x into mock/out/ (for detail-crops.png)
set -u
HERE=${0:A:h}
DIR=${HERE:h}
OUTDIR=${DIR:h}
ROOT="/tmp/sipply-v46-chrome-ledger-1"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FLAGS=(--headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --allow-file-access-from-files)
reap() { pkill -f -- "$1" 2>/dev/null; sleep 0.5; pgrep -f -- "$1" >/dev/null && pkill -9 -f -- "$1"; return 0; }
shot() { # out scale query hash
  local prof="$ROOT/${1:t:r}-$$"
  mkdir -p "$prof"; rm -f "$1"
  "$CHROME" $FLAGS --user-data-dir="$prof" --force-device-scale-factor=$2 \
    --virtual-time-budget=8000 --window-size=440,956 --screenshot="$1" "file://$DIR/index.html$3#$4" >/dev/null 2>&1 &
  local i=0
  while [[ ! -s "$1" && $i -lt 80 ]]; do sleep 0.5; i=$((i+1)); done
  sleep 1; reap "$prof"
  [[ -s "$1" ]] && echo "ok ${1:t}" || echo "FAILED ${1:t}"
}
if [[ "${1:-}" == crops ]]; then
  mkdir -p "$DIR/out"
  for s in home dex drink profile; do
    shot "$DIR/out/before-$s@3x.png" 3 "?plain" "campari-$s"
    shot "$DIR/out/after-$s@3x.png" 3 "" "campari-$s"
  done
else
  for s in home dex drink profile; do shot "$OUTDIR/$s.png" 2 "" "campari-$s"; done
fi
reap "$ROOT"
rm -rf "$ROOT"
