#!/bin/zsh
# Renders contact.png (the wall) and one 2x PNG per screen with headless
# Chrome. Each shot gets its own throwaway profile under .chrome-profile/;
# headless --screenshot writes the file but does not always exit, so the
# script waits for the PNG, then kills ONLY processes whose command line
# names that profile dir, and deletes it. Jan's own Chrome is never touched.
set -u
HERE="${0:A:h:h}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
URL="file://$HERE/index.html"
shot() { # out, size, scale, hash
  local prof="$HERE/.chrome-profile/$1"
  rm -f "$HERE/$1"; mkdir -p "$prof"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --no-first-run --no-default-browser-check \
    --user-data-dir="$prof" --force-device-scale-factor="$3" --virtual-time-budget=3000 \
    --screenshot="$HERE/$1" --window-size="$2" "$URL$4" >/dev/null 2>&1 &
  local last=-1 size=0
  for i in {1..80}; do
    sleep 0.5
    [[ -f "$HERE/$1" ]] || continue
    size=$(stat -f %z "$HERE/$1")
    [[ $size -gt 0 && $size -eq $last ]] && break
    last=$size
  done
  pkill -f -- "$prof" 2>/dev/null; sleep 0.5
  pgrep -f -- "$prof" >/dev/null && pkill -9 -f -- "$prof"
  echo "$1 $size"
}
shot contact.png 2936,1280 1 ""
for s in home dex bar post profile log; do shot "$s.png" 440,956 2 "#$s"; done
sleep 1
pgrep -f -- "$HERE/.chrome-profile" >/dev/null && pkill -9 -f -- "$HERE/.chrome-profile"
rm -rf "$HERE/.chrome-profile"
