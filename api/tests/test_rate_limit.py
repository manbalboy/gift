from concurrent.futures import ThreadPoolExecutor

from app.api import workflows as workflows_api

from .conftest import client
from .test_workflow_api import PAYLOAD


def test_sse_reconnect_rate_limit_under_concurrency(monkeypatch):
    monkeypatch.setattr(workflows_api.time, "sleep", lambda _seconds: None)
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
