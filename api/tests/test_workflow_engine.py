import os
import subprocess
import time
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.exc import OperationalError

from app.api.workflows import engine as workflow_engine
from app.db.session import SessionLocal
from app.models.workflow import NodeRun, WorkflowDefinition, WorkflowRun
from app.core.config import settings
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
    for _ in range(30):
        latest = client.get(f"/api/runs/{run_id}").json()
        if latest["status"] == "done":
            break
        time.sleep(0.1)

    assert latest is not None
    assert latest["status"] == "done"
    assert all(node["status"] == "done" for node in latest["node_runs"])
    assert all(node["artifact_path"] for node in latest["node_runs"])

    constellation = client.get(f"/api/runs/{run_id}/constellation")
    assert constellation.status_code == 200
    assert len(constellation.json()["nodes"]) > 0


def test_single_node_workflow_transitions_to_done_without_edges():
    payload = {
        "name": "Single Node",
        "description": "",
        "graph": {
            "nodes": [{"id": "idea", "type": "task", "label": "Idea"}],
            "edges": [],
        },
    }
    workflow = client.post("/api/workflows", json=payload).json()
    run = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    latest = None
    for _ in range(25):
        response = client.get(f"/api/runs/{run_id}")
        latest = response.json()
        if latest["status"] == "done":
            break
        time.sleep(0.1)

    assert latest is not None
    assert latest["status"] == "done"
    assert latest["node_runs"][0]["status"] == "done"


def test_engine_create_run_applies_default_linear_v1_fallback_for_legacy_graph():
    db = SessionLocal()
    try:
        workflow = WorkflowDefinition(name="Legacy Graph", description="", graph={})
        db.add(workflow)
        db.commit()
        db.refresh(workflow)

        run = workflow_engine.create_run(db, workflow)
        db.refresh(run)
        node_ids = [node.node_id for node in sorted(run.node_runs, key=lambda item: item.sequence)]

        assert node_ids == ["idea", "plan", "code", "test", "pr"]
        assert workflow.graph.get("meta", {}).get("graph_version") == "default_linear_v1"
    finally:
        db.close()


def test_parallel_polling_does_not_spawn_additional_execution(monkeypatch):
    calls = {"count": 0}
    target = {"run_id": None}

    def slow_runner(request):
        run_id = request.payload.get("run_id") if isinstance(request.payload, dict) else None
        if target["run_id"] is None and isinstance(run_id, int):
            target["run_id"] = run_id
        if run_id == target["run_id"]:
            calls["count"] += 1
            time.sleep(0.2)
        return AgentTaskResult(ok=True, log="ok", output={"exit_code": 0})

    class StubRunner:
        def run(self, request):
            return slow_runner(request)

    original_runner = workflow_engine.agent_runner
    monkeypatch.setattr(workflow_engine, "agent_runner", StubRunner())

    single_node_payload = {
        "name": "Single Polling Node",
        "description": "",
        "graph": {
            "nodes": [{"id": "idea", "type": "task", "label": "Idea"}],
            "edges": [],
        },
    }
    workflow = client.post("/api/workflows", json=single_node_payload).json()
    run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
    run_id = run["id"]

    try:
        with ThreadPoolExecutor(max_workers=6) as pool:
            responses = list(pool.map(lambda _: client.get(f"/api/runs/{run_id}"), range(6)))
        for _ in range(20):
            if calls["count"] >= 1:
                break
            time.sleep(0.05)
    finally:
        monkeypatch.setattr(workflow_engine, "agent_runner", original_runner)

    assert all(response.status_code == 200 for response in responses)
    assert calls["count"] == 1


def test_engine_uses_edges_for_transition_even_when_sequence_differs():
    payload = {
        "name": "Edge Priority",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "plan", "type": "task", "label": "Plan"},
                {"id": "code", "type": "task", "label": "Code"},
            ],
            "edges": [
                {"id": "e1", "source": "idea", "target": "code"},
                {"id": "e2", "source": "code", "target": "plan"},
            ],
        },
    }
    workflow = client.post("/api/workflows", json=payload).json()
    run = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    final = None
    for _ in range(30):
        response = client.get(f"/api/runs/{run_id}")
        assert response.status_code == 200
        body = response.json()
        if body["status"] == "done":
            final = body
            break
        time.sleep(0.1)

    assert final is not None
    nodes = sorted(final["node_runs"], key=lambda item: item["updated_at"])
    execution_order = [node["node_id"] for node in nodes]
    assert execution_order.index("code") < execution_order.index("plan")


def test_engine_rejects_disconnected_graph_with_validation_error():
    payload = {
        "name": "Disconnected Nodes",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "plan", "type": "task", "label": "Plan"},
                {"id": "docs", "type": "task", "label": "Docs"},
            ],
            "edges": [{"id": "e1", "source": "idea", "target": "plan"}],
        },
    }
    response = client.post("/api/workflows", json=payload)
    assert response.status_code == 422
    detail = response.json()["detail"]
    if isinstance(detail, str):
        message = detail
    else:
        message = " ".join(str(item.get("msg", item)) for item in detail)
    lowered = message.lower()
    assert "exactly one entry node" in lowered or "disconnected node(s)" in lowered


def test_engine_pauses_run_when_node_iteration_budget_exceeded(monkeypatch):
    monkeypatch.setattr(settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(settings, "workflow_node_iteration_budget", 2)

    payload = {
        "name": "Loop Budget",
        "description": "",
        "graph": {
            "nodes": [{"id": "review", "type": "human_gate", "label": "Review"}],
            "edges": [],
        },
    }
    created = client.post("/api/workflows", json=payload, headers={"X-Workspace-Id": "main"})
    assert created.status_code == 200
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    headers = {
        "X-Approver-Token": "secret-approver",
        "X-Approver-Role": "reviewer",
        "X-Workspace-Id": "main",
    }

    final = None
    for _ in range(60):
        response = client.get(f"/api/runs/{run_id}")
        assert response.status_code == 200
        body = response.json()
        if body["status"] == "paused":
            final = body
            break

        pending = next((node for node in body["node_runs"] if node["status"] == "approval_pending"), None)
        if pending is not None:
            cancel = client.post(f"/api/approvals/{pending['id']}/cancel", headers=headers)
            assert cancel.status_code in {200, 409}
        time.sleep(0.05)

    assert final is not None
    assert final["status"] == "paused"
    paused_nodes = [node for node in final["node_runs"] if node["status"] == "paused"]
    assert paused_nodes
    assert "iteration budget exceeded" in paused_nodes[0]["log"]


def test_engine_pauses_run_when_running_node_timeout_exceeded(monkeypatch):
    monkeypatch.setattr(settings, "workflow_node_timeout_seconds", 1.0)
    monkeypatch.setattr(settings, "workflow_worker_poll_interval_seconds", 0.02)

    payload = {
        "name": "Timeout Flow",
        "description": "",
        "graph": {
            "nodes": [{"id": "slow-task", "type": "task", "label": "Slow Task"}],
            "edges": [],
        },
    }
    workflow = client.post("/api/workflows", json=payload).json()

    class SlowRunner:
        def run(self, _request):
            time.sleep(1.2)
            return AgentTaskResult(ok=True, log="completed", output={"exit_code": 0})

    original_runner = workflow_engine.agent_runner
    monkeypatch.setattr(workflow_engine, "agent_runner", SlowRunner())
    try:
        run = client.post(f"/api/workflows/{workflow['id']}/runs")
        assert run.status_code == 200
        run_id = run.json()["id"]

        final = None
        for _ in range(80):
            response = client.get(f"/api/runs/{run_id}")
            assert response.status_code == 200
            body = response.json()
            if body["status"] == "paused":
                final = body
                break
            time.sleep(0.05)
    finally:
        monkeypatch.setattr(workflow_engine, "agent_runner", original_runner)

    assert final is not None
    assert final["status"] == "paused"
    paused_nodes = [node for node in final["node_runs"] if node["status"] == "paused"]
    assert paused_nodes
    assert "timeout exceeded" in paused_nodes[0]["log"]


def test_engine_timeout_override_prevents_global_timeout_pause(monkeypatch):
    monkeypatch.setattr(settings, "workflow_node_timeout_seconds", 1.0)
    monkeypatch.setattr(settings, "workflow_worker_poll_interval_seconds", 0.02)

    payload = {
        "name": "Timeout Override Flow",
        "description": "",
        "graph": {
            "nodes": [{"id": "slow-task", "type": "task", "label": "Slow Task", "timeout_override": 3.0}],
            "edges": [],
        },
    }
    workflow = client.post("/api/workflows", json=payload).json()

    class SlowRunner:
        def run(self, _request):
            time.sleep(1.2)
            return AgentTaskResult(ok=True, log="completed", output={"exit_code": 0})

    original_runner = workflow_engine.agent_runner
    monkeypatch.setattr(workflow_engine, "agent_runner", SlowRunner())
    try:
        run = client.post(f"/api/workflows/{workflow['id']}/runs")
        assert run.status_code == 200
        run_id = run.json()["id"]

        final = None
        for _ in range(80):
            response = client.get(f"/api/runs/{run_id}")
            assert response.status_code == 200
            body = response.json()
            if body["status"] in {"done", "failed", "paused"}:
                final = body
                if body["status"] == "done":
                    break
            time.sleep(0.05)
    finally:
        monkeypatch.setattr(workflow_engine, "agent_runner", original_runner)

    assert final is not None
    assert final["status"] == "done"


def test_engine_timeout_override_changes_outcome_vs_global_timeout(monkeypatch):
    monkeypatch.setattr(settings, "workflow_node_timeout_seconds", 1.0)
    monkeypatch.setattr(settings, "workflow_worker_poll_interval_seconds", 0.02)

    class SlowRunner:
        def run(self, _request):
            time.sleep(1.2)
            return AgentTaskResult(ok=True, log="completed", output={"exit_code": 0})

    def _run_and_wait(payload: dict) -> str:
        workflow = client.post("/api/workflows", json=payload).json()
        run = client.post(f"/api/workflows/{workflow['id']}/runs")
        assert run.status_code == 200
        run_id = run.json()["id"]

        terminal_status = ""
        for _ in range(80):
            response = client.get(f"/api/runs/{run_id}")
            assert response.status_code == 200
            status = response.json()["status"]
            if status in {"done", "failed", "paused", "cancelled"}:
                terminal_status = status
                break
            time.sleep(0.05)
        return terminal_status

    original_runner = workflow_engine.agent_runner
    monkeypatch.setattr(workflow_engine, "agent_runner", SlowRunner())
    try:
        base_payload = {
            "name": "Timeout Compare Base",
            "description": "",
            "graph": {
                "nodes": [{"id": "slow-task", "type": "task", "label": "Slow Task"}],
                "edges": [],
            },
        }
        override_payload = {
            "name": "Timeout Compare Override",
            "description": "",
            "graph": {
                "nodes": [
                    {
                        "id": "slow-task",
                        "type": "task",
                        "label": "Slow Task",
                        "timeout_override": 3.0,
                    }
                ],
                "edges": [],
            },
        }
        base_status = _run_and_wait(base_payload)
        override_status = _run_and_wait(override_payload)
    finally:
        monkeypatch.setattr(workflow_engine, "agent_runner", original_runner)

    assert base_status == "paused"
    assert override_status == "done"


def test_engine_retries_failed_node_with_backoff(monkeypatch):
    payload = {
        "name": "Retry Flow",
        "description": "",
        "graph": {
            "nodes": [{"id": "retry-node", "type": "task", "label": "Retry Node"}],
            "edges": [],
        },
    }
    workflow = client.post("/api/workflows", json=payload).json()

    attempts = {"count": 0}

    class FlakyRunner:
        def run(self, request):
            if request.node_id != "retry-node":
                return AgentTaskResult(ok=True, log="ok", output={"exit_code": 0})
            attempts["count"] += 1
            if attempts["count"] < 3:
                return AgentTaskResult(ok=False, log=f"failed-{attempts['count']}", output={"exit_code": 1})
            return AgentTaskResult(ok=True, log="recovered", output={"exit_code": 0})

    original_runner = workflow_engine.agent_runner
    monkeypatch.setattr(workflow_engine, "agent_runner", FlakyRunner())
    monkeypatch.setattr(settings, "workflow_node_max_retries", 3)
    monkeypatch.setattr(settings, "workflow_retry_backoff_seconds", 0.01)

    try:
        run = client.post(f"/api/workflows/{workflow['id']}/runs")
        assert run.status_code == 200
        run_id = run.json()["id"]

        final = None
        for _ in range(40):
            response = client.get(f"/api/runs/{run_id}")
            assert response.status_code == 200
            body = response.json()
            if body["status"] in {"done", "failed"}:
                final = body
                break
            time.sleep(0.1)
    finally:
        monkeypatch.setattr(workflow_engine, "agent_runner", original_runner)

    assert final is not None
    assert final["status"] == "done"
    assert attempts["count"] >= 3
    first_node = sorted(final["node_runs"], key=lambda item: item["sequence"])[0]
    assert "failed-1" in first_node["log"]
    assert "recovered" in first_node["log"]


def test_engine_marks_run_failed_when_agent_runner_raises_unexpected_error(monkeypatch):
    payload = {
        "name": "Crash Safety Flow",
        "description": "",
        "graph": {
            "nodes": [{"id": "crash-node", "type": "task", "label": "Crash Node"}],
            "edges": [],
        },
    }
    workflow = client.post("/api/workflows", json=payload).json()

    class CrashRunner:
        def run(self, _request):
            raise RuntimeError("runner crashed unexpectedly")

    original_runner = workflow_engine.agent_runner
    monkeypatch.setattr(workflow_engine, "agent_runner", CrashRunner())

    try:
        run = client.post(f"/api/workflows/{workflow['id']}/runs")
        assert run.status_code == 200
        run_id = run.json()["id"]

        final = None
        for _ in range(40):
            response = client.get(f"/api/runs/{run_id}")
            assert response.status_code == 200
            body = response.json()
            if body["status"] in {"done", "failed"}:
                final = body
                break
            time.sleep(0.1)
    finally:
        monkeypatch.setattr(workflow_engine, "agent_runner", original_runner)

    assert final is not None
    assert final["status"] == "failed"
    failed_nodes = [node for node in final["node_runs"] if node["status"] == "failed"]
    assert failed_nodes
    assert "runner crashed unexpectedly" in failed_nodes[0]["log"]


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


def test_host_runner_requires_explicit_enable(monkeypatch):
    monkeypatch.setattr(settings, "enable_host_runner", False)
    try:
        AgentRunner(timeout_seconds=1, backend="host")
    except RuntimeError as exc:
        assert "HostRunner is disabled" in str(exc)
    else:
        raise AssertionError("host runner should be blocked when explicit flag is off")


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
    monkeypatch.setattr(runner, "_docker_ping", lambda: None)
    result = runner.run(
        AgentTaskRequest(
            node_id="plan",
            node_name="Plan",
            payload={"command": "echo hello-from-docker", "run_id": 7},
        )
    )

    assert result.ok is True
    assert captured["args"] is not None
    assert "bash:5.2" in captured["args"]
    mount_arg = captured["args"][captured["args"].index("-v") + 3]
    assert mount_arg.endswith(":/workspace/workspaces:rw")
    assert "/sandbox/plan" in mount_arg


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
    monkeypatch.setattr(runner, "_docker_ping", lambda: None)
    result = runner.run(
        AgentTaskRequest(
            node_id="test",
            node_name="Test",
            payload={"command": "while true; do :; done", "run_id": 8},
        )
    )

    assert result.ok is False
    assert result.output.get("timeout") is True
    assert removed["called"] is True


def test_docker_runner_requires_valid_run_id(tmp_path):
    runner = DockerRunner(timeout_seconds=1, image="bash:5.2", workspaces_root=str(tmp_path))
    result = runner.run(
        AgentTaskRequest(
            node_id="test",
            node_name="Test",
            payload={"command": "echo blocked"},
        )
    )

    assert result.ok is False
    assert result.output.get("error") == "invalid run_id"


def test_docker_runner_returns_error_when_daemon_is_unavailable(monkeypatch, tmp_path):
    runner = DockerRunner(timeout_seconds=1, image="bash:5.2", workspaces_root=str(tmp_path))
    monkeypatch.setattr(runner, "_docker_ping", lambda: (_ for _ in ()).throw(RuntimeError("daemon down")))

    result = runner.run(
        AgentTaskRequest(
            node_id="test",
            node_name="Test",
            payload={"command": "echo blocked", "run_id": 9},
        )
    )

    assert result.ok is False
    assert "daemon down" in result.log


def test_background_worker_passes_node_command_to_agent_runner(monkeypatch):
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
        workflow = client.post("/api/workflows", json=payload).json()
        run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
        run_id = run["id"]

        response = None
        for _ in range(20):
            response = client.get(f"/api/runs/{run_id}")
            if captured["command"]:
                break
            time.sleep(0.1)
    finally:
        monkeypatch.setattr(workflow_engine, "agent_runner", original_runner)

    assert response is not None
    assert response.status_code == 200
    assert captured["command"] == "echo custom-idea"


def test_compensation_recovers_stale_running_nodes():
    db = SessionLocal()
    try:
        workflow = WorkflowDefinition(name="Compensation", description="", graph=PAYLOAD["graph"])
        db.add(workflow)
        db.flush()

        workflow_run = WorkflowRun(workflow_id=workflow.id, status="running")
        db.add(workflow_run)
        db.flush()

        first_node = NodeRun(
            run_id=workflow_run.id,
            node_id="idea",
            node_name="Idea",
            sequence=0,
            status="running",
            log="실행 중",
        )
        db.add(first_node)
        workflow_run.updated_at = datetime.now(timezone.utc) - timedelta(minutes=10)
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
    db = SessionLocal()
    try:
        workflow = WorkflowDefinition(name="Compensation Scope", description="", graph=PAYLOAD["graph"])
        db.add(workflow)
        db.flush()

        workflow_run = WorkflowRun(workflow_id=workflow.id, status="running")
        db.add(workflow_run)
        db.flush()

        nodes = [
            NodeRun(run_id=workflow_run.id, node_id="idea", node_name="Idea", sequence=0, status="running", log="실행 중"),
            NodeRun(run_id=workflow_run.id, node_id="plan", node_name="Plan", sequence=1, status="running", log="실행 중"),
        ]
        for node in nodes:
            db.add(node)

        workflow_run.updated_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        for node in nodes:
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
        refreshed = db.query(NodeRun).filter(NodeRun.run_id == workflow_run.id).all()
        failed_count = len([node for node in refreshed if node.status == "failed"])
        assert failed_count == 1
    finally:
        db.close()


def test_compensation_skips_recent_running_nodes():
    db = SessionLocal()
    try:
        workflow = WorkflowDefinition(name="Compensation Recent", description="", graph=PAYLOAD["graph"])
        db.add(workflow)
        db.flush()

        workflow_run = WorkflowRun(workflow_id=workflow.id, status="running")
        db.add(workflow_run)
        db.flush()

        node = NodeRun(
            run_id=workflow_run.id,
            node_id="idea",
            node_name="Idea",
            sequence=0,
            status="running",
            log="실행 중",
        )
        db.add(node)
        workflow_run.updated_at = datetime.now(timezone.utc)
        node.updated_at = datetime.now(timezone.utc)
        db.commit()

        recovered = workflow_engine.recover_stuck_runs(db, stale_after_seconds=30)
        assert recovered == 0

        db.refresh(workflow_run)
        db.refresh(node)
        assert workflow_run.status == "running"
        assert node.status == "running"
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
