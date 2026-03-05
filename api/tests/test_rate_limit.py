import asyncio
from concurrent.futures import ThreadPoolExecutor

from app.api import workflows as workflows_api
from app.services.rate_limiter import RedisError, SSEReconnectRateLimiter

from .conftest import client
from .test_workflow_api import PAYLOAD


def test_sse_reconnect_rate_limit_under_concurrency(monkeypatch):
    async def _instant_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr(workflows_api.asyncio, "sleep", _instant_sleep)
    monkeypatch.setattr(workflows_api.settings, "sse_reconnect_limit_per_second", 1)
    monkeypatch.setattr(workflows_api.settings, "sse_rate_limit_window_seconds", 1)
    workflows_api.reconnect_rate_limiter.reset_for_tests()

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    def hit_stream() -> int:
        response = client.get(
            f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1",
            headers={"x-forwarded-for": "10.10.10.1"},
        )
        return response.status_code

    with ThreadPoolExecutor(max_workers=5) as pool:
        statuses = list(pool.map(lambda _n: hit_stream(), range(5)))

    assert 200 in statuses
    assert 429 in statuses


def test_sse_reconnect_local_fallback_uses_conservative_limit(monkeypatch):
    limiter = SSEReconnectRateLimiter(backend="local")
    calls = {"count": 0}

    class BrokenRedis:
        def allow(self, key: str, limit: int, window_seconds: float) -> bool:
            calls["count"] += 1
            raise RedisError("redis down")

    limiter._backend = "redis"
    limiter._redis = BrokenRedis()

    monkeypatch.setattr(workflows_api.settings, "sse_local_fallback_limit_ratio", 0.5)
    monkeypatch.setattr(workflows_api.settings, "sse_redis_fallback_ttl_seconds", 4.0)
    limiter.reset_for_tests()

    def hit() -> bool:
        return limiter.allow(key="10.10.10.2", limit=10, window_seconds=1)

    with ThreadPoolExecutor(max_workers=20) as pool:
        allowed = list(pool.map(lambda _n: hit(), range(20)))

    assert sum(1 for item in allowed if item) == 5
    assert calls["count"] == 1
