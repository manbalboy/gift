from .conftest import client
from .test_workflow_api import PAYLOAD


def test_dev_integration_webhook_triggers_run_for_github_pr():
    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-GitHub-Event": "pull_request"},
        json={
            "action": "opened",
            "pull_request": {"number": 11},
            "workflow_id": workflow_id,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["accepted"] is True
    assert body["provider"] == "github"
    assert body["category"] == "pull_request"
    assert body["triggered"] is True
    assert isinstance(body["triggered_run_id"], int)


def test_dev_integration_webhook_accepts_generic_ci_event():
    response = client.post(
        "/api/webhooks/dev-integration",
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
