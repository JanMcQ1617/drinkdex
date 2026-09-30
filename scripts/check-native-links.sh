#!/usr/bin/env bash
#
# Refuses an app whose frameworks need Swift symbols that nothing in the app
# provides — the crash that took down build 10 at launch (30 Sep 2026):
#
#   Termination Reason: DYLD 4 Symbol missing
#   Symbol not found: _$s15ExpoModulesCore10BaseModuleC11willDestroyyyFTj
#   Referenced from: ExpoImageManipulator.framework
#
# expo-video and expo-image-manipulator ship PREBUILT binaries. A patch release
# of either can be compiled against a newer ExpoModulesCore than the one the
# project pins, and nothing on the JS side notices: tsc, lint and the Metro
# bundle all pass, the archive and export succeed, App Store Connect accepts
# the upload — and iOS's loader kills the app before a line of it runs. The
# fix then was aligning the SDK (npx expo install --fix); this is what makes
# the next mismatch fail here instead of on a phone.
#
# Checks every Mach-O in the bundle: each undefined Swift symbol that belongs
# to a module shipped INSIDE the app must be exported by some binary in the
# app. System frameworks are out of scope — they are not ours to mismatch.
#
#   scripts/check-native-links.sh <path/to/Sipply.app | path/to/Sipply.ipa>

set -euo pipefail

TARGET="${1:?usage: check-native-links.sh <app or ipa>}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ "$TARGET" == *.ipa ]]; then
  unzip -q "$TARGET" -d "$WORK/ipa"
  APP="$(find "$WORK/ipa/Payload" -maxdepth 1 -name '*.app' | head -1)"
else
  APP="$TARGET"
fi
[ -d "$APP" ] || { echo "no .app found in $TARGET" >&2; exit 2; }

BINARIES=()
MAIN="$APP/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Info.plist")"
BINARIES+=("$MAIN")
for fw in "$APP"/Frameworks/*.framework; do
  [ -d "$fw" ] || continue
  name="$(basename "$fw" .framework)"
  [ -f "$fw/$name" ] && BINARIES+=("$fw/$name")
done

# Swift module names shipped inside the app, as their mangled prefix: _$s<len><name>
PREFIXES="$WORK/prefixes.txt"
: > "$PREFIXES"
for b in "${BINARIES[@]}"; do
  n="$(basename "$b")"
  printf '_$s%d%s\n' "${#n}" "$n" >> "$PREFIXES"
done

EXPORTED="$WORK/exported.txt"
for b in "${BINARIES[@]}"; do nm -gU "$b" 2>/dev/null | awk '{print $NF}'; done | sort -u > "$EXPORTED"

missing_total=0
for b in "${BINARIES[@]}"; do
  missing="$(nm -u "$b" 2>/dev/null | awk '{print $NF}' | grep -F -f "$PREFIXES" | sort -u | comm -23 - "$EXPORTED" || true)"
  if [ -n "$missing" ]; then
    count="$(printf '%s\n' "$missing" | wc -l | tr -d ' ')"
    missing_total=$((missing_total + count))
    echo "  $(basename "$b"): $count symbol(s) no binary in the app provides" >&2
    printf '%s\n' "$missing" | head -5 | sed 's/^/      /' >&2
  fi
done

if [ "$missing_total" -gt 0 ]; then
  echo "" >&2
  echo "NATIVE LINK CHECK FAILED: this build would crash at launch (dyld: Symbol missing)." >&2
  echo "A prebuilt module was compiled against a different ExpoModulesCore. Align the SDK:" >&2
  echo "    npx expo install --fix   # then prebuild --clean and archive again" >&2
  exit 1
fi
echo "==> Native link check: ${#BINARIES[@]} binaries, every in-app Swift symbol resolves."
