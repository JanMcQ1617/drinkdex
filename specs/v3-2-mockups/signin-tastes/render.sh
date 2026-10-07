#!/bin/zsh
D=/private/tmp/claude-501/-Users-janmcqueeny-Library-CloudStorage-OneDrive-BentleyUniversity-2-Claude-Shit/ce2420cd-7e5f-4a57-afda-480ff8102654/scratchpad/v32/signin-tastes
frames=("$@"); (( ${#frames} )) || frames=(first picking ready save)
for f in $frames; do
  rm -f $D/$f.png
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --user-data-dir=$D/.chrome --force-device-scale-factor=2 --window-size=440,956 --screenshot=$D/$f.png "file://$D/index.html#$f" >/dev/null 2>&1 &
  pid=$!
  for i in {1..80}; do
    [[ -s $D/$f.png ]] && ! kill -0 $pid 2>/dev/null && break
    [[ -s $D/$f.png ]] && (( i > 6 )) && break
    sleep 0.25
  done
  pkill -f "user-data-dir=$D/.chrome" 2>/dev/null
  sleep 0.5
  echo "$f: $(stat -f %z $D/$f.png 2>/dev/null)"
done
