#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-devflow-agent-hub:preview}"
CONTAINER_NAME="${CONTAINER_NAME:-devflow-agent-hub-preview}"
PREVIEW_PORT="${PREVIEW_PORT:-3100}"
API_PORT="${API_PORT:-3101}"
HOST_PREVIEW_PORT="${HOST_PREVIEW_PORT:-7000}"
HOST_API_PORT="${HOST_API_PORT:-7001}"

validate_container_port() {
  local port="$1"
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    echo "[run-docker-preview] invalid container port: $port" >&2
    exit 1
  fi
  if (( port < 3100 || port > 3199 )); then
    echo "[run-docker-preview] container port must be in 3100-3199: $port" >&2
    exit 1
  fi
}

validate_host_port() {
  local port="$1"
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    echo "[run-docker-preview] invalid host port: $port" >&2
    exit 1
  fi
  if (( port < 7000 || port > 7099 )); then
    echo "[run-docker-preview] host port must be in 7000-7099: $port" >&2
    exit 1
  fi
}

validate_container_port "$PREVIEW_PORT"
validate_container_port "$API_PORT"
validate_host_port "$HOST_PREVIEW_PORT"
validate_host_port "$HOST_API_PORT"

if [[ "$PREVIEW_PORT" == "$API_PORT" ]]; then
  echo "[run-docker-preview] PREVIEW_PORT and API_PORT must be different" >&2
  exit 1
fi

if [[ "$HOST_PREVIEW_PORT" == "$HOST_API_PORT" ]]; then
  echo "[run-docker-preview] HOST_PREVIEW_PORT and HOST_API_PORT must be different" >&2
  exit 1
fi

docker build -t "$IMAGE_NAME" .
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "[run-docker-preview] container(web/api)=${PREVIEW_PORT}/${API_PORT}, host(web/api)=${HOST_PREVIEW_PORT}/${HOST_API_PORT}"

docker run --name "$CONTAINER_NAME" \
  -e PREVIEW_PORT="$PREVIEW_PORT" \
  -e API_PORT="$API_PORT" \
  -p "$HOST_PREVIEW_PORT:$PREVIEW_PORT" \
  -p "$HOST_API_PORT:$API_PORT" \
  "$IMAGE_NAME"
