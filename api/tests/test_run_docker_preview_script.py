from __future__ import annotations

from pathlib import Path
import os
import subprocess


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _write_fake_docker(path: Path) -> None:
    content = """#!/usr/bin/env bash
set -euo pipefail
echo "docker $*" >> "${DOCKER_CMD_LOG:?DOCKER_CMD_LOG is required}"
exit 0
"""
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


def test_run_docker_preview_maps_host_7000_range_to_container_31xx(tmp_path):
    fake_docker = tmp_path / "docker"
    _write_fake_docker(fake_docker)
    command_log = tmp_path / "docker-cmd.log"

    script = _repo_root() / "scripts" / "run-docker-preview.sh"
    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{tmp_path}:{env.get('PATH', '')}",
            "DOCKER_CMD_LOG": str(command_log),
            "PREVIEW_PORT": "3100",
            "API_PORT": "3101",
            "HOST_PREVIEW_PORT": "7000",
            "HOST_API_PORT": "7001",
            "IMAGE_NAME": "unit-test-image",
            "CONTAINER_NAME": "unit-test-container",
        }
    )

    result = subprocess.run(
        ["bash", str(script)],
        cwd=str(_repo_root()),
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
    )

    assert result.returncode == 0, f"{result.stdout}\n{result.stderr}"
    merged = f"{result.stdout}\n{result.stderr}"
    assert "host(web/api)=7000/7001" in merged

    log = command_log.read_text(encoding="utf-8")
    assert "docker build -t unit-test-image ." in log
    assert "docker run --name unit-test-container -e PREVIEW_PORT=3100 -e API_PORT=3101 -p 7000:3100 -p 7001:3101 unit-test-image" in log


def test_run_docker_preview_rejects_host_port_outside_7000_range():
    script = _repo_root() / "scripts" / "run-docker-preview.sh"
    env = os.environ.copy()
    env.update({"HOST_PREVIEW_PORT": "6999", "HOST_API_PORT": "7001"})

    result = subprocess.run(
        ["bash", str(script)],
        cwd=str(_repo_root()),
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
    )

    assert result.returncode == 1
    merged = f"{result.stdout}\n{result.stderr}"
    assert "host port must be in 7000-7099: 6999" in merged
