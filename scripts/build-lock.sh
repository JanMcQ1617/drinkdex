#!/usr/bin/env bash
#
# The shared xcodebuild lock. Several sessions work on this Mac and Xcode
# keeps ONE build lock inside the shared node_modules
# (node_modules/expo-modules-jsi/apple/.DerivedData/.../XCBuildData/build.db),
# which a separate -derivedDataPath does not isolate and git worktrees do not
# either. Two archives at once do not queue politely; they corrupt each
# other's intermediates and both lose.
#
#     scripts/build-lock.sh acquire "who you are"
#     scripts/build-ios.sh archive
#     scripts/build-lock.sh release
#
# THIS SCRIPT LIVES IN THE REPO, and that is the whole point of the rewrite.
# It used to sit at /tmp/drinkdex-build-lock.sh, where on 9 Sep 2026 it was
# simply gone and an archive ran unprotected — `acquire` failed silently and
# only the `release` at the end said anything. It was NOT a reboot: uptime
# was 15 days. macOS reaps /tmp entries untouched for about three days, so
# the lock evaporated during an ordinary five-day gap between builds. The
# script's own note at the time — "does not survive a reboot" — was true and
# far too narrow.
#
# The lock DIRECTORY is still in /tmp, deliberately. A lock is machine state
# and SHOULD die with the machine: a stale lock surviving a reboot would
# block every session until someone deleted it by hand. Only the script
# needed to be durable. Now the volatile half is volatile and the half you
# rely on existing is in git.
#
# mkdir IS THE LOCK. `[ -d "$DIR" ] || mkdir "$DIR"` is check-then-act and
# loses exactly the race it is meant to win — two sessions starting within
# the same instant both see it missing and both proceed. `mkdir` on its own
# is atomic: the kernel makes one of them fail.

set -euo pipefail

LOCK_DIR="/tmp/drinkdex-build.lock"
OWNER_FILE="$LOCK_DIR/owner"

# The CALLER's shell, not this script — $$ dies the moment this exits, which
# would make every lock instantly look stale. $PPID is the shell running the
# acquire/build/release sequence, so its liveness is a real signal.
CALLER_PID="$PPID"

alive() { kill -0 "$1" 2>/dev/null; }

read_owner() {
  [ -f "$OWNER_FILE" ] || return 1
  IFS='|' read -r LOCK_WHO LOCK_PID LOCK_AT < "$OWNER_FILE"
}

case "${1:-status}" in

  acquire)
    WHO="${2:-unnamed}"
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      printf '%s|%s|%s\n' "$WHO" "$CALLER_PID" "$(date '+%Y-%m-%d %H:%M:%S')" > "$OWNER_FILE"
      echo "acquired by $WHO"
      exit 0
    fi

    # Someone holds it — or something did, and died mid-build. A build killed
    # by a closed laptop leaves the directory behind with nothing running.
    if ! read_owner; then
      echo "lock directory exists but has no owner file — reclaiming" >&2
      printf '%s|%s|%s\n' "$WHO" "$CALLER_PID" "$(date '+%Y-%m-%d %H:%M:%S')" > "$OWNER_FILE"
      echo "acquired by $WHO"
      exit 0
    fi

    if alive "$LOCK_PID"; then
      echo "BUSY — held by $LOCK_WHO (pid $LOCK_PID) since $LOCK_AT" >&2
      exit 1
    fi

    echo "stale lock from $LOCK_WHO (pid $LOCK_PID, dead) since $LOCK_AT — reclaiming" >&2
    printf '%s|%s|%s\n' "$WHO" "$CALLER_PID" "$(date '+%Y-%m-%d %H:%M:%S')" > "$OWNER_FILE"
    echo "acquired by $WHO"
    ;;

  release)
    if [ ! -d "$LOCK_DIR" ]; then
      echo "not held — nothing to release"
      exit 0
    fi
    # Refusing a foreign release cannot strand anything: the owner's pid dying
    # is what makes a lock stale, and acquire reclaims a stale one on sight.
    if read_owner && [ "$LOCK_PID" != "$CALLER_PID" ] && alive "$LOCK_PID" \
       && [ "${2:-}" != "--force" ]; then
      echo "refusing — held by $LOCK_WHO (pid $LOCK_PID), not you (pid $CALLER_PID)." >&2
      echo "Pass --force only if you are certain that build is finished." >&2
      exit 1
    fi
    rm -rf "$LOCK_DIR"
    echo "released"
    ;;

  status)
    if [ ! -d "$LOCK_DIR" ]; then
      echo "free"
    elif read_owner; then
      if alive "$LOCK_PID"; then
        echo "held by $LOCK_WHO (pid $LOCK_PID) — owner alive, since $LOCK_AT"
      else
        echo "held by $LOCK_WHO (pid $LOCK_PID) — OWNER DEAD, stale since $LOCK_AT"
      fi
    else
      echo "held, but the owner file is missing — stale"
    fi
    ;;

  *)
    echo "Usage: scripts/build-lock.sh [acquire \"who\" | release [--force] | status]" >&2
    exit 2
    ;;
esac
