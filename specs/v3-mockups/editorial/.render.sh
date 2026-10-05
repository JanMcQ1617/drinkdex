#!/bin/zsh
S=/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-2-Claude-Shit/ce2420cd-7e5f-4a57-afda-480ff8102654/scratchpad/ui-dir/editorial
W=${W:-440}; H=${H:-956}; PAGE=${PAGE:-index.html}
for s in "$@"; do
  rm -f "$S/$s.png"
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=$S/.chrome --force-device-scale-factor=2 --window-size=$W,$H --virtual-time-budget=2500 --screenshot=$S/$s.png "file://$S/$PAGE#$s" >/dev/null 2>&1 &
  pid=$!
  for i in {1..60}; do [[ -s "$S/$s.png" ]] && break; sleep 0.5; done
  sleep 0.5; kill $pid 2>/dev/null; wait $pid 2>/dev/null
  echo "$s $(sips -g pixelWidth -g pixelHeight $S/$s.png 2>/dev/null | tail -2 | tr -s ' ' | tr '\n' ' ')"
done
pkill -f "ui-dir/editorial/.chrome" 2>/dev/null; true
