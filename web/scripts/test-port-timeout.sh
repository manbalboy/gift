#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  if [[ -n "${HOLDER_PID:-}" ]]; then
    kill "${HOLDER_PID}" >/dev/null 2>&1 || true
    wait "${HOLDER_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[1/3] 3100~3199 포트를 점유합니다."
node -e "
  const net = require('node:net');
  const servers = [];
  for (let port = 3100; port <= 3199; port += 1) {
    const server = net.createServer();
    server.listen(port, '127.0.0.1');
    servers.push(server);
  }
  process.on('SIGTERM', () => {
    Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve)))).finally(() => process.exit(0));
  });
  setInterval(() => {}, 1000);
" >/dev/null 2>&1 &
HOLDER_PID=$!

sleep 1

echo "[2/3] check-port.mjs 실행 (타임아웃 실패 기대)"
START_TS=$(date +%s)
set +e
OUTPUT=$(node "$ROOT_DIR/scripts/check-port.mjs" 2>&1)
EXIT_CODE=$?
set -e
END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

echo "$OUTPUT"

if [[ $EXIT_CODE -eq 0 ]]; then
  echo "[3/3] 실패: 포트가 모두 점유됐는데도 스크립트가 성공했습니다."
  exit 1
fi

if [[ $ELAPSED -lt 5 ]]; then
  echo "[3/3] 실패: 타임아웃 재시도 없이 너무 빠르게 종료되었습니다. elapsed=${ELAPSED}s"
  exit 1
fi

echo "[3/3] 성공: 포트 고갈 타임아웃이 정상 동작했습니다."
