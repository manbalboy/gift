#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_SCRIPT="$ROOT_DIR/scripts/run-api-31xx.sh"

if [[ ! -x "$RUNNER_SCRIPT" ]]; then
  echo "[test-port-collision] run-api-31xx.sh 실행 파일을 찾을 수 없습니다: $RUNNER_SCRIPT" >&2
  exit 1
fi

if command -v nc >/dev/null 2>&1; then
  NC_BIN="nc"
elif command -v netcat >/dev/null 2>&1; then
  NC_BIN="netcat"
else
  echo "[test-port-collision] nc/netcat 명령을 찾을 수 없습니다." >&2
  exit 2
fi

TMP_DIR="$(mktemp -d)"
LOCK_PID=""

cleanup() {
  if [[ -n "$LOCK_PID" ]]; then
    kill "$LOCK_PID" >/dev/null 2>&1 || true
    wait "$LOCK_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

cat >"$TMP_DIR/fake-uvicorn.sh" <<'EOF'
#!/usr/bin/env bash
echo "ERROR: [Errno 98] Address already in use" >&2
exit 1
EOF
chmod +x "$TMP_DIR/fake-uvicorn.sh"

"$NC_BIN" -l 3100 >/dev/null 2>&1 &
LOCK_PID="$!"
sleep 0.2

set +e
OUTPUT="$(
  HOST=127.0.0.1 \
  START_PORT=3100 \
  PORT_RANGE_START=3100 \
  PORT_RANGE_END=3100 \
  MAX_RETRY=1 \
  RETRY_DELAY_SECONDS=0.01 \
  UVICORN_BIN="$TMP_DIR/fake-uvicorn.sh" \
  bash "$RUNNER_SCRIPT" 2>&1
)"
RC=$?
set -e

echo "$OUTPUT"

if [[ "$RC" -eq 0 ]]; then
  echo "[test-port-collision] 실패: 포트 충돌 상황에서 exit code 0이 반환되었습니다." >&2
  exit 1
fi

if [[ "$OUTPUT" != *"사용 가능한 3100번대 포트를 찾지 못했습니다."* ]]; then
  echo "[test-port-collision] 실패: 예상 메시지를 찾지 못했습니다." >&2
  exit 1
fi

echo "[test-port-collision] PASS: 포트 충돌 상황에서 비정상 종료를 감지했습니다 (exit=$RC)."
