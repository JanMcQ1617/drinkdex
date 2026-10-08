#!/bin/bash
# Renders the wall (contact.png) and one PNG per screen with headless Chrome.
# Uses its OWN profile dir and kills only processes started with it; never touches Jan's Chrome.
D="$(cd "$(dirname "$0")" && pwd)"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROF="$D/.chrome-profile/run-$$"
mkdir -p "$PROF"
shot() { # name hash width height scale
  local out="$D/$1.png"; rm -f "$out"
  "$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROF" --force-device-scale-factor="$5" \
    --virtual-time-budget=4000 --window-size="$3,$4" --screenshot="$out" "file://$D/index.html$2" >/dev/null 2>&1 &
  local pid=$!
  for i in $(seq 1 80); do [ -s "$out" ] && break; sleep 0.5; done
  sleep 0.5
  kill $pid 2>/dev/null
  pkill -f -- "--user-data-dir=$PROF" 2>/dev/null
  sleep 0.5
  echo "$1: $(stat -f %z "$out" 2>/dev/null) bytes"
}
FR=("$@"); [ ${#FR[@]} -eq 0 ] && FR=(home dex bar post profile scrolled contact)
for f in "${FR[@]}"; do
  if [ "$f" = contact ]; then shot contact "" 2920 1520 1; else shot "$f" "#$f" 440 956 2; fi
done
pkill -f -- "--user-data-dir=$PROF" 2>/dev/null
rm -rf "$D/.chrome-profile"
