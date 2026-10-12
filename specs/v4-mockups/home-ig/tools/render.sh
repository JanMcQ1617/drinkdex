#!/bin/zsh
# Renders contact.png (1x) and home.png, scrolled.png, caption.png (2x, 880 x 1912)
# with throwaway headless Chrome profiles under ../.chrome-profile. Each shot is
# waited for by its file; then only the processes whose command line carries that
# profile path are killed, and the profile folder is deleted at the end. Jan's own
# Chrome is never touched. `render.sh measure` prints the element rects instead.
set -u
HERE=${0:A:h}
DIR=${HERE:h}
ROOT="$DIR/.chrome-profile"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$DIR/index.html"
FLAGS=(--headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --allow-file-access-from-files)
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
if [[ "${1:-}" == measure ]]; then
  # --dump-dom does not always exit on its own, so it writes to a file that is polled.
  prof="$ROOT/measure-$$"; mkdir -p "$prof"; out="$prof.html"
  "$CHROME" $FLAGS --user-data-dir="$prof" --virtual-time-budget=6000 --window-size=1960,1240 --dump-dom "$URL#measure" >"$out" 2>/dev/null &
  i=0
  while ! grep -q '</pre>' "$out" 2>/dev/null && [[ $i -lt 60 ]]; do sleep 0.5; i=$((i+1)); done
  sleep 0.5; reap "$prof"
  sed -n '/<pre id="dump">/,/<\/pre>/p' "$out" | sed -e 's/<[^>]*>//g' -e 's/&quot;/"/g'
else
  shot contact.png 1960 1250 1 ""
  for s in home scrolled caption; do shot "$s.png" 440 956 2 "#$s"; done
fi
reap "$ROOT"
rm -rf "$ROOT"
