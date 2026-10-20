#!/bin/zsh
# shot.sh OUT.png W H file:///page.html [transparent] [scale]
# Throwaway headless Chrome under /tmp/sipply-logo-chrome-scribble-<n>;
# waits for the file, then kills only processes carrying that profile path.
set -u
OUT=$1 W=$2 H=$3 URL=$4 BG=${5:-} SC=${6:-1}
N=$$-$RANDOM
PROF="/tmp/sipply-logo-chrome-scribble-$N"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$PROF"; rm -f "$OUT"
EXTRA=()
[[ "$BG" == "transparent" ]] && EXTRA=(--default-background-color=00000000)
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
  --allow-file-access-from-files --user-data-dir="$PROF" --force-device-scale-factor=$SC \
  --virtual-time-budget=4000 --window-size=$W,$H $EXTRA --screenshot="$OUT" "$URL" >/dev/null 2>&1 &
i=0
while [[ ! -s "$OUT" && $i -lt 80 ]]; do sleep 0.5; i=$((i+1)); done
sleep 0.8
pkill -f -- "$PROF" 2>/dev/null; sleep 0.4
pgrep -f -- "$PROF" >/dev/null && pkill -9 -f -- "$PROF"
rm -rf "$PROF"
[[ -s "$OUT" ]] && echo "ok $OUT" || echo "FAILED $OUT"
