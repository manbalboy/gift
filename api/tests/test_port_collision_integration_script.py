from __future__ import annotations

from pathlib import Path
import os
import shutil
import subprocess


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_port_collision_integration_script_returns_non_zero_exit_code():
    if shutil.which("nc") is None and shutil.which("netcat") is None:
        return

    script = _repo_root() / "scripts" / "test-port-collision.sh"
    result = subprocess.run(
        ["bash", str(script)],
        cwd=str(_repo_root()),
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        check=False,
        timeout=20,
    )

    merged = f"{result.stdout}\n{result.stderr}"
    assert result.returncode == 0, merged
    assert "PASS: 포트 충돌 상황에서 비정상 종료를 감지했습니다" in merged
