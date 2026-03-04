import pytest
import time

from app.core.config import settings
from app.services.agent_runner import DockerRunner
from .conftest import client


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost",
        "https://localhost",
        "http://localhost:3999",
        "http://127.0.0.1",
        "https://127.0.0.1:3101",
        "https://127.0.0.1:7099",
        "https://manbalboy.com",
        "http://manbalboy.com:3001",
        "http://ssh.manbalboy.com:7005",
    ],
)
def test_cors_allows_expected_origins(origin: str):
    response = client.options(
        "/api/workflows",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin


@pytest.mark.parametrize(
    "origin",
    [
        "http://evil-example.com:3100",
        "http://manbalboy.com.evil.com:3100",
        "http://amanbalboy.com:3101",
        "http://localhost:2999",
        "http://127.0.0.1:7100",
        "http://ssh.manbalboy.com:7200",
    ],
)
def test_cors_blocks_untrusted_origins(origin: str):
    response = client.options(
        "/api/workflows",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 400


def test_webhook_rejects_payload_larger_than_5mb(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json={
            "provider": "jenkins",
            "event_type": "ci.completed",
            "blob": "a" * (5 * 1024 * 1024 + 1),
        },
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "payload too large"


def test_webhook_rejects_boolean_workflow_id(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json={"provider": "jenkins", "event_type": "ci.completed", "workflow_id": True},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "workflow_id must be an integer"


def test_docker_ping_negative_cache_fail_fast(monkeypatch, tmp_path):
    calls = {"count": 0}

    class RunResult:
        returncode = 1
        stdout = ""
        stderr = "daemon down"

    def fake_run(*_args, **_kwargs):
        calls["count"] += 1
        time.sleep(0.05)
        return RunResult()

    monkeypatch.setattr("subprocess.run", fake_run)
    runner = DockerRunner(timeout_seconds=1, image="bash:5.2", workspaces_root=str(tmp_path))
    runner._docker_ping_negative_ttl = 4
    runner._docker_ping_negative_cache_until = 0

    first_started = time.monotonic()
    with pytest.raises(RuntimeError):
        runner._docker_ping()
    first_elapsed = time.monotonic() - first_started

    second_started = time.monotonic()
    with pytest.raises(RuntimeError):
        runner._docker_ping()
    second_elapsed = time.monotonic() - second_started

    assert calls["count"] == 1
    assert first_elapsed >= 0.05
    assert second_elapsed < 0.02
