#!/bin/zsh
# Render frames one at a time; each Chrome is killed (own profile only) once its PNG lands.
D=/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-2-Claude-Shit/ce2420cd-7e5f-4a57-afda-480ff8102654/scratchpad/v32/signin-backbar-door
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
frames=("$@"); (( ${#frames} )) || frames=(door swipe ways phone)
for f in $frames; do
  rm -f $D/$f.png
  "$C" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=$D/.chrome --force-device-scale-factor=2 \
    --window-size=440,956 --virtual-time-budget=3000 --screenshot=$D/$f.png "file://$D/index.html#$f" >/dev/null 2>&1 &
  pid=$!
  for i in {1..60}; do [[ -s $D/$f.png ]] && break; sleep 0.5; done
  sleep 1; kill $pid 2>/dev/null; pkill -f -- "$D/.chrome" 2>/dev/null
  echo "$f: $(python3 -c "from PIL import Image;print(Image.open('$D/$f.png').size)" 2>&1)"
done
pkill -9 -f -- "$D/.chrome" 2>/dev/null; true
