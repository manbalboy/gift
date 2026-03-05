import pytest
from pathlib import Path
import time

from app.api import workflows as workflows_api
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
