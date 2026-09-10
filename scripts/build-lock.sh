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

# WHAT MAKES A LOCK STALE IS NOT A PID.
#
# The first version of this recorded $PPID and treated "owner still alive" as
# "lock still valid". It broke immediately, on its own documented workflow:
# $PPID is not stable across invocations from one shell, because bash may
# exec the last command of a subshell in place rather than forking. acquire
# recorded one pid, release ran under another, and the script refused to
# release a lock it had taken four lines earlier — then called it stale.
#
# So ask about the RESOURCE instead of about a process tree. The thing being
# protected is "an xcodebuild is working in this repo", and that is directly
# observable. A lock is stale when no xcodebuild is running and it has sat
# there longer than a build could plausibly take to start.
GRACE_SECONDS=300

xcodebuild_running() { pgrep -x xcodebuild >/dev/null 2>&1; }

lock_age() {
  local mtime now
  mtime=$(stat -f %m "$LOCK_DIR" 2>/dev/null) || return 1
  now=$(date +%s)
  echo $(( now - mtime ))
}

stamp() {
  printf '%s|%s|%s\n' "$1" "$$" "$(date '+%Y-%m-%d %H:%M:%S')" > "$OWNER_FILE"
}

read_owner() {
  [ -f "$OWNER_FILE" ] || return 1
  IFS='|' read -r LOCK_WHO LOCK_PID LOCK_AT < "$OWNER_FILE"
}

case "${1:-status}" in

  acquire)
    WHO="${2:-unnamed}"
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      stamp "$WHO"; echo "acquired by $WHO"; exit 0
    fi

    read_owner || { LOCK_WHO="someone"; LOCK_AT="unknown"; }
    AGE=$(lock_age || echo 0)

    # A build is genuinely in progress.
    if xcodebuild_running; then
      echo "BUSY — held by $LOCK_WHO since $LOCK_AT, and xcodebuild is running" >&2
      exit 1
    fi

    # Nothing running, but the lock is young: a caller took it and has not
    # reached its xcodebuild yet. Taking it now is the race the lock exists
    # to prevent.
    if [ "$AGE" -lt "$GRACE_SECONDS" ]; then
      echo "BUSY — held by $LOCK_WHO since $LOCK_AT (${AGE}s ago, build not started yet)" >&2
      exit 1
    fi

    # Old, and nothing is building: whatever held this is gone. A laptop
    # closed mid-archive leaves exactly this.
    echo "stale lock from $LOCK_WHO since $LOCK_AT (${AGE}s, no xcodebuild) — reclaiming" >&2
    stamp "$WHO"; echo "acquired by $WHO"
    ;;

  release)
    if [ ! -d "$LOCK_DIR" ]; then
      echo "not held — nothing to release"
      exit 0
    fi
    # Unconditional. There is no reliable way to tell "the caller who
    # acquired this" from "another shell in the same session", and guessing
    # wrong strands the lock — which is worse than releasing early, since a
    # released lock only costs the next caller a wait.
    if read_owner && xcodebuild_running && [ "${2:-}" != "--force" ]; then
      echo "warning: releasing $LOCK_WHO's lock while an xcodebuild is still running" >&2
    fi
    rm -rf "$LOCK_DIR"
    echo "released"
    ;;

  status)
    if [ ! -d "$LOCK_DIR" ]; then
      echo "free"
    elif read_owner; then
      AGE=$(lock_age || echo 0)
      if xcodebuild_running; then
        echo "held by $LOCK_WHO since $LOCK_AT — xcodebuild running"
      elif [ "$AGE" -lt "$GRACE_SECONDS" ]; then
        echo "held by $LOCK_WHO since $LOCK_AT — no xcodebuild yet (${AGE}s)"
      else
        echo "held by $LOCK_WHO since $LOCK_AT — STALE (${AGE}s, no xcodebuild)"
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
