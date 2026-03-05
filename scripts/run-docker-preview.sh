#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-devflow-agent-hub:preview}"
CONTAINER_NAME="${CONTAINER_NAME:-devflow-agent-hub-preview}"
PREVIEW_PORT="${PREVIEW_PORT:-3100}"
API_PORT="${API_PORT:-3101}"

validate_port() {
  local port="$1"
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    echo "[run-docker-preview] invalid port: $port" >&2
    exit 1
  fi
  if (( port < 3100 || port > 3199 )); then
    echo "[run-docker-preview] port must be in 3100-3199: $port" >&2
    exit 1
  fi
}

validate_port "$PREVIEW_PORT"
validate_port "$API_PORT"

if [[ "$PREVIEW_PORT" == "$API_PORT" ]]; then
  echo "[run-docker-preview] PREVIEW_PORT and API_PORT must be different" >&2
  exit 1
fi

docker build -t "$IMAGE_NAME" .
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run --name "$CONTAINER_NAME" \
  -e PREVIEW_PORT="$PREVIEW_PORT" \
  -e API_PORT="$API_PORT" \
  -p "$PREVIEW_PORT:$PREVIEW_PORT" \
  -p "$API_PORT:$API_PORT" \
  "$IMAGE_NAME"
