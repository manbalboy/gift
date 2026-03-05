#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3101}"
PROXY_PORT="${PROXY_PORT:-3108}"
DURATION_SECONDS="${DURATION_SECONDS:-20}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_DIR="${SCRIPT_DIR}/nginx"
COMPOSE_FILE="${NGINX_DIR}/docker-compose.yml"

WORKFLOW_PAYLOAD='{"name":"SSE Proxy Check","description":"nginx timeout check","graph":{"nodes":[{"id":"idea","type":"task","label":"Idea"}],"edges":[]}}'

echo "[1/5] workflow 생성"
workflow_id=$(curl -sS -X POST "${API_BASE_URL}/api/workflows" -H 'content-type: application/json' -d "${WORKFLOW_PAYLOAD}" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -n1)
if [[ -z "${workflow_id}" ]]; then
  echo "workflow 생성 실패"
  exit 1
fi

echo "[2/5] nginx 프록시 컨테이너 실행 (port ${PROXY_PORT})"
export PROXY_PORT
docker compose -f "${COMPOSE_FILE}" up -d --force-recreate

cleanup() {
  docker compose -f "${COMPOSE_FILE}" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[3/5] SSE 스트림 연결"
output_file=$(mktemp)
timeout "${DURATION_SECONDS}" curl -N -sS "http://127.0.0.1:${PROXY_PORT}/api/workflows/${workflow_id}/runs/stream?max_ticks=600" >"${output_file}" || true

echo "[4/5] 결과 검증"
if ! rg -q "event: run_status" "${output_file}"; then
  echo "실패: run_status 이벤트 미수신"
  cat "${output_file}"
  exit 1
fi
if ! rg -q "keepalive" "${output_file}"; then
  echo "실패: keepalive heartbeat 미수신"
  cat "${output_file}"
  exit 1
fi

echo "[5/5] 성공 - nginx 경유 SSE heartbeat 확인"
rg -n "run_status|keepalive|event: end" "${output_file}" | head -n 12
rm -f "${output_file}"
