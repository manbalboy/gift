#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_DIR="$(node -e "const os=require('node:os');const path=require('node:path');process.stdout.write(path.join(os.tmpdir(),'devflow-port-locks'));")"
TMP_DIR="$(mktemp -d)"

cleanup() {
  if [[ -n "${HOLDER_PID:-}" ]]; then
    kill "${HOLDER_PID}" >/dev/null 2>&1 || true
    wait "${HOLDER_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${LOCK_DIR}/3100.lock" >/dev/null 2>&1 || true
  rm -rf "${TMP_DIR}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[1/4] 죽은 PID를 가진 잔여 락 파일을 생성합니다."
mkdir -p "$LOCK_DIR"
cat > "${LOCK_DIR}/3100.lock" <<'EOF'
{"pid":999999,"port":3100,"createdAt":"2026-03-05T00:00:00.000Z","reservedUntil":9999999999999}
EOF

RECOVERED_PORT="$(node "$ROOT_DIR/scripts/check-port.mjs")"
if [[ ! "$RECOVERED_PORT" =~ ^31[0-9]{2}$ ]]; then
  echo "[1/4] 실패: 잔여 락 정리 후 유효한 3100번대 포트를 찾지 못했습니다. port=${RECOVERED_PORT}"
  exit 1
fi
echo "[1/4] 성공: 잔여 락 정리 후 포트 할당에 성공했습니다. port=${RECOVERED_PORT}"

echo "[2/4] 3100~3199 포트를 점유합니다."
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

echo "[3/4] 동시 경합 상황에서 check-port.mjs 10개 프로세스 동시 실행 (타임아웃 실패 기대)"
START_TS=$(date +%s)
PIDS=()
WORKER_COUNT=10
for IDX in $(seq 1 "${WORKER_COUNT}"); do
  (
    set +e
    node "$ROOT_DIR/scripts/check-port.mjs" >"${TMP_DIR}/worker-${IDX}.out" 2>&1
    echo $? >"${TMP_DIR}/worker-${IDX}.code"
  ) &
  PIDS+=("$!")
done

for PID in "${PIDS[@]}"; do
  wait "$PID"
done

END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

FAILED_WORKERS=0
for IDX in $(seq 1 "${WORKER_COUNT}"); do
  CODE="$(cat "${TMP_DIR}/worker-${IDX}.code")"
  echo "[worker-${IDX}] exit=${CODE}"
  cat "${TMP_DIR}/worker-${IDX}.out"
  if [[ "${CODE}" -ne 0 ]]; then
    FAILED_WORKERS=$((FAILED_WORKERS + 1))
  fi
done

if [[ $FAILED_WORKERS -ne ${WORKER_COUNT} ]]; then
  echo "[4/4] 실패: 포트가 모두 점유됐는데 일부 워커가 성공했습니다. failed=${FAILED_WORKERS}/${WORKER_COUNT}"
  exit 1
fi

if [[ $ELAPSED -lt 5 ]]; then
  echo "[4/4] 실패: 타임아웃 재시도 없이 너무 빠르게 종료되었습니다. elapsed=${ELAPSED}s"
  exit 1
fi

kill "${HOLDER_PID}" >/dev/null 2>&1 || true
wait "${HOLDER_PID}" >/dev/null 2>&1 || true
unset HOLDER_PID
sleep 1

RECOVERED_AFTER_CONTENTION="$(node "$ROOT_DIR/scripts/check-port.mjs")"
if [[ ! "$RECOVERED_AFTER_CONTENTION" =~ ^31[0-9]{2}$ ]]; then
  echo "[4/4] 실패: 경합 종료 후 유효한 3100번대 포트를 다시 할당받지 못했습니다. port=${RECOVERED_AFTER_CONTENTION}"
  exit 1
fi

echo "[4/4] 성공: 동시 경합 타임아웃 및 포트 릴리즈 후 재할당이 정상 동작했습니다. port=${RECOVERED_AFTER_CONTENTION}"
