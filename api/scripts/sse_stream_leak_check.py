#!/usr/bin/env python3
"""SSE 연결/강제종료 반복 시 active_stream_connections 누수를 점검합니다."""

from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.error import URLError
from urllib.request import Request, urlopen


def open_and_abort_once(base_url: str, workflow_id: int, timeout: float) -> bool:
    url = f"{base_url}/api/workflows/{workflow_id}/runs/stream?max_ticks=30"
    req = Request(url, headers={"Accept": "text/event-stream"})
    try:
        with urlopen(req, timeout=timeout) as response:  # nosec B310 (local test script)
            response.readline()
            return True
    except URLError:
        return False


def read_active_connections(base_url: str, timeout: float) -> int:
    url = f"{base_url}/api/runs/stream-metrics/active-connections"
    req = Request(url, headers={"Accept": "application/json"})
    with urlopen(req, timeout=timeout) as response:  # nosec B310 (local test script)
        payload = json.loads(response.read().decode("utf-8"))
        return int(payload.get("active_stream_connections", -1))


def main() -> int:
    parser = argparse.ArgumentParser(description="SSE active_stream_connections 누수 확인")
    parser.add_argument("--base-url", default="http://127.0.0.1:3101", help="API 서버 URL")
    parser.add_argument("--workflow-id", type=int, required=True, help="테스트 대상 workflow id")
    parser.add_argument("--clients", type=int, default=20, help="동시 접속 수")
    parser.add_argument("--rounds", type=int, default=5, help="반복 라운드")
    parser.add_argument("--timeout", type=float, default=3.0, help="요청 타임아웃(초)")
    args = parser.parse_args()

    print(f"[sse-leak-check] base={args.base_url} workflow_id={args.workflow_id} clients={args.clients} rounds={args.rounds}")

    for round_idx in range(1, args.rounds + 1):
        with ThreadPoolExecutor(max_workers=args.clients) as pool:
            results = list(pool.map(lambda _i: open_and_abort_once(args.base_url, args.workflow_id, args.timeout), range(args.clients)))
        ok_count = sum(1 for result in results if result)
        print(f"[round {round_idx}] connected={ok_count}/{args.clients}")
        time.sleep(0.4)

    time.sleep(1.2)
    active = read_active_connections(args.base_url, args.timeout)
    print(f"[result] active_stream_connections={active}")

    if active != 0:
        print("[result] FAIL: 연결 누수 의심")
        return 1

    print("[result] PASS: 누수 징후 없음")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
