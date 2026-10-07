#!/bin/bash
# Renders frames with headless Chrome. Chrome sometimes lingers after writing the
# screenshot, so each run waits for the file, then kills ONLY processes on this
# --user-data-dir (never the user's own Chrome).
D="/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-2-Claude-Shit/ce2420cd-7e5f-4a57-afda-480ff8102654/scratchpad/v32/signin-pour"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
shot() { # name url width height
  rm -f "$D/$1.png"
  "$CH" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$D/.chrome" --force-device-scale-factor=2 \
    --window-size=$3,$4 --screenshot="$D/$1.png" "$2" >/dev/null 2>&1 &
  for i in $(seq 1 60); do [ -s "$D/$1.png" ] && break; sleep 0.5; done
  sleep 0.5
  pkill -f -- "--user-data-dir=$D/.chrome" 2>/dev/null
  sleep 0.5
  echo "$1: $(sips -g pixelWidth -g pixelHeight "$D/$1.png" 2>/dev/null | tail -2 | awk '{print $2}' | tr '\n' ' ')"
}
frames="${*:-welcome pour poured back}"
for f in $frames; do
  if [ "$f" = contact ]; then shot contact "file://$D/contact.html" 1900 1000
  else shot "$f" "file://$D/index.html#$f" 440 956; fi
done
