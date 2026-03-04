import os
import signal
import subprocess
import tempfile

from app.schemas.agent import AgentTaskRequest, AgentTaskResult


DEFAULT_TIMEOUT_SECONDS = 300


class AgentRunner:
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

    def run(self, request: AgentTaskRequest) -> AgentTaskResult:
        command = request.payload.get("command")
        if not command:
            run_id = request.payload.get("run_id", "unknown")
            command = f'echo "[agent] run_id={run_id} node={request.node_id} name={request.node_name}"'

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

            timeout_log = f"[agent] timeout({self.timeout_seconds}s): {request.node_name}"
            extra = "\n".join(part for part in [(stdout or "").strip(), (stderr or "").strip()] if part)
            return AgentTaskResult(
                ok=False,
                log=f"{timeout_log}\n{extra}".strip(),
                output={"node_id": request.node_id, "exit_code": None, "timeout": True},
            )
        except Exception as exc:  # pragma: no cover
            return AgentTaskResult(
                ok=False,
                log=f"[agent] exception: {exc}",
                output={"node_id": request.node_id, "exit_code": None, "error": str(exc)},
            )
        finally:
            try:
                os.remove(script_path)
            except FileNotFoundError:
                pass

        assert process is not None
        stdout = (stdout or "").strip()
        stderr = (stderr or "").strip()
        log_parts = [p for p in [stdout, stderr] if p]
        log = "\n".join(log_parts) if log_parts else f"[agent] exit code: {process.returncode}"
        ok = process.returncode == 0
        return AgentTaskResult(
            ok=ok,
            log=log,
            output={"node_id": request.node_id, "exit_code": process.returncode},
        )
