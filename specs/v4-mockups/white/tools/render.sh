#!/bin/zsh
# Renders contact.png (1x) and one PNG per screen (2x) with throwaway headless
# Chrome profiles under ../.chrome-profile. Headless Chrome sometimes writes the
# screenshot and then never exits, so each shot is waited for by its file and its
# own processes are killed by profile path. Nothing else is touched.
set -u
HERE=${0:A:h}
DIR=${HERE:h}
ROOT="$DIR/.chrome-profile"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$DIR/index.html"
shot() { # out width height scale hash
  local prof="$ROOT/$1-$$"
  mkdir -p "$prof"; rm -f "$DIR/$1"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
    --allow-file-access-from-files --user-data-dir="$prof" --force-device-scale-factor=$4 \
    --virtual-time-budget=5000 --window-size=$2,$3 --screenshot="$DIR/$1" "$URL$5" >/dev/null 2>&1 &
  local i=0
  while [[ ! -s "$DIR/$1" && $i -lt 60 ]]; do sleep 0.5; i=$((i+1)); done
  sleep 1
  pkill -f -- "$prof" 2>/dev/null; sleep 0.5
  pgrep -f -- "$prof" >/dev/null && pkill -9 -f -- "$prof"
  [[ -s "$DIR/$1" ]] && echo "ok $1" || echo "FAILED $1"
}
shot contact.png 2880 1200 1 ""
for s in home dex bar post profile log; do shot "$s.png" 440 956 2 "#$s"; done
pgrep -f -- "$ROOT" >/dev/null && pkill -9 -f -- "$ROOT"
rm -rf "$ROOT"
