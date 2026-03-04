import os
import signal
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Protocol

from app.core.config import settings
from app.schemas.agent import AgentTaskRequest, AgentTaskResult


DEFAULT_TIMEOUT_SECONDS = 300


class ScriptRunner(Protocol):
    def run(self, request: AgentTaskRequest) -> AgentTaskResult:
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

    def _build_docker_command(self, container_name: str, script_path: str) -> list[str]:
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
            f"{self.workspaces_root}:/workspace/workspaces:rw",
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

    def run(self, request: AgentTaskRequest) -> AgentTaskResult:
        command = self._resolve_command(request)
        script_path = self._build_script(command)
        os.chmod(script_path, 0o700)
        container_name = f"devflow-run-{uuid.uuid4().hex[:12]}"

        process: subprocess.Popen[str] | None = None
        try:
            process = subprocess.Popen(
                self._build_docker_command(container_name, script_path),
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
        else:
            self.runner = HostRunner(timeout_seconds=timeout_seconds)

    def run(self, request: AgentTaskRequest) -> AgentTaskResult:
        return self.runner.run(request)
