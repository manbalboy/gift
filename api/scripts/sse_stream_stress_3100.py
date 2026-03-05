#!/usr/bin/env python3
"""3100 포트 기반 로컬 SSE 스트리밍 스트레스 및 버퍼 Cap 검증 스크립트."""

from __future__ import annotations

import argparse
import json
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.error import URLError
from urllib.request import Request, urlopen


def _read_stream_once(base_url: str, workflow_id: int, timeout: float, max_ticks: int) -> bool:
    url = f"{base_url}/api/workflows/{workflow_id}/runs/stream?max_ticks={max_ticks}"
    req = Request(url, headers={"Accept": "text/event-stream"})
    try:
        with urlopen(req, timeout=timeout) as response:  # nosec B310 (local-only script)
            for _ in range(8):
                line = response.readline()
                if not line:
                    break
            return True
    except URLError:
        return False


def _read_stream_metrics(base_url: str, timeout: float) -> dict[str, int]:
    url = f"{base_url}/api/runs/stream-metrics/active-connections"
    req = Request(url, headers={"Accept": "application/json"})
    with urlopen(req, timeout=timeout) as response:  # nosec B310 (local-only script)
        payload = json.loads(response.read().decode("utf-8"))
        return {
            "active_stream_connections": int(payload.get("active_stream_connections", -1)),
            "buffered_event_items": int(payload.get("buffered_event_items", -1)),
            "buffered_event_bytes": int(payload.get("buffered_event_bytes", -1)),
            "buffered_event_max_items": int(payload.get("buffered_event_max_items", -1)),
            "buffered_event_max_bytes": int(payload.get("buffered_event_max_bytes", -1)),
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="3100 포트 SSE 스트리밍 스트레스/메모리 Cap 검증")
    parser.add_argument("--base-url", default="http://127.0.0.1:3100", help="API 서버 URL (기본: 3100)")
    parser.add_argument("--workflow-id", type=int, required=True, help="테스트 대상 workflow id")
    parser.add_argument("--clients", type=int, default=80, help="동시 SSE 접속 수")
    parser.add_argument("--rounds", type=int, default=6, help="스트레스 반복 라운드")
    parser.add_argument("--max-ticks", type=int, default=120, help="각 스트림 max_ticks")
    parser.add_argument("--timeout", type=float, default=3.0, help="요청 타임아웃(초)")
    args = parser.parse_args()

    print(
        "[sse-stress-3100] "
        f"base={args.base_url} workflow_id={args.workflow_id} clients={args.clients} rounds={args.rounds}"
    )

    for round_idx in range(1, args.rounds + 1):
        start = time.monotonic()
        with ThreadPoolExecutor(max_workers=args.clients) as pool:
            results = list(
                pool.map(
                    lambda _i: _read_stream_once(args.base_url, args.workflow_id, args.timeout, args.max_ticks),
                    range(args.clients),
                )
            )
        ok_count = sum(1 for value in results if value)
        elapsed = time.monotonic() - start
        metrics = _read_stream_metrics(args.base_url, args.timeout)
        print(
            f"[round {round_idx}] connected={ok_count}/{args.clients} elapsed={elapsed:.2f}s "
            f"active={metrics['active_stream_connections']} "
            f"buffer={metrics['buffered_event_items']}/{metrics['buffered_event_max_items']} items, "
            f"{metrics['buffered_event_bytes']}/{metrics['buffered_event_max_bytes']} bytes"
        )
        time.sleep(0.25)

    time.sleep(1.2)
    final = _read_stream_metrics(args.base_url, args.timeout)
    print(f"[final] {final}")

    if final["active_stream_connections"] != 0:
        print("[final] FAIL: active stream connection leak detected")
        return 1
    if final["buffered_event_items"] > final["buffered_event_max_items"]:
        print("[final] FAIL: buffered event items exceeded configured cap")
        return 1
    if final["buffered_event_bytes"] > final["buffered_event_max_bytes"]:
        print("[final] FAIL: buffered event bytes exceeded configured cap")
        return 1

    print("[final] PASS: 3100 스트레스 환경에서 SSE 윈도잉/메모리 Cap이 정상 동작했습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
