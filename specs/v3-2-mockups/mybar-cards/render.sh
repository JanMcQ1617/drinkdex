#!/bin/bash
D=/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-2-Claude-Shit/ce2420cd-7e5f-4a57-afda-480ff8102654/scratchpad/v32/mybar-cards
FRAMES=("$@"); [ ${#FRAMES[@]} -eq 0 ] && FRAMES=(first deck shelf tonight)
shot() { # $1 out, $2 url, $3 size
  rm -f "$1"
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
    --user-data-dir=$D/.chrome --force-device-scale-factor=2 --window-size=$3 --screenshot="$1" "$2" >/dev/null 2>&1 &
  local pid=$!
  for i in $(seq 1 40); do [ -s "$1" ] && break; sleep 0.5; done
  sleep 0.5
  pkill -f -- "--user-data-dir=$D/.chrome" 2>/dev/null; wait $pid 2>/dev/null
}
for f in "${FRAMES[@]}"; do
  if [ "$f" = contact ]; then shot "$D/contact.png" "file://$D/contact.html" 1900,1000
  else shot "$D/$f.png" "file://$D/index.html#$f" 440,956; fi
done
pkill -f -- "--user-data-dir=$D/.chrome" 2>/dev/null
ls -la $D/*.png
