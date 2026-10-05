#!/bin/zsh
D=/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-2-Claude-Shit/ce2420cd-7e5f-4a57-afda-480ff8102654/scratchpad/ui-dir/collectible
PAGE=${PAGE:-index.html}; W=${W:-440}; H=${H:-956}
for s in "$@"; do
  rm -f $D/$s.png
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=$D/.chrome --force-device-scale-factor=2 --window-size=$W,$H --screenshot=$D/$s.png "file://$D/$PAGE#$s" >/dev/null 2>&1 &
  for i in $(seq 1 60); do
    if [ -s $D/$s.png ]; then sleep 1; break; fi
    sleep 0.5
  done
  pkill -f "collectible/.chrome"; sleep 0.5
  echo "$s $(python3 -c "from PIL import Image;print(Image.open('$D/$s.png').size)" 2>&1)"
done
