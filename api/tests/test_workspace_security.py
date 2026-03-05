import pytest
from pathlib import Path
import time

from app.api import workflows as workflows_api
from app.services.system_alerts import _sanitize_string
from app.services.workspace import InvalidNodeIdError, WorkspaceArtifactIOError, WorkspaceService
from .conftest import client


def test_write_artifact_rejects_path_traversal_node_id():
    workspace = WorkspaceService()
    with pytest.raises(InvalidNodeIdError):
        workspace.write_artifact(run_id=1, node_id="../../etc/passwd", content="malicious")


def test_write_artifact_rejects_negative_run_id():
    workspace = WorkspaceService()
    with pytest.raises(InvalidNodeIdError):
        workspace.write_artifact(run_id=-1, node_id="idea", content="malicious")


def test_write_artifact_raises_on_directory_creation_failure(monkeypatch):
    workspace = WorkspaceService()

    def raise_permission(*_args, **_kwargs):
        raise PermissionError("mkdir blocked")

    monkeypatch.setattr(Path, "mkdir", raise_permission)

    with pytest.raises(WorkspaceArtifactIOError):
        workspace.write_artifact(run_id=3, node_id="idea", content="data")


def test_write_artifact_raises_on_write_text_failure(monkeypatch):
    workspace = WorkspaceService()

    def raise_oserror(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(Path, "write_text", raise_oserror)

    with pytest.raises(WorkspaceArtifactIOError):
        workspace.write_artifact(run_id=4, node_id="plan", content="data")


def test_write_artifact_retries_on_permission_lock(monkeypatch):
    workspace = WorkspaceService()
    calls = {"count": 0}

    original_write_text = Path.write_text

    def flaky_write(path_obj: Path, *args, **kwargs):
        calls["count"] += 1
        if calls["count"] < 3:
            raise PermissionError("file is temporarily locked")
        return original_write_text(path_obj, *args, **kwargs)

    monkeypatch.setattr(Path, "write_text", flaky_write)

    result_path = workspace.write_artifact(run_id=5, node_id="retry-lock", content="ok")
    assert result_path.endswith("retry-lock.md")
    assert calls["count"] == 3


def test_read_artifact_retries_on_open_lock_contention(monkeypatch):
    workspace = WorkspaceService()
    workspace.write_artifact(run_id=7, node_id="read-lock", content="hello")
    calls = {"count": 0}
    original_open = Path.open

    def flaky_open(path_obj: Path, *args, **kwargs):
        calls["count"] += 1
        if calls["count"] < 3:
            raise PermissionError("file is temporarily locked")
        return original_open(path_obj, *args, **kwargs)

    monkeypatch.setattr(Path, "open", flaky_open)
    chunk, has_more, next_offset = workspace.read_artifact_chunk(run_id=7, node_id="read-lock", offset=0, limit=16)

    assert chunk == "hello"
    assert has_more is False
    assert next_offset == len("hello".encode("utf-8"))
    assert calls["count"] == 3


def test_read_artifact_raises_on_lock_contention_exhausted(monkeypatch):
    workspace = WorkspaceService()
    workspace.write_artifact(run_id=8, node_id="read-fail", content="hello")

    def always_locked(*_args, **_kwargs):
        raise PermissionError("permanently locked")

    monkeypatch.setattr(Path, "open", always_locked)

    with pytest.raises(WorkspaceArtifactIOError):
        workspace.read_artifact_chunk(run_id=8, node_id="read-fail", offset=0, limit=16)


def test_human_gate_rejects_cross_workspace_approval_with_403(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_workspaces", "main,other")

    payload = {
        "name": "Workspace Boundary",
        "description": "authorization isolation test",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "review", "type": "human_gate", "label": "Review"},
            ],
            "edges": [{"id": "e1", "source": "idea", "target": "review"}],
        },
    }
    created = client.post("/api/workflows", json=payload, headers={"X-Workspace-Id": "main"})
    assert created.status_code == 200
    run = client.post(f"/api/workflows/{created.json()['id']}/runs", headers={"X-Workspace-Id": "main"})
    assert run.status_code == 200
    run_id = run.json()["id"]

    pending_ready = False
    for _ in range(30):
        current = client.get(f"/api/runs/{run_id}")
        assert current.status_code == 200
        if any(node["status"] == "approval_pending" for node in current.json()["node_runs"]):
            pending_ready = True
            break
        time.sleep(0.05)
    assert pending_ready

    response = client.post(
        f"/api/runs/{run_id}/approve?node_id=review",
        headers={
            "X-Approver-Token": "secret-approver",
            "X-Approver-Role": "reviewer",
            "X-Workspace-Id": "other",
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "workspace does not match workflow"


def test_system_alert_masking_handles_large_payload_without_timeout():
    very_long = ("Bearer secret-token-123 /home/docker/private/path " * 8000).strip()
    started = time.perf_counter()
    sanitized = _sanitize_string(very_long)
    elapsed = time.perf_counter() - started

    assert elapsed < 0.6
    assert len(sanitized) <= 10000
    assert "Bearer " not in sanitized
    assert "/home/docker/" not in sanitized
    assert "***[MASKED]***" in sanitized


def test_workflow_control_api_requires_token_and_role_for_run_actions(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "workflow_control_token", "workflow-secret")
    monkeypatch.setattr(workflows_api.settings, "workflow_control_roles", "operator,admin")

    payload = {
        "name": "Workflow Control Auth",
        "description": "",
        "graph": {
            "nodes": [{"id": "idea", "type": "task", "label": "Idea"}],
            "edges": [],
        },
    }
    created = client.post("/api/workflows", json=payload, headers={"X-Workspace-Id": "main"})
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    missing = client.post(f"/api/workflows/{workflow_id}/runs")
    assert missing.status_code == 401
    assert missing.json()["detail"] == "missing workflow control token"

    invalid = client.post(
        f"/api/workflows/{workflow_id}/runs",
        headers={"X-Workflow-Control-Token": "wrong", "X-Workflow-Control-Role": "operator"},
    )
    assert invalid.status_code == 403
    assert invalid.json()["detail"] == "invalid workflow control token"

    missing_role = client.post(
        f"/api/workflows/{workflow_id}/runs",
        headers={"X-Workflow-Control-Token": "workflow-secret"},
    )
    assert missing_role.status_code == 403
    assert missing_role.json()["detail"] == "missing workflow control role"

    insufficient_role = client.post(
        f"/api/workflows/{workflow_id}/runs",
        headers={"X-Workflow-Control-Token": "workflow-secret", "X-Workflow-Control-Role": "reviewer"},
    )
    assert insufficient_role.status_code == 403
    assert insufficient_role.json()["detail"] == "insufficient workflow control role"

    allowed = client.post(
        f"/api/workflows/{workflow_id}/runs",
        headers={"X-Workflow-Control-Token": "workflow-secret", "X-Workflow-Control-Role": "operator"},
    )
    assert allowed.status_code == 200

    missing_cancel = client.post("/api/runs/999999/cancel")
    assert missing_cancel.status_code == 401
    assert missing_cancel.json()["detail"] == "missing workflow control token"

    invalid_resume = client.post(
        "/api/runs/999999/resume",
        headers={"X-Workflow-Control-Token": "workflow-secret", "X-Workflow-Control-Role": "viewer"},
    )
    assert invalid_resume.status_code == 403
    assert invalid_resume.json()["detail"] == "insufficient workflow control role"
