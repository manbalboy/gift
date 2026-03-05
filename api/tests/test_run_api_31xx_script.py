from __future__ import annotations

from contextlib import closing
from pathlib import Path
import os
import socket
import subprocess


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _reserve_port(port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", port))
    sock.listen(1)
    return sock


def _write_fake_uvicorn(path: Path, *, mode: str) -> None:
    if mode == "success":
        content = """#!/usr/bin/env bash
echo "[fake-uvicorn] $*"
exit 0
"""
    else:
        content = """#!/usr/bin/env bash
echo "ERROR: [Errno 98] Address already in use" >&2
exit 1
"""
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


def test_run_api_31xx_skips_busy_3100_port(tmp_path):
    fake_uvicorn = tmp_path / "fake-uvicorn.sh"
    _write_fake_uvicorn(fake_uvicorn, mode="success")

    script = _repo_root() / "scripts" / "run-api-31xx.sh"
    env = os.environ.copy()
    env.update(
        {
            "HOST": "127.0.0.1",
            "START_PORT": "3100",
            "PORT_RANGE_START": "3100",
            "PORT_RANGE_END": "3102",
            "MAX_RETRY": "1",
            "RETRY_DELAY_SECONDS": "0.01",
            "UVICORN_BIN": str(fake_uvicorn),
        }
    )

    with closing(_reserve_port(3100)):
        result = subprocess.run(
            ["bash", str(script)],
            cwd=str(_repo_root()),
            env=env,
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )

    assert result.returncode == 0
    assert "127.0.0.1:3101" in result.stdout
    assert "--port 3101" in result.stdout


def test_run_api_31xx_fails_gracefully_after_address_in_use_retries(tmp_path):
    fake_uvicorn = tmp_path / "fake-uvicorn.sh"
    _write_fake_uvicorn(fake_uvicorn, mode="eaddr")

    script = _repo_root() / "scripts" / "run-api-31xx.sh"
    env = os.environ.copy()
    env.update(
        {
            "HOST": "127.0.0.1",
            "START_PORT": "3100",
            "PORT_RANGE_START": "3100",
            "PORT_RANGE_END": "3100",
            "MAX_RETRY": "2",
            "RETRY_DELAY_SECONDS": "0.01",
            "UVICORN_BIN": str(fake_uvicorn),
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

    assert result.returncode == 1
    merged = f"{result.stdout}\n{result.stderr}"
    assert "포트 충돌(Address already in use)을 감지했습니다." in merged
    assert "포트 충돌(Address already in use)로 실행에 실패했습니다." in merged
