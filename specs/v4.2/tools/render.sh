#!/bin/zsh
# Renders contact.png (1x) and one 2x PNG per frame (880 x 1912) from index.html with
# throwaway headless Chrome profiles under ../.chrome-profile. Each shot waits for its file;
# then only processes whose command line carries that profile path are killed, and the
# profile folder is deleted at the end. Jan's own Chrome is never touched.
#   ./tools/render.sh              # everything
#   ./tools/render.sh foryou web   # some frames (no contact sheet)
set -u
HERE=${0:A:h}
DIR=${HERE:h}
ROOT="$DIR/.chrome-profile"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$DIR/index.html"
FLAGS=(--headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --allow-file-access-from-files)
FRAMES=(foryou bynumber notaste hidden revealing filter flavours savebar sheet new saved collection more share shared web)
reap() { pkill -f -- "$1" 2>/dev/null; sleep 0.5; pgrep -f -- "$1" >/dev/null && pkill -9 -f -- "$1"; return 0; }
shot() { # out width height scale hash
  local prof="$ROOT/${1%.png}-$$"
  mkdir -p "$prof"; rm -f "$DIR/$1"
  "$CHROME" $FLAGS --user-data-dir="$prof" --force-device-scale-factor=$4 \
    --virtual-time-budget=6000 --window-size=$2,$3 --screenshot="$DIR/$1" "$URL$5" >/dev/null 2>&1 &
  local i=0
  while [[ ! -s "$DIR/$1" && $i -lt 60 ]]; do sleep 0.5; i=$((i+1)); done
  sleep 1; reap "$prof"
  [[ -s "$DIR/$1" ]] && echo "ok $1" || echo "FAILED $1"
}
if (( $# )); then
  for s in "$@"; do shot "$s.png" 440 956 2 "#$s"; done
else
  shot contact.png 2908 3560 1 ""
  for s in $FRAMES; do shot "$s.png" 440 956 2 "#$s"; done
fi
reap "$ROOT"
rm -rf "$ROOT"
