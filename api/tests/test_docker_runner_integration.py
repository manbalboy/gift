import subprocess
import time

import pytest

from app.schemas.agent import AgentTaskRequest
from app.services.agent_runner import DockerRunner


def _docker_ready() -> bool:
    try:
        result = subprocess.run(
            ["docker", "info"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
            timeout=4,
        )
    except Exception:
        return False
    return result.returncode == 0


def _list_devflow_containers() -> set[str]:
    result = subprocess.run(
        ["docker", "ps", "-a", "--filter", "name=devflow-run-", "--format", "{{.Names}}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
        timeout=4,
    )
    if result.returncode != 0:
        return set()
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


pytestmark = pytest.mark.skipif(not _docker_ready(), reason="docker daemon unavailable for integration test")


def test_docker_runner_execution_integration(tmp_path):
    runner = DockerRunner(timeout_seconds=5, image="bash:5.2", workspaces_root=str(tmp_path))
    result = runner.run(
        AgentTaskRequest(
            node_id="plan",
            node_name="Plan",
            payload={
                "run_id": 101,
                "command": "echo integration-ok > /workspace/workspaces/probe.txt && cat /workspace/workspaces/probe.txt",
            },
        )
    )

    assert result.ok is True
    assert "integration-ok" in result.log
    probe = tmp_path / "main" / "runs" / "101" / "sandbox" / "plan" / "probe.txt"
    assert probe.exists()
    assert probe.read_text(encoding="utf-8").strip() == "integration-ok"


def test_docker_runner_timeout_rolls_back_container_integration(tmp_path):
    before = _list_devflow_containers()
    runner = DockerRunner(timeout_seconds=1, image="bash:5.2", workspaces_root=str(tmp_path))

    result = runner.run(
        AgentTaskRequest(
            node_id="test",
            node_name="Test",
            payload={"run_id": 102, "command": "while true; do :; done"},
        )
    )

    time.sleep(0.4)
    after = _list_devflow_containers()

    assert result.ok is False
    assert result.output.get("timeout") is True
    assert after == before
