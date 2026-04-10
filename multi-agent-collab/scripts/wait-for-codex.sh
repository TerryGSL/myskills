#!/bin/bash
# wait-for-codex.sh - Done-flag watcher for Codex async tasks
# Usage: wait-for-codex.sh <collab_dir> <flag_name> [timeout_seconds]
#
# Checks every 3 seconds for .done-<flag_name> file
# Outputs "DONE" when flag is found, or "TIMEOUT" if exceeded

COLLAB_DIR="$1"
FLAG_NAME="$2"
TIMEOUT="${3:-600}"  # Default 10 minutes

if [ -z "$COLLAB_DIR" ] || [ -z "$FLAG_NAME" ]; then
  echo "Usage: wait-for-codex.sh <collab_dir> <flag_name> [timeout_seconds]"
  exit 1
fi

FLAG_FILE="${COLLAB_DIR}/.done-${FLAG_NAME}"
ELAPSED=0
INTERVAL=3

while [ $ELAPSED -lt $TIMEOUT ]; do
  if [ -f "$FLAG_FILE" ]; then
    echo "DONE"
    exit 0
  fi
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

echo "TIMEOUT"
exit 1
