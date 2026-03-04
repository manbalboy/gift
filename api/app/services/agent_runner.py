import os
import signal
import subprocess
import tempfile
import logging
import threading
import time
import uuid
from pathlib import Path
from typing import Protocol

from app.core.config import settings
from app.schemas.agent import AgentTaskRequest, AgentTaskResult
from app.services.workspace import WorkspaceService, InvalidNodeIdError


DEFAULT_TIMEOUT_SECONDS = 300
logger = logging.getLogger(__name__)


class ScriptRunner(Protocol):
    def run(self, request: AgentTaskRequest) -> AgentTaskResult:
        pass

    def health_snapshot(self) -> dict[str, object]:
        pass


class BaseRunner:
    def __init__(self, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.timeout_seconds = timeout_seconds

    def _build_script(self, command: str) -> str:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".sh",
            prefix="agent-run-",
            delete=False,
        ) as script_file:
            script_file.write("#!/usr/bin/env bash\n")
            script_file.write("set -euo pipefail\n")
            script_file.write(command)
            script_file.write("\n")
            return script_file.name

    def _resolve_command(self, request: AgentTaskRequest) -> str:
        command = request.payload.get("command")
        if not command:
            run_id = request.payload.get("run_id", "unknown")
            command = f'echo "[agent] run_id={run_id} node={request.node_id} name={request.node_name}"'
        return command

    def _handle_timeout(
        self,
        request: AgentTaskRequest,
        stdout: str,
        stderr: str,
        extra_message: str = "",
    ) -> AgentTaskResult:
        timeout_log = f"[agent] timeout({self.timeout_seconds}s): {request.node_name}"
        extra = "\n".join(part for part in [stdout.strip(), stderr.strip(), extra_message.strip()] if part)
        return AgentTaskResult(
            ok=False,
            log=f"{timeout_log}\n{extra}".strip(),
            output={"node_id": request.node_id, "exit_code": None, "timeout": True},
        )

    def _handle_exception(self, request: AgentTaskRequest, exc: Exception) -> AgentTaskResult:
        return AgentTaskResult(
            ok=False,
            log=f"[agent] exception: {exc}",
            output={"node_id": request.node_id, "exit_code": None, "error": str(exc)},
        )

    def _build_success_result(
        self,
        request: AgentTaskRequest,
        process_returncode: int | None,
        stdout: str,
        stderr: str,
    ) -> AgentTaskResult:
        out = (stdout or "").strip()
        err = (stderr or "").strip()
        log_parts = [part for part in [out, err] if part]
        log = "\n".join(log_parts) if log_parts else f"[agent] exit code: {process_returncode}"
        ok = process_returncode == 0
        return AgentTaskResult(
            ok=ok,
            log=log,
            output={"node_id": request.node_id, "exit_code": process_returncode},
        )


class HostRunner(BaseRunner):
    def health_snapshot(self) -> dict[str, object]:
        return {"backend": "host", "docker_ping": {"enabled": False}}

    def run(self, request: AgentTaskRequest) -> AgentTaskResult:
        command = self._resolve_command(request)
        script_path = self._build_script(command)
        os.chmod(script_path, 0o700)

        process: subprocess.Popen[str] | None = None
        try:
            process = subprocess.Popen(
                ["bash", script_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                preexec_fn=os.setsid,
            )
            stdout, stderr = process.communicate(timeout=self.timeout_seconds)
        except subprocess.TimeoutExpired:
            if process is not None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                stdout, stderr = process.communicate()
            else:
                stdout, stderr = "", ""
            return self._handle_timeout(request, stdout, stderr)
        except Exception as exc:
            return self._handle_exception(request, exc)
        finally:
            try:
                os.remove(script_path)
            except FileNotFoundError:
                pass

        assert process is not None
        return self._build_success_result(
            request=request,
            process_returncode=process.returncode,
            stdout=stdout,
            stderr=stderr,
        )


class DockerRunner(BaseRunner):
    def __init__(
        self,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        image: str | None = None,
        workspaces_root: str | None = None,
    ) -> None:
        super().__init__(timeout_seconds=timeout_seconds)
        self.image = image or settings.docker_image
        self.workspaces_root = str(Path(workspaces_root or settings.workspaces_root).resolve())
        self.workspace_service = WorkspaceService(root=self.workspaces_root)
        self._docker_ping_ttl = max(0.0, float(settings.docker_ping_cache_ttl_seconds))
        self._docker_ping_negative_ttl = max(0.0, float(settings.docker_ping_negative_cache_ttl_seconds))
        self._docker_ping_cache_until = 0.0
        self._docker_ping_negative_cache_until = 0.0
        self._docker_ping_last_error = "docker daemon unavailable"
        self._docker_ping_guard = threading.Lock()

    def _build_docker_command(self, container_name: str, script_path: str, task_workspace: str) -> list[str]:
        return [
            "docker",
            "run",
            "--rm",
            "--name",
            container_name,
            "--network",
            "none",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--pids-limit",
            "128",
            "--cpus",
            "1.0",
            "--memory",
            "256m",
            "--user",
            "65534:65534",
            "-v",
            f"{script_path}:/workspace/run.sh:ro",
            "-v",
            f"{task_workspace}:/workspace/workspaces:rw",
            "-w",
            "/workspace",
            self.image,
            "bash",
            "/workspace/run.sh",
        ]

    def _force_remove_container(self, container_name: str) -> str:
        try:
            cleanup = subprocess.run(
                ["docker", "rm", "-f", container_name],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
            )
            if cleanup.returncode == 0:
                return ""
            return (cleanup.stderr or cleanup.stdout or "").strip()
        except Exception as exc:
            return str(exc)

    def _docker_ping(self) -> None:
        if not settings.require_docker_ping_per_run:
            return
        now = time.monotonic()
        if self._docker_ping_ttl > 0 and now < self._docker_ping_cache_until:
            logger.debug("docker ping cache hit")
            return
        if self._docker_ping_negative_ttl > 0 and now < self._docker_ping_negative_cache_until:
            logger.debug("docker ping negative cache hit")
            raise RuntimeError(self._docker_ping_last_error)

        with self._docker_ping_guard:
            now = time.monotonic()
            if self._docker_ping_ttl > 0 and now < self._docker_ping_cache_until:
                logger.debug("docker ping cache hit (locked)")
                return
            if self._docker_ping_negative_ttl > 0 and now < self._docker_ping_negative_cache_until:
                logger.debug("docker ping negative cache hit (locked)")
                raise RuntimeError(self._docker_ping_last_error)

            result = subprocess.run(
                ["docker", "info"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
                timeout=3,
            )
            if result.returncode != 0:
                detail = (result.stderr or result.stdout or "unknown docker error").strip()
                self._docker_ping_last_error = f"docker daemon unavailable: {detail}"
                if self._docker_ping_negative_ttl > 0:
                    self._docker_ping_negative_cache_until = time.monotonic() + self._docker_ping_negative_ttl
                raise RuntimeError(self._docker_ping_last_error)
            self._docker_ping_cache_until = time.monotonic() + self._docker_ping_ttl
            self._docker_ping_negative_cache_until = 0.0
            self._docker_ping_last_error = ""
            logger.debug("docker ping refreshed (ttl=%.1fs)", self._docker_ping_ttl)

    def health_snapshot(self) -> dict[str, object]:
        now = time.monotonic()
        positive_remaining = max(0.0, self._docker_ping_cache_until - now)
        negative_remaining = max(0.0, self._docker_ping_negative_cache_until - now)
        negative_active = negative_remaining > 0
        return {
            "backend": "docker",
            "docker_ping": {
                "enabled": bool(settings.require_docker_ping_per_run),
                "positive_cache_active": positive_remaining > 0,
                "positive_cache_remaining_seconds": round(positive_remaining, 3),
                "negative_cache_active": negative_active,
                "negative_cache_remaining_seconds": round(negative_remaining, 3),
                "last_error": self._docker_ping_last_error if negative_active else "",
            },
        }

    def run(self, request: AgentTaskRequest) -> AgentTaskResult:
        command = self._resolve_command(request)
        run_id = request.payload.get("run_id")
        if not isinstance(run_id, int) or run_id < 0:
            return AgentTaskResult(
                ok=False,
                log="[agent] exception: invalid run_id for docker sandbox",
                output={"node_id": request.node_id, "exit_code": None, "error": "invalid run_id"},
            )
        try:
            task_workspace = str(self.workspace_service.get_task_sandbox_dir(run_id=run_id, node_id=request.node_id))
        except InvalidNodeIdError as exc:
            return self._handle_exception(request, exc)

        try:
            self._docker_ping()
        except Exception as exc:
            return self._handle_exception(request, exc)

        script_path = self._build_script(command)
        os.chmod(script_path, 0o755)
        container_name = f"devflow-run-{uuid.uuid4().hex[:12]}"

        process: subprocess.Popen[str] | None = None
        try:
            process = subprocess.Popen(
                self._build_docker_command(container_name, script_path, task_workspace),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                preexec_fn=os.setsid,
            )
            stdout, stderr = process.communicate(timeout=self.timeout_seconds)
        except subprocess.TimeoutExpired:
            if process is not None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                stdout, stderr = process.communicate()
            else:
                stdout, stderr = "", ""
            cleanup_error = self._force_remove_container(container_name)
            return self._handle_timeout(request, stdout, stderr, cleanup_error)
        except Exception as exc:
            return self._handle_exception(request, exc)
        finally:
            try:
                os.remove(script_path)
            except FileNotFoundError:
                pass

        assert process is not None
        return self._build_success_result(
            request=request,
            process_returncode=process.returncode,
            stdout=stdout,
            stderr=stderr,
        )


class AgentRunner:
    def __init__(
        self,
        timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
        backend: str | None = None,
        runner: ScriptRunner | None = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        selected_backend = (backend or settings.runner_backend).lower()
        if runner is not None:
            self.runner = runner
        elif selected_backend == "docker":
            self.runner = DockerRunner(timeout_seconds=timeout_seconds)
        elif selected_backend == "host":
            if not settings.enable_host_runner:
                raise RuntimeError(
                    "HostRunner is disabled. Set DEVFLOW_ENABLE_HOST_RUNNER=true for local-only development."
                )
            self.runner = HostRunner(timeout_seconds=timeout_seconds)
        else:
            raise RuntimeError(f"Unsupported runner backend: {selected_backend}")

    def health_snapshot(self) -> dict[str, object]:
        snapshot = getattr(self.runner, "health_snapshot", None)
        if callable(snapshot):
            return snapshot()
        return {"backend": "unknown"}

    def run(self, request: AgentTaskRequest) -> AgentTaskResult:
        return self.runner.run(request)
