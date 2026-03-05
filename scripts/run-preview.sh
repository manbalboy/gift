#!/usr/bin/env bash
set -euo pipefail

PREVIEW_PORT="${PREVIEW_PORT:-7000}"
API_PORT="${API_PORT:-7001}"

validate_port() {
  local port="$1"
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    echo "[run-preview] invalid port: $port" >&2
    exit 1
  fi
  if (( port < 7000 || port > 7099 )); then
    echo "[run-preview] port must be in 7000-7099: $port" >&2
    exit 1
  fi
}

validate_port "$PREVIEW_PORT"
validate_port "$API_PORT"

if [[ "$PREVIEW_PORT" == "$API_PORT" ]]; then
  echo "[run-preview] PREVIEW_PORT and API_PORT must be different" >&2
  exit 1
fi

echo "[run-preview] API on :$API_PORT, Web on :$PREVIEW_PORT"

export DEVFLOW_PREVIEW_PROTECTED_PORT_START=7000
export DEVFLOW_PREVIEW_PROTECTED_PORT_END=7099

cd /app/api
uvicorn app.main:app --host 0.0.0.0 --port "$API_PORT" &
API_PID=$!

cleanup() {
  kill "$API_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cd /app/web
export WEB_PORT="$PREVIEW_PORT"
export VITE_API_BASE="http://localhost:${API_PORT}/api"
exec npm run dev
