import os
import subprocess
import time
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.exc import OperationalError

from app.api.workflows import engine as workflow_engine
from app.db.session import SessionLocal
from app.models.workflow import NodeRun, WorkflowRun
from app.schemas.agent import AgentTaskRequest, AgentTaskResult
from app.services.agent_runner import AgentRunner, DockerRunner
from app.services.lock_provider import LockProviderFactory, RedisLockProvider

from .conftest import client
from .test_workflow_api import PAYLOAD


def test_run_status_progression():
    workflow = client.post("/api/workflows", json=PAYLOAD).json()
    run = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert run.status_code == 200

    run_id = run.json()["id"]
    latest = None
    for _ in range(10):
        latest = client.get(f"/api/runs/{run_id}").json()
        if latest["status"] == "done":
            break

    assert latest is not None
    assert latest["status"] == "done"
    assert all(node["status"] == "done" for node in latest["node_runs"])
    assert all(node["artifact_path"] for node in latest["node_runs"])

    constellation = client.get(f"/api/runs/{run_id}/constellation")
    assert constellation.status_code == 200
    assert len(constellation.json()["nodes"]) > 0


def test_parallel_polling_triggers_single_worker(monkeypatch):
    workflow = client.post("/api/workflows", json=PAYLOAD).json()
    run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
    run_id = run["id"]

    calls = {"count": 0}

    original_runner = workflow_engine.agent_runner

    def slow_runner(request):
        calls["count"] += 1
        time.sleep(0.2)
        return original_runner.run(request)

    class StubRunner:
        def run(self, request):
            return slow_runner(request)

    monkeypatch.setattr(workflow_engine, "agent_runner", StubRunner())

    try:
        with ThreadPoolExecutor(max_workers=6) as pool:
            responses = list(pool.map(lambda _: client.get(f"/api/runs/{run_id}"), range(6)))
    finally:
        monkeypatch.setattr(workflow_engine, "agent_runner", original_runner)

    assert all(response.status_code == 200 for response in responses)
    assert calls["count"] == 1


def test_agent_runner_timeout_kills_process_group(tmp_path):
    marker = tmp_path / "should_not_exist.txt"
    command = f"(sleep 2; echo leaked > '{marker}') & while true; do :; done"

    runner = AgentRunner(timeout_seconds=1)
    result = runner.run(
        AgentTaskRequest(
            node_id="code",
            node_name="Code",
            payload={"command": command},
        )
    )

    time.sleep(2.3)
    assert result.ok is False
    assert result.output.get("timeout") is True
    assert "timeout(1s)" in result.log
    assert not marker.exists()


def test_agent_runner_runs_script_file_and_cleans_up(monkeypatch):
    captured = {"args": None, "script": None}

    class StubProcess:
        pid = 123
        returncode = 0

        def communicate(self, timeout=None):
            return ("ok", "")

    def fake_popen(args, stdout, stderr, text, preexec_fn):
        captured["args"] = args
        captured["script"] = args[1]
        assert args[0] == "bash"
        assert os.path.exists(args[1])
        return StubProcess()

    monkeypatch.setattr("subprocess.Popen", fake_popen)

    runner = AgentRunner(timeout_seconds=1)
    result = runner.run(
        AgentTaskRequest(
            node_id="plan",
            node_name="Plan",
            payload={"command": "echo hello"},
        )
    )

    assert result.ok is True
    assert captured["args"] is not None
    assert captured["script"] is not None
    assert not os.path.exists(captured["script"])


def test_agent_runner_handles_system_exception(monkeypatch):
    def raise_permission_error(*_args, **_kwargs):
        raise PermissionError("permission denied")

    monkeypatch.setattr("subprocess.Popen", raise_permission_error)

    runner = AgentRunner(timeout_seconds=1)
    result = runner.run(
        AgentTaskRequest(
            node_id="plan",
            node_name="Plan",
            payload={"command": "echo hello"},
        )
    )

    assert result.ok is False
    assert "permission denied" in result.log
    assert result.output.get("error") == "permission denied"


def test_docker_runner_builds_sandboxed_docker_command(monkeypatch, tmp_path):
    captured = {"args": None}

    class StubProcess:
        pid = 123
        returncode = 0

        def communicate(self, timeout=None):
            return ("sandbox ok", "")

    def fake_popen(args, stdout, stderr, text, preexec_fn):
        captured["args"] = args
        assert args[0:2] == ["docker", "run"]
        assert "--network" in args and args[args.index("--network") + 1] == "none"
        assert "--cap-drop" in args and args[args.index("--cap-drop") + 1] == "ALL"
        assert "--security-opt" in args and args[args.index("--security-opt") + 1] == "no-new-privileges"
        return StubProcess()

    monkeypatch.setattr("subprocess.Popen", fake_popen)

    runner = DockerRunner(timeout_seconds=1, image="bash:5.2", workspaces_root=str(tmp_path))
    result = runner.run(
        AgentTaskRequest(
            node_id="plan",
            node_name="Plan",
            payload={"command": "echo hello-from-docker"},
        )
    )

    assert result.ok is True
    assert captured["args"] is not None
    assert "bash:5.2" in captured["args"]


def test_docker_runner_timeout_force_cleans_container(monkeypatch, tmp_path):
    removed = {"called": False}

    class TimeoutProcess:
        pid = 777
        returncode = 124

        def communicate(self, timeout=None):
            if timeout is not None:
                raise subprocess.TimeoutExpired(cmd="docker run", timeout=timeout)
            return ("", "still running")

    class CleanupResult:
        returncode = 0
        stdout = "removed"
        stderr = ""

    def fake_popen(*_args, **_kwargs):
        return TimeoutProcess()

    def fake_run(args, stdout, stderr, text, check):
        assert args[0:3] == ["docker", "rm", "-f"]
        removed["called"] = True
        return CleanupResult()

    monkeypatch.setattr("subprocess.Popen", fake_popen)
    monkeypatch.setattr("subprocess.run", fake_run)
    monkeypatch.setattr("os.killpg", lambda *_args, **_kwargs: None)

    runner = DockerRunner(timeout_seconds=1, image="bash:5.2", workspaces_root=str(tmp_path))
    result = runner.run(
        AgentTaskRequest(
            node_id="test",
            node_name="Test",
            payload={"command": "while true; do :; done"},
        )
    )

    assert result.ok is False
    assert result.output.get("timeout") is True
    assert removed["called"] is True


def test_refresh_run_passes_node_command_to_agent_runner(monkeypatch):
    payload = {
        **PAYLOAD,
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea", "command": "echo custom-idea"},
                {"id": "plan", "type": "task", "label": "Plan"},
            ],
            "edges": [{"id": "e1", "source": "idea", "target": "plan"}],
        },
    }
    workflow = client.post("/api/workflows", json=payload).json()
    run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
    run_id = run["id"]

    captured = {"command": None}
    original_runner = workflow_engine.agent_runner

    class StubRunner:
        def run(self, request):
            captured["command"] = request.payload.get("command")
            return AgentTaskResult(
                ok=True,
                log="ok",
                output={"node_id": request.node_id, "exit_code": 0},
            )

    monkeypatch.setattr(workflow_engine, "agent_runner", StubRunner())
    try:
        response = client.get(f"/api/runs/{run_id}")
    finally:
        monkeypatch.setattr(workflow_engine, "agent_runner", original_runner)

    assert response.status_code == 200
    assert captured["command"] == "echo custom-idea"


def test_compensation_recovers_stale_running_nodes():
    workflow = client.post("/api/workflows", json=PAYLOAD).json()
    run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
    run_id = run["id"]

    db = SessionLocal()
    try:
        workflow_run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
        assert workflow_run is not None
        workflow_run.status = "running"
        workflow_run.updated_at = datetime.now(timezone.utc) - timedelta(minutes=10)

        first_node = (
            db.query(NodeRun)
            .filter(NodeRun.run_id == run_id)
            .order_by(NodeRun.sequence.asc())
            .first()
        )
        assert first_node is not None
        first_node.status = "running"
        first_node.log = "실행 중"
        first_node.updated_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db.commit()

        recovered = workflow_engine.recover_stuck_runs(db, stale_after_seconds=30)
        assert recovered == 1

        db.refresh(workflow_run)
        db.refresh(first_node)
        assert workflow_run.status == "failed"
        assert first_node.status == "failed"
        assert "[compensation]" in first_node.log
    finally:
        db.close()


def test_compensation_commit_scope_isolated_per_node(monkeypatch):
    workflow = client.post("/api/workflows", json=PAYLOAD).json()
    run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
    run_id = run["id"]

    db = SessionLocal()
    try:
        workflow_run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
        assert workflow_run is not None
        workflow_run.status = "running"
        workflow_run.updated_at = datetime.now(timezone.utc) - timedelta(minutes=10)

        nodes = (
            db.query(NodeRun)
            .filter(NodeRun.run_id == run_id)
            .order_by(NodeRun.sequence.asc())
            .limit(2)
            .all()
        )
        assert len(nodes) == 2
        for node in nodes:
            node.status = "running"
            node.log = "실행 중"
            node.updated_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        db.commit()

        original_commit = db.commit
        commit_count = {"value": 0}

        def flaky_commit():
            if commit_count["value"] == 0:
                commit_count["value"] += 1
                raise OperationalError("COMMIT", {}, Exception("simulated commit failure"))
            commit_count["value"] += 1
            return original_commit()

        monkeypatch.setattr(db, "commit", flaky_commit)
        recovered = workflow_engine.recover_stuck_runs(db, stale_after_seconds=30)

        assert recovered == 1
        refreshed = db.query(NodeRun).filter(NodeRun.run_id == run_id).all()
        failed_count = len([node for node in refreshed if node.status == "failed"])
        assert failed_count == 1
    finally:
        db.close()


def test_refresh_run_rolls_back_on_db_lock_timeout(monkeypatch):
    workflow = client.post("/api/workflows", json=PAYLOAD).json()
    run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
    run_id = run["id"]

    db = SessionLocal()
    try:
        workflow_run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
        assert workflow_run is not None

        def raise_timeout(*_args, **_kwargs):
            raise OperationalError("SELECT ... FOR UPDATE", {}, Exception("lock timeout"))

        monkeypatch.setattr(workflow_engine, "_load_locked_run", raise_timeout)

        recovered = workflow_engine.refresh_run(db, workflow_run)
        assert recovered is not None
        assert recovered.id == run_id
        # rollback 이후 세션이 정상 재사용 가능해야 한다.
        assert db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first() is not None
    finally:
        db.close()


class FakeRedisClient:
    def __init__(self) -> None:
        self.values: dict[str, tuple[str, float]] = {}
        self.raise_on_set = False

    def _cleanup(self, key: str) -> None:
        value = self.values.get(key)
        if not value:
            return
        _, expires_at = value
        if time.monotonic() >= expires_at:
            del self.values[key]

    def set(self, key: str, value: str, nx: bool, ex: int):
        if self.raise_on_set:
            from app.services.lock_provider import RedisError

            raise RedisError("redis unavailable")
        self._cleanup(key)
        if nx and key in self.values:
            return False
        self.values[key] = (value, time.monotonic() + ex)
        return True

    def eval(self, script: str, _key_count: int, key: str, token: str, ttl: int | None = None):
        self._cleanup(key)
        current = self.values.get(key)
        if current is None:
            return 0
        stored_token, _expires_at = current
        if stored_token != token:
            return 0
        if "DEL" in script:
            del self.values[key]
            return 1
        if "EXPIRE" in script:
            assert ttl is not None
            self.values[key] = (stored_token, time.monotonic() + int(ttl))
            return 1
        return 0


def test_redis_lock_ttl_expiration_recovery():
    provider = RedisLockProvider.__new__(RedisLockProvider)
    provider.client = FakeRedisClient()
    provider.ttl_seconds = 1
    provider.key_prefix = "devflow:run-lock"
    provider.fallback = LockProviderFactory.create("local")

    lock1 = provider.get_run_lock(99)
    assert lock1.acquire(blocking=False) is True
    time.sleep(1.1)
    lock2 = provider.get_run_lock(99)
    assert lock2.acquire(blocking=False) is True
    lock2.release()


def test_redis_lock_provider_fallbacks_to_local_on_connection_error():
    provider = RedisLockProvider.__new__(RedisLockProvider)
    fake = FakeRedisClient()
    fake.raise_on_set = True
    provider.client = fake
    provider.ttl_seconds = 30
    provider.key_prefix = "devflow:run-lock"
    provider.fallback = LockProviderFactory.create("local")

    lock = provider.get_run_lock(42)
    assert lock.acquire(blocking=False) is True
    assert lock.extend() is True
    lock.release()
