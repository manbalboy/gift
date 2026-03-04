import hashlib
import hmac
import json

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
