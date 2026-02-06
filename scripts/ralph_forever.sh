#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ONCE_SCRIPT="${ONCE_SCRIPT:-$SCRIPT_DIR/ralph_once.sh}"
MAX_LOOPS="${MAX_LOOPS:-0}"
SLEEP_SEC="${SLEEP_SEC:-15}"
FAIL_BACKOFF_SEC="${FAIL_BACKOFF_SEC:-90}"
MAX_CONSECUTIVE_FAILURES="${MAX_CONSECUTIVE_FAILURES:-3}"

if ! [[ "$MAX_LOOPS" =~ ^[0-9]+$ ]]; then
  echo "ERROR: MAX_LOOPS must be >= 0" >&2
  exit 2
fi
if ! [[ "$MAX_CONSECUTIVE_FAILURES" =~ ^[0-9]+$ ]] || [[ "$MAX_CONSECUTIVE_FAILURES" -lt 1 ]]; then
  echo "ERROR: MAX_CONSECUTIVE_FAILURES must be >= 1" >&2
  exit 2
fi

loop_count=0
consecutive_failures=0

while true; do
  loop_count=$((loop_count + 1))
  echo "[ralph] loop=$loop_count starting"

  output=""
  set +e
  output="$($ONCE_SCRIPT 2>&1)"
  rc=$?
  set -e

  printf '%s\n' "$output"

  if [[ "$rc" -eq 10 ]]; then
    echo "[ralph] all checklist tasks complete"
    exit 0
  fi

  if [[ "$rc" -eq 0 ]]; then
    consecutive_failures=0
    if [[ "$MAX_LOOPS" -gt 0 ]] && [[ "$loop_count" -ge "$MAX_LOOPS" ]]; then
      echo "[ralph] reached MAX_LOOPS=$MAX_LOOPS"
      exit 0
    fi
    sleep "$SLEEP_SEC"
    continue
  fi

  consecutive_failures=$((consecutive_failures + 1))
  if [[ "$consecutive_failures" -ge "$MAX_CONSECUTIVE_FAILURES" ]]; then
    echo "[ralph] stopping after $consecutive_failures consecutive failures"
    exit "$rc"
  fi

  delay=$((FAIL_BACKOFF_SEC * consecutive_failures))
  echo "[ralph] failure rc=$rc; retrying in ${delay}s"
  sleep "$delay"
done
