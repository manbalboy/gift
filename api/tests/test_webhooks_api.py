import hashlib
import hmac
import json
import pytest

from app.core.config import settings

from .conftest import client
from .test_workflow_api import PAYLOAD


def _github_signature(secret: str, raw: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def test_dev_integration_webhook_triggers_run_for_github_pr(monkeypatch):
    monkeypatch.setattr(settings, "github_webhook_secret", "test-gh-secret")

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    payload = {
        "action": "opened",
        "pull_request": {"number": 11},
        "workflow_id": workflow_id,
    }
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    response = client.post(
        "/api/webhooks/dev-integration",
        headers={
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": _github_signature("test-gh-secret", raw),
            "Content-Type": "application/json",
        },
        content=raw,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] is True
    assert body["provider"] == "github"
    assert body["category"] == "pull_request"
    assert body["triggered"] is True
    assert isinstance(body["triggered_run_id"], int)


def test_dev_integration_webhook_rejects_missing_github_signature(monkeypatch):
    monkeypatch.setattr(settings, "github_webhook_secret", "test-gh-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-GitHub-Event": "pull_request"},
        json={"action": "opened", "workflow_id": 1},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "missing github signature"


def test_dev_integration_webhook_rejects_invalid_github_signature(monkeypatch):
    monkeypatch.setattr(settings, "github_webhook_secret", "test-gh-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={
            "X-GitHub-Event": "pull_request",
            "X-Hub-Signature-256": "sha256=invalid",
        },
        json={"action": "opened", "workflow_id": 1},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid github signature"


def test_dev_integration_webhook_accepts_generic_ci_event(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json={
            "provider": "jenkins",
            "event_type": "ci.completed",
            "workflow_id": 9999,
            "result": "success",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] is True
    assert body["provider"] == "jenkins"
    assert body["category"] == "ci"
    assert body["event_type"] == "ci.completed"
    assert body["triggered"] is False
    assert body["triggered_run_id"] is None


def test_dev_integration_webhook_rejects_generic_missing_secret(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        json={"provider": "jenkins", "event_type": "ci.completed"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "missing webhook secret"


def test_dev_integration_webhook_rejects_generic_invalid_secret(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "wrong-secret"},
        json={"provider": "jenkins", "event_type": "ci.completed"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid webhook secret"


def test_dev_integration_webhook_rejects_unallowed_source_ip(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")
    monkeypatch.setattr(settings, "webhook_allowed_source_ips", "203.0.113.10")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json={"provider": "jenkins", "event_type": "ci.completed"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "forbidden webhook source ip"


def test_dev_integration_webhook_allows_source_ip_from_trusted_forwarded_for(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")
    monkeypatch.setattr(settings, "webhook_trusted_proxy_ips", "testclient")
    monkeypatch.setattr(settings, "webhook_allowed_source_ips", "198.51.100.77")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={
            "X-API-Secret": "test-generic-secret",
            "x-forwarded-for": "10.0.0.2,198.51.100.77",
        },
        json={"provider": "jenkins", "event_type": "ci.completed"},
    )

    assert response.status_code == 200


def test_dev_integration_webhook_rejects_too_large_payload(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    large_text = "a" * (5 * 1024 * 1024 + 1)
    payload = {"provider": "jenkins", "event_type": "ci.completed", "blob": large_text}
    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json=payload,
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "payload too large"


def test_dev_integration_webhook_rejects_boolean_workflow_id(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json={"provider": "jenkins", "event_type": "ci.completed", "workflow_id": True},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "workflow_id must be an integer"


def test_dev_integration_webhook_rate_limits_by_ip(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")
    monkeypatch.setattr(settings, "webhook_rate_limit_per_window", 1)
    monkeypatch.setattr(settings, "webhook_rate_limit_window_seconds", 5.0)

    headers = {"X-API-Secret": "test-generic-secret", "x-forwarded-for": "10.10.10.9"}
    payload = {"provider": "jenkins", "event_type": "ci.completed"}

    first = client.post("/api/webhooks/dev-integration", headers=headers, json=payload)
    second = client.post("/api/webhooks/dev-integration", headers=headers, json=payload)

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["detail"] == "too many webhook requests"


def test_dev_integration_webhook_ignores_untrusted_forwarded_for(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")
    monkeypatch.setattr(settings, "webhook_rate_limit_per_window", 1)
    monkeypatch.setattr(settings, "webhook_rate_limit_window_seconds", 5.0)
    monkeypatch.setattr(settings, "webhook_trusted_proxy_ips", "127.0.0.1,::1")

    payload = {"provider": "jenkins", "event_type": "ci.completed"}
    first = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret", "x-forwarded-for": "203.0.113.11"},
        json=payload,
    )
    second = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret", "x-forwarded-for": "198.51.100.12"},
        json=payload,
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_dev_integration_webhook_trusts_forwarded_for_from_trusted_proxy(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")
    monkeypatch.setattr(settings, "webhook_rate_limit_per_window", 1)
    monkeypatch.setattr(settings, "webhook_rate_limit_window_seconds", 5.0)
    monkeypatch.setattr(settings, "webhook_trusted_proxy_ips", "testclient")

    payload = {"provider": "jenkins", "event_type": "ci.completed"}
    first = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret", "x-forwarded-for": "203.0.113.11"},
        json=payload,
    )
    second = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret", "x-forwarded-for": "198.51.100.12"},
        json=payload,
    )

    assert first.status_code == 200
    assert second.status_code == 200


def test_dev_integration_webhook_uses_rightmost_untrusted_ip_for_rate_limit(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")
    monkeypatch.setattr(settings, "webhook_rate_limit_per_window", 1)
    monkeypatch.setattr(settings, "webhook_rate_limit_window_seconds", 5.0)
    monkeypatch.setattr(settings, "webhook_trusted_proxy_ips", "testclient")

    payload = {"provider": "jenkins", "event_type": "ci.completed"}
    first = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret", "x-forwarded-for": "10.0.0.1,203.0.113.11"},
        json=payload,
    )
    second = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret", "x-forwarded-for": "198.51.100.8,203.0.113.11"},
        json=payload,
    )

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["detail"] == "too many webhook requests"


def test_dev_integration_webhook_falls_back_when_forwarded_for_is_malformed(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")
    monkeypatch.setattr(settings, "webhook_rate_limit_per_window", 1)
    monkeypatch.setattr(settings, "webhook_rate_limit_window_seconds", 5.0)
    monkeypatch.setattr(settings, "webhook_trusted_proxy_ips", "testclient")

    payload = {"provider": "jenkins", "event_type": "ci.completed"}
    first = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret", "x-forwarded-for": "203.0.113.11,not-an-ip"},
        json=payload,
    )
    second = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret", "x-forwarded-for": "198.51.100.12,not-an-ip"},
        json=payload,
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_dev_integration_webhook_logs_invalid_workflow_id(monkeypatch, caplog):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")
    caplog.set_level("WARNING")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json={"provider": "jenkins", "event_type": "ci.completed", "workflow_id": [1, 2]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["workflow_id"] is None
    assert body["warning_code"] == "workflow_id_ignored"
    assert body["warning_message"] == "workflow_id가 유효한 양의 정수가 아니어서 무시되었습니다."
    assert "Ignored webhook workflow_id due to parse failure" in caplog.text


def test_dev_integration_webhook_parses_string_workflow_id(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json={"provider": "jenkins", "event_type": "ci.completed", "workflow_id": str(workflow_id)},
    )

    assert response.status_code == 200
    assert response.json()["workflow_id"] == workflow_id


@pytest.mark.parametrize("invalid_workflow_id", [-1, 1.0, "-1", "1.0", 0, "0"])
def test_dev_integration_webhook_ignores_invalid_workflow_id_edge_cases(monkeypatch, invalid_workflow_id):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json={"provider": "jenkins", "event_type": "ci.completed", "workflow_id": invalid_workflow_id},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["workflow_id"] is None
    assert body["warning_code"] == "workflow_id_ignored"
    assert body["warning_message"] == "workflow_id가 유효한 양의 정수가 아니어서 무시되었습니다."


def test_dev_integration_webhook_invalid_json_is_422(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret", "Content-Type": "application/json"},
        content='{"provider":"jenkins"',
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "invalid webhook payload"
