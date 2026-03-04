from .conftest import client


def test_health_check():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "docker_available" in body
    assert "sse_rate_limiter" in body
    assert "fallback_active" in body["sse_rate_limiter"]
