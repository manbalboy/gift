import pytest

from app.services.workspace import InvalidNodeIdError, WorkspaceService


def test_write_artifact_rejects_path_traversal_node_id():
    workspace = WorkspaceService()
    with pytest.raises(InvalidNodeIdError):
        workspace.write_artifact(run_id=1, node_id="../../etc/passwd", content="malicious")


def test_write_artifact_rejects_negative_run_id():
    workspace = WorkspaceService()
    with pytest.raises(InvalidNodeIdError):
        workspace.write_artifact(run_id=-1, node_id="idea", content="malicious")
