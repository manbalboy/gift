from .conftest import client


def test_health_check():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "docker_available" in body
    assert "docker_health" in body
    assert "agent_runner" in body
    assert "workflow_engine" in body
    assert "sse_rate_limiter" in body
    assert "fallback_active" in body["sse_rate_limiter"]
    assert "workers" in body["workflow_engine"]
    assert "runtime_state" in body["workflow_engine"]
    if body["agent_runner"]["backend"] == "docker":
        assert "negative_cache_active" in body["agent_runner"]["docker_ping"]
