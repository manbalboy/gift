import os
import time
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.exc import OperationalError

from app.api.workflows import engine as workflow_engine
from app.db.session import SessionLocal
from app.models.workflow import NodeRun, WorkflowRun
from app.schemas.agent import AgentTaskRequest
from app.services.agent_runner import AgentRunner

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
