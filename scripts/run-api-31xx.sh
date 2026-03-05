#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-0.0.0.0}"
START_PORT="${START_PORT:-3101}"
PORT_RANGE_START="${PORT_RANGE_START:-3100}"
PORT_RANGE_END="${PORT_RANGE_END:-3199}"
MAX_RETRY="${MAX_RETRY:-3}"
RETRY_DELAY_SECONDS="${RETRY_DELAY_SECONDS:-0.4}"
UVICORN_BIN="${UVICORN_BIN:-.venv/bin/uvicorn}"

if ! [[ "$START_PORT" =~ ^[0-9]+$ && "$PORT_RANGE_START" =~ ^[0-9]+$ && "$PORT_RANGE_END" =~ ^[0-9]+$ ]]; then
  echo "[run-api-31xx] 포트 값은 숫자여야 합니다." >&2
  exit 1
fi

if (( PORT_RANGE_START > PORT_RANGE_END )); then
  echo "[run-api-31xx] PORT_RANGE_START는 PORT_RANGE_END보다 작거나 같아야 합니다." >&2
  exit 1
fi

if (( START_PORT < PORT_RANGE_START || START_PORT > PORT_RANGE_END )); then
  echo "[run-api-31xx] START_PORT는 ${PORT_RANGE_START}-${PORT_RANGE_END} 범위여야 합니다." >&2
  exit 1
fi

if (( PORT_RANGE_START < 3100 || PORT_RANGE_END > 3199 )); then
  echo "[run-api-31xx] 허용 포트는 3100-3199 범위입니다." >&2
  exit 1
fi

if [[ ! -x "$UVICORN_BIN" ]]; then
  echo "[run-api-31xx] uvicorn 실행 파일을 찾을 수 없습니다: ${UVICORN_BIN}" >&2
  exit 1
fi

port_busy() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "( sport = :$port )" | tail -n +2 | grep -q .
    return $?
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1
    return $?
  fi
  return 1
}

select_port() {
  local first="$1"
  local p
  if ! port_busy "$first"; then
    echo "$first"
    return 0
  fi
  for (( p=PORT_RANGE_START; p<=PORT_RANGE_END; p++ )); do
    if (( p == first )); then
      continue
    fi
    if ! port_busy "$p"; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

attempt=1
while (( attempt <= MAX_RETRY )); do
  selected_port="$(select_port "$START_PORT" || true)"
  if [[ -z "${selected_port:-}" ]]; then
    echo "[run-api-31xx] 사용 가능한 3100번대 포트를 찾지 못했습니다." >&2
    exit 1
  fi

  attempt_log="$(mktemp)"
  echo "[run-api-31xx] API 시작 시도 ${attempt}/${MAX_RETRY} - ${HOST}:${selected_port}"
  set +e
  PYTHONPATH=api "$UVICORN_BIN" app.main:app --host "$HOST" --port "$selected_port" 2>&1 | tee "$attempt_log"
  rc=${PIPESTATUS[0]}
  set -e
  if grep -Eiq "(address already in use|errno 98|eaddrinuse)" "$attempt_log"; then
    collision_detected=1
  else
    collision_detected=0
  fi
  rm -f "$attempt_log"

  if (( rc == 0 )); then
    exit 0
  fi

  if (( attempt == MAX_RETRY )); then
    if (( collision_detected == 1 )); then
      echo "[run-api-31xx] 포트 충돌(Address already in use)로 실행에 실패했습니다. 재시도 한도를 초과했습니다." >&2
    else
      echo "[run-api-31xx] 서버 실행 실패 (exit=${rc}). 재시도 한도를 초과했습니다." >&2
    fi
    exit "$rc"
  fi

  if (( collision_detected == 1 )); then
    echo "[run-api-31xx] 포트 충돌(Address already in use)을 감지했습니다. 포트를 재탐색해 재시도합니다."
  else
    echo "[run-api-31xx] 실행 실패(exit=${rc}). 포트를 재탐색해 재시도합니다."
  fi
  sleep "$RETRY_DELAY_SECONDS"
  attempt=$((attempt + 1))
done
