#!/bin/bash
D=/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-2-Claude-Shit/ce2420cd-7e5f-4a57-afda-480ff8102654/scratchpad/ui-dir/cellar
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCREENS="${*:-home feed dex drink profile signin log}"
for s in $SCREENS; do
  rm -f "$D/$s.png"
  "$CH" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --user-data-dir="$D/.chrome" --force-device-scale-factor=2 --window-size=440,956 --screenshot="$D/$s.png" "file://$D/index.html#$s" >/dev/null 2>&1 &
  pid=$!
  for i in $(seq 1 40); do [ -s "$D/$s.png" ] && break; sleep 0.5; done
  sleep 0.5; kill $pid 2>/dev/null; wait $pid 2>/dev/null
  echo "$s -> $(stat -f %z "$D/$s.png" 2>/dev/null)"
done
pkill -f "ui-dir/cellar/.chrome" 2>/dev/null; true
