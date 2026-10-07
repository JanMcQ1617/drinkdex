#!/bin/bash
D=/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-2-Claude-Shit/ce2420cd-7e5f-4a57-afda-480ff8102654/scratchpad/v32/mybar-backbar
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for s in ${*:-empty stocked tonight add}; do
  rm -f "$D/$s.png"
  "$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=$D/.chrome --force-device-scale-factor=2 --window-size=440,956 --screenshot=$D/$s.png "file://$D/index.html#$s" >/dev/null 2>&1 &
  pid=$!
  for i in $(seq 1 60); do [ -s "$D/$s.png" ] && break; sleep 0.5; done
  sleep 0.3; kill $pid 2>/dev/null; wait $pid 2>/dev/null
  echo "$s -> $(stat -f %z "$D/$s.png" 2>/dev/null)"
done
pkill -f "mybar-backbar/.chrome" 2>/dev/null; true
