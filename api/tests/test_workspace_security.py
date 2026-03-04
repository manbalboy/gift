import pytest
from pathlib import Path

from app.services.workspace import InvalidNodeIdError, WorkspaceService


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

    with pytest.raises(PermissionError):
        workspace.write_artifact(run_id=3, node_id="idea", content="data")


def test_write_artifact_raises_on_write_text_failure(monkeypatch):
    workspace = WorkspaceService()

    def raise_oserror(*_args, **_kwargs):
        raise OSError("disk full")

    monkeypatch.setattr(Path, "write_text", raise_oserror)

    with pytest.raises(OSError):
        workspace.write_artifact(run_id=4, node_id="plan", content="data")
