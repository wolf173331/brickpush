#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_PORT="${SERVER_PORT:-8080}"
SERVER_LOG="$ROOT_DIR/.share-server.log"
TUNNEL_LOG="$ROOT_DIR/.share-tunnel.log"
URL_FILE="$ROOT_DIR/.share-url.txt"

ensure_node() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
    nvm use 24.14.1 >/dev/null
  fi
}

ensure_server() {
  if ! lsof -iTCP:"$SERVER_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    nohup node "$ROOT_DIR/server.mjs" >"$SERVER_LOG" 2>&1 &
    sleep 1
  fi
}

start_tunnel() {
  : >"$TUNNEL_LOG"
  nohup ssh \
    -o StrictHostKeyChecking=no \
    -o ServerAliveInterval=30 \
    -R 80:localhost:"$SERVER_PORT" \
    nokey@localhost.run >"$TUNNEL_LOG" 2>&1 &
}

extract_url() {
  for _ in $(seq 1 30); do
    if grep -Eo 'https://[^ ]+' "$TUNNEL_LOG" | tail -n 1 >"$URL_FILE" 2>/dev/null; then
      if [ -s "$URL_FILE" ]; then
        cat "$URL_FILE"
        return 0
      fi
    fi
    sleep 1
  done

  echo "Tunnel started, but URL was not detected yet. Check $TUNNEL_LOG" >&2
  return 1
}

main() {
  cd "$ROOT_DIR"
  ensure_node
  ensure_server
  start_tunnel
  extract_url
}

main "$@"
