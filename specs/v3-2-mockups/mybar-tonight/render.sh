#!/bin/bash
D="/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-2-Claude-Shit/ce2420cd-7e5f-4a57-afda-480ff8102654/scratchpad/v32/mybar-tonight"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FRAMES=("$@"); [ ${#FRAMES[@]} -eq 0 ] && FRAMES=(empty picker tonight away)
for f in "${FRAMES[@]}"; do
  rm -f "$D/$f.png"
  "$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$D/.chrome" --force-device-scale-factor=2 --window-size=440,956 --screenshot="$D/$f.png" "file://$D/index.html#$f" >/dev/null 2>&1 &
  pid=$!
  for i in $(seq 1 60); do [ -s "$D/$f.png" ] && break; sleep 0.5; done
  sleep 0.5
  kill $pid 2>/dev/null; pkill -f "user-data-dir=$D/.chrome" 2>/dev/null; sleep 0.5
  echo "$f: $(stat -f %z "$D/$f.png" 2>/dev/null)"
done
