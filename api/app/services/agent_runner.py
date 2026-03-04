import subprocess

from app.schemas.agent import AgentTaskRequest, AgentTaskResult


DEFAULT_TIMEOUT_SECONDS = 300


class AgentRunner:
    def __init__(self, timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> None:
        self.timeout_seconds = timeout_seconds

    def run(self, request: AgentTaskRequest) -> AgentTaskResult:
        command = request.payload.get("command")
        if not command:
            run_id = request.payload.get("run_id", "unknown")
            command = f'echo "[agent] run_id={run_id} node={request.node_id} name={request.node_name}"'

        try:
            completed = subprocess.run(
                ["bash", "-lc", command],
                capture_output=True,
                text=True,
                check=False,
                timeout=self.timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            return AgentTaskResult(
                ok=False,
                log=f"[agent] timeout({self.timeout_seconds}s): {request.node_name}",
                output={"node_id": request.node_id, "exit_code": None, "timeout": True},
            )
        except Exception as exc:  # pragma: no cover
            return AgentTaskResult(
                ok=False,
                log=f"[agent] exception: {exc}",
                output={"node_id": request.node_id, "exit_code": None, "error": str(exc)},
            )

        stdout = (completed.stdout or "").strip()
        stderr = (completed.stderr or "").strip()
        log_parts = [p for p in [stdout, stderr] if p]
        log = "\n".join(log_parts) if log_parts else f"[agent] exit code: {completed.returncode}"
        ok = completed.returncode == 0
        return AgentTaskResult(
            ok=ok,
            log=log,
            output={"node_id": request.node_id, "exit_code": completed.returncode},
        )
