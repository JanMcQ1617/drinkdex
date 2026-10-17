#!/bin/zsh
# Renders contact.png (the wall at 1x) and one 2x PNG per phone (880 x 1912,
# <direction>-<screen>.png) from index.html, with throwaway headless Chrome
# profiles under /tmp/sipply-v44-chrome. Each shot waits for its file; then
# only processes whose command line carries that profile path are killed,
# and the profile folder is deleted at the end. Jan's own Chrome is never
# touched.
#   ./tools/render.sh                       # everything
#   ./tools/render.sh cobalt-dex bw-home    # some phones (no contact sheet)
set -u
HERE=${0:A:h}
DIR=${HERE:h}
ROOT="/tmp/sipply-v44-chrome"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$DIR/index.html"
FLAGS=(--headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --allow-file-access-from-files)
THEMES=(merlot cobalt saffron campari bw)
SCREENS=(home dex drink profile)
reap() { pkill -f -- "$1" 2>/dev/null; sleep 0.5; pgrep -f -- "$1" >/dev/null && pkill -9 -f -- "$1"; return 0; }
shot() { # out width height scale hash
  local prof="$ROOT/${1%.png}-$$"
  mkdir -p "$prof"; rm -f "$DIR/$1"
  "$CHROME" $FLAGS --user-data-dir="$prof" --force-device-scale-factor=$4 \
    --virtual-time-budget=8000 --window-size=$2,$3 --screenshot="$DIR/$1" "$URL$5" >/dev/null 2>&1 &
  local i=0
  while [[ ! -s "$DIR/$1" && $i -lt 80 ]]; do sleep 0.5; i=$((i+1)); done
  sleep 1; reap "$prof"
  [[ -s "$DIR/$1" ]] && echo "ok $1" || echo "FAILED $1"
}
if (( $# )); then
  for s in "$@"; do shot "$s.png" 440 956 2 "#$s"; done
else
  shot contact.png 2460 6040 1 ""
  for t in $THEMES; do for s in $SCREENS; do shot "$t-$s.png" 440 956 2 "#$t-$s"; done; done
fi
reap "$ROOT"
rm -rf "$ROOT"
