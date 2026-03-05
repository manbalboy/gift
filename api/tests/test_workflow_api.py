import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import itertools
from pathlib import Path
import re
import time
import pytest

from app.api import workflows as workflows_api
from app.db.session import SessionLocal
from app.models.workflow import HumanGateDecisionAudit, NodeRun, WorkflowRun

from .conftest import client


PAYLOAD = {
    "name": "Level1 SDLC",
    "description": "아이디어부터 PR까지",
    "graph": {
        "nodes": [
            {"id": "idea", "type": "task", "label": "Idea"},
            {"id": "plan", "type": "task", "label": "Plan"},
            {"id": "code", "type": "task", "label": "Code"},
            {"id": "test", "type": "task", "label": "Test"},
            {"id": "pr", "type": "task", "label": "PR"},
        ],
        "edges": [
            {"id": "e1", "source": "idea", "target": "plan"},
            {"id": "e2", "source": "plan", "target": "code"},
            {"id": "e3", "source": "code", "target": "test"},
            {"id": "e4", "source": "test", "target": "pr"},
        ],
    },
}


@pytest.fixture(autouse=True)
def reset_stream_rate_limiter():
    workflows_api.reconnect_rate_limiter.reset_for_tests()
    yield
    workflows_api.reconnect_rate_limiter.reset_for_tests()


async def _instant_sleep(_seconds: float) -> None:
    return None


def test_workflow_create_and_get():
    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200

    workflow_id = created.json()["id"]
    fetched = client.get(f"/api/workflows/{workflow_id}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == PAYLOAD["name"]


def test_cors_allows_manbalboy_subdomain_with_31xx_port():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://ssh.manbalboy.com:3106",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://ssh.manbalboy.com:3106"


def test_cors_allows_manbalboy_subdomain_with_31xx_alt_port():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://ssh.manbalboy.com:3198",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://ssh.manbalboy.com:3198"


def test_cors_blocks_non_manbalboy_domain():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://evil-example.com:3100",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400


def test_cors_blocks_similar_lookalike_domain():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://amanbalboy.com:3101",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400


def test_cors_allows_manbalboy_without_port():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "https://manbalboy.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://manbalboy.com"


def test_cors_allows_localhost_31xx():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://localhost:3108",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3108"


def test_cors_blocks_manbalboy_unsupported_port():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://ssh.manbalboy.com:3200",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400


def test_cors_blocks_untrusted_origin_on_get_request():
    response = client.get(
        "/api/workflows",
        headers={"Origin": "http://evil-example.com:3100"},
    )
    assert response.status_code == 403


def test_workflow_create_rejects_empty_graph():
    payload = {"name": "Empty", "description": "", "graph": {"nodes": [], "edges": []}}
    response = client.post("/api/workflows", json=payload)
    assert response.status_code == 422


def test_workflow_create_rejects_cycle_graph():
    payload = {
        "name": "Cycle",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "a", "type": "task", "label": "A"},
                {"id": "b", "type": "task", "label": "B"},
            ],
            "edges": [
                {"id": "e1", "source": "a", "target": "b"},
                {"id": "e2", "source": "b", "target": "a"},
            ],
        },
    }
    response = client.post("/api/workflows", json=payload)
    assert response.status_code == 422


def test_workflow_create_rejects_multiple_nodes_without_edge():
    payload = {
        "name": "No Edge",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "plan", "type": "task", "label": "Plan"},
            ],
            "edges": [],
        },
    }
    response = client.post("/api/workflows", json=payload)
    assert response.status_code == 422


def test_workflow_run_rejects_unsafe_node_id_with_400():
    payload = {
        "name": "Unsafe Node",
        "description": "",
        "graph": {
            "nodes": [{"id": "../../etc/passwd", "type": "task", "label": "Bad"}],
            "edges": [],
        },
    }
    created = client.post("/api/workflows", json=payload)
    assert created.status_code == 200

    workflow_id = created.json()["id"]
    run = client.post(f"/api/workflows/{workflow_id}/runs")
    assert run.status_code == 400


def test_workflow_runs_stream_endpoint_returns_sse(monkeypatch):
    monkeypatch.setattr(workflows_api.asyncio, "sleep", _instant_sleep)
    monkeypatch.setattr(workflows_api.settings, "sse_heartbeat_interval_seconds", 1)
    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    response = client.get(f"/api/workflows/{workflow_id}/runs/stream?max_ticks=2")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert f'"workflow_id": {workflow_id}' in response.text
    assert "keepalive" in response.text


def test_workflow_runs_stream_replays_events_from_last_event_id(monkeypatch):
    monkeypatch.setattr(workflows_api.asyncio, "sleep", _instant_sleep)
    monkeypatch.setattr(workflows_api.settings, "sse_reconnect_limit_per_second", 100)
    workflows_api.workflow_stream_event_sequence.clear()
    workflows_api.workflow_stream_event_buffer.clear()
    workflows_api.reconnect_rate_limiter.reset_for_tests()

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    first = client.get(f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1")
    assert first.status_code == 200
    match = re.search(r"id:\s*(\d+)", first.text)
    assert match is not None
    first_event_id = int(match.group(1))
    assert first_event_id >= 1

    replay = client.get(
        f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1",
        headers={"Last-Event-ID": str(first_event_id - 1)},
    )
    assert replay.status_code == 200
    assert f"id: {first_event_id}" in replay.text
    assert "event: run_status" in replay.text


def test_workflow_runs_stream_disconnect_releases_connection(monkeypatch):
    monkeypatch.setattr(workflows_api.asyncio, "sleep", _instant_sleep)
    workflows_api.active_stream_connections = 0

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    with client.stream("GET", f"/api/workflows/{workflow_id}/runs/stream?max_ticks=5") as response:
        assert response.status_code == 200
        iterator = response.iter_lines()
        stream_lines: list[str] = []
        for _ in range(4):
            line = next(itertools.islice(iterator, 1))
            if isinstance(line, bytes):
                line = line.decode("utf-8")
            stream_lines.append(line)
        assert any("event: run_status" in line for line in stream_lines)

    assert workflows_api.active_stream_connections == 0


def test_workflow_runs_stream_rate_limit_returns_429(monkeypatch):
    monkeypatch.setattr(workflows_api.asyncio, "sleep", _instant_sleep)
    monkeypatch.setattr(workflows_api.settings, "sse_reconnect_limit_per_second", 1)

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    first = client.get(f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1")
    assert first.status_code == 200

    second = client.get(f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1")
    assert second.status_code == 429


def test_workflow_runs_stream_ignores_untrusted_forwarded_for(monkeypatch):
    monkeypatch.setattr(workflows_api.asyncio, "sleep", _instant_sleep)
    monkeypatch.setattr(workflows_api.settings, "sse_reconnect_limit_per_second", 1)
    monkeypatch.setattr(workflows_api.settings, "sse_rate_limit_window_seconds", 5)
    monkeypatch.setattr(workflows_api.settings, "sse_trusted_proxy_ips", "127.0.0.1,::1")
    workflows_api.reconnect_rate_limiter.reset_for_tests()

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    first = client.get(
        f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1",
        headers={"x-forwarded-for": "203.0.113.11"},
    )
    second = client.get(
        f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1",
        headers={"x-forwarded-for": "198.51.100.12"},
    )

    assert first.status_code == 200
    assert second.status_code == 429


def test_workflow_runs_stream_trusts_forwarded_for_from_trusted_proxy(monkeypatch):
    monkeypatch.setattr(workflows_api.asyncio, "sleep", _instant_sleep)
    monkeypatch.setattr(workflows_api.settings, "sse_reconnect_limit_per_second", 1)
    monkeypatch.setattr(workflows_api.settings, "sse_rate_limit_window_seconds", 5)
    monkeypatch.setattr(workflows_api.settings, "sse_trusted_proxy_ips", "testclient")
    workflows_api.reconnect_rate_limiter.reset_for_tests()

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    first = client.get(
        f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1",
        headers={"x-forwarded-for": "203.0.113.11"},
    )
    second = client.get(
        f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1",
        headers={"x-forwarded-for": "198.51.100.12"},
    )

    assert first.status_code == 200
    assert second.status_code == 200


def test_update_workflow_rejects_when_run_history_exists():
    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    run_response = client.post(f"/api/workflows/{workflow_id}/runs")
    assert run_response.status_code == 200

    updated = client.put(
        f"/api/workflows/{workflow_id}",
        json={
            **PAYLOAD,
            "name": "Updated Workflow",
        },
    )

    assert updated.status_code == 409
    assert updated.json()["detail"] == "workflow with existing runs cannot be modified"


def test_validate_workflow_graph_endpoint():
    response = client.post("/api/workflows/validate", json=PAYLOAD["graph"])
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is True
    assert body["node_count"] == len(PAYLOAD["graph"]["nodes"])
    assert body["edge_count"] == len(PAYLOAD["graph"]["edges"])


def test_human_gate_approve_requires_token(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
    payload = {
        "name": "Human Gate Flow",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "review", "type": "human_gate", "label": "Review"},
                {"id": "pr", "type": "task", "label": "PR"},
            ],
            "edges": [
                {"id": "e1", "source": "idea", "target": "review"},
                {"id": "e2", "source": "review", "target": "pr"},
            ],
        },
    }
    created = client.post("/api/workflows", json=payload)
    assert created.status_code == 200
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    for _ in range(20):
        current = client.get(f"/api/runs/{run_id}")
        assert current.status_code == 200
        if any(node["status"] == "approval_pending" for node in current.json()["node_runs"]):
            break
        time.sleep(0.1)

    missing = client.post(f"/api/runs/{run_id}/approve?node_id=review")
    assert missing.status_code == 401
    assert missing.json()["detail"] == "missing approver token"

    invalid = client.post(
        f"/api/runs/{run_id}/approve?node_id=review",
        headers={"X-Approver-Token": "wrong"},
    )
    assert invalid.status_code == 403
    assert invalid.json()["detail"] == "invalid approver token"

    missing_role = client.post(
        f"/api/runs/{run_id}/approve?node_id=review",
        headers={"X-Approver-Token": "secret-approver", "X-Workspace-Id": "main"},
    )
    assert missing_role.status_code == 403
    assert missing_role.json()["detail"] == "missing approver role"

    insufficient_role = client.post(
        f"/api/runs/{run_id}/approve?node_id=review",
        headers={
            "X-Approver-Token": "secret-approver",
            "X-Approver-Role": "developer",
            "X-Workspace-Id": "main",
        },
    )
    assert insufficient_role.status_code == 403
    assert insufficient_role.json()["detail"] == "insufficient approver role"

    missing_workspace = client.post(
        f"/api/runs/{run_id}/approve?node_id=review",
        headers={"X-Approver-Token": "secret-approver", "X-Approver-Role": "reviewer"},
    )
    assert missing_workspace.status_code == 403
    assert missing_workspace.json()["detail"] == "missing approver workspace"

    mismatch_workspace = client.post(
        f"/api/runs/{run_id}/approve?node_id=review",
        headers={
            "X-Approver-Token": "secret-approver",
            "X-Approver-Role": "reviewer",
            "X-Workspace-Id": "other",
        },
    )
    assert mismatch_workspace.status_code == 403
    assert mismatch_workspace.json()["detail"] == "insufficient approver workspace"


def test_human_gate_approve_after_long_pending_resumes_run(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
    payload = {
        "name": "Human Gate Resume",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "review", "type": "human_gate", "label": "Review"},
                {"id": "pr", "type": "task", "label": "PR"},
            ],
            "edges": [
                {"id": "e1", "source": "idea", "target": "review"},
                {"id": "e2", "source": "review", "target": "pr"},
            ],
        },
    }
    created = client.post("/api/workflows", json=payload)
    assert created.status_code == 200
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    pending = None
    for _ in range(25):
        response = client.get(f"/api/runs/{run_id}")
        assert response.status_code == 200
        if any(node["status"] == "approval_pending" for node in response.json()["node_runs"]):
            pending = response
            break
        time.sleep(0.1)
    assert pending is not None
    assert pending.json()["status"] == "waiting"

    approved = client.post(
        f"/api/runs/{run_id}/approve?node_id=review",
        headers={
            "X-Approver-Token": "secret-approver",
            "X-Approver-Role": "reviewer",
            "X-Workspace-Id": "main",
        },
    )
    assert approved.status_code == 200

    final = None
    for _ in range(25):
        response = client.get(f"/api/runs/{run_id}")
        assert response.status_code == 200
        if response.json()["status"] in {"done", "failed"}:
            final = response
            break
        time.sleep(0.1)
    assert final is not None
    assert final.json()["status"] == "done"
    review_node = next(node for node in final.json()["node_runs"] if node["node_id"] == "review")
    assert review_node["status"] == "done"
    assert "[human_gate] approved" in review_node["log"]


def test_human_gate_reject_marks_run_failed(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_workspaces", "main")
    payload = {
        "name": "Human Gate Reject",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "review", "type": "human_gate", "label": "Review"},
                {"id": "pr", "type": "task", "label": "PR"},
            ],
            "edges": [
                {"id": "e1", "source": "idea", "target": "review"},
                {"id": "e2", "source": "review", "target": "pr"},
            ],
        },
    }
    created = client.post("/api/workflows", json=payload, headers={"X-Workspace-Id": "main"})
    assert created.status_code == 200
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    pending = None
    for _ in range(25):
        response = client.get(f"/api/runs/{run_id}")
        if response.status_code == 200 and any(node["status"] == "approval_pending" for node in response.json()["node_runs"]):
            pending = response.json()
            break
        time.sleep(0.1)
    assert pending is not None

    rejected = client.post(
        f"/api/runs/{run_id}/reject?node_id=review",
        headers={
            "X-Approver-Token": "secret-approver",
            "X-Approver-Role": "reviewer",
            "X-Workspace-Id": "main",
        },
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "failed"
    review_node = next(node for node in rejected.json()["node_runs"] if node["node_id"] == "review")
    assert review_node["status"] == "failed"
    assert "[human_gate] rejected" in review_node["log"]


def test_human_gate_decision_creates_audit_log_and_can_be_listed(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_workspaces", "main")
    payload = {
        "name": "Human Gate Audit",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "review", "type": "human_gate", "label": "Review"},
                {"id": "pr", "type": "task", "label": "PR"},
            ],
            "edges": [
                {"id": "e1", "source": "idea", "target": "review"},
                {"id": "e2", "source": "review", "target": "pr"},
            ],
        },
    }
    created = client.post("/api/workflows", json=payload, headers={"X-Workspace-Id": "main"})
    assert created.status_code == 200
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    for _ in range(25):
        current = client.get(f"/api/runs/{run_id}")
        assert current.status_code == 200
        if any(node["status"] == "approval_pending" for node in current.json()["node_runs"]):
            break
        time.sleep(0.1)

    approved = client.post(
        f"/api/runs/{run_id}/approve?node_id=review",
        headers={
            "X-Approver-Token": "secret-approver",
            "X-Approver-Role": "reviewer",
            "X-Workspace-Id": "main",
        },
    )
    assert approved.status_code == 200

    audits = client.get(f"/api/runs/{run_id}/human-gate-audits")
    assert audits.status_code == 200
    body = audits.json()
    assert body["total_count"] >= 1
    assert body["limit"] == 20
    assert body["offset"] == 0
    latest = body["items"][0]
    assert latest["run_id"] == run_id
    assert latest["node_id"] == "review"
    assert latest["decision"] == "approved"
    assert latest["decided_by"] == "reviewer@main"
    assert latest["payload"]["workspace_id"] == "main"


def test_status_artifact_audits_can_be_listed_from_status_md():
    created = client.post("/api/workflows", json=PAYLOAD)
    workflow_id = created.json()["id"]
    run = client.post(f"/api/workflows/{workflow_id}/runs")
    run_id = run.json()["id"]

    artifact = (
        "# Human Gate Status Log\n\n"
        "## 2026-03-01T10:20:30+00:00 · approved\n"
        "- node_id: review\n"
        "- decided_by: reviewer@main\n"
        "- payload: {\"workspace_id\": \"main\", \"memo\": \"ok\"}\n\n"
        "## 2026-03-05T12:00:00+00:00 · rejected\n"
        "- node_id: review\n"
        "- decided_by: admin@main\n"
        "- payload: {\"workspace_id\": \"main\", \"memo\": \"retry\"}\n"
    )
    status_path = workflows_api.engine.workspace.root / "main" / "runs" / str(run_id) / "status.md"
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(artifact, encoding="utf-8")

    all_items = client.get(f"/api/runs/{run_id}/status-audits?limit=10")
    assert all_items.status_code == 200
    body = all_items.json()
    assert body["total_count"] == 2
    assert body["items"][0]["decision"] == "rejected"
    assert body["items"][1]["decision"] == "approved"

    filtered = client.get(f"/api/runs/{run_id}/status-audits?status=approved&date_range=30d")
    assert filtered.status_code == 200
    filtered_body = filtered.json()
    assert filtered_body["total_count"] == 1
    assert filtered_body["items"][0]["decision"] == "approved"


def test_status_artifact_audits_today_respects_timezone_offset(monkeypatch):
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            current = cls(2026, 3, 5, 12, 0, 0, tzinfo=timezone.utc)
            return current if tz is not None else current.replace(tzinfo=None)

    monkeypatch.setattr(workflows_api, "datetime", FrozenDateTime)
    created = client.post("/api/workflows", json=PAYLOAD)
    workflow_id = created.json()["id"]
    run = client.post(f"/api/workflows/{workflow_id}/runs")
    run_id = run.json()["id"]

    artifact = (
        "# Human Gate Status Log\n\n"
        "## 2026-03-05T11:30:00+00:00 · approved\n"
        "- node_id: review\n"
        "- decided_by: reviewer@main\n"
        "- payload: {\"workspace_id\": \"main\", \"tag\": \"inside\"}\n\n"
        "## 2026-03-04T22:30:00+00:00 · approved\n"
        "- node_id: review\n"
        "- decided_by: reviewer@main\n"
        "- payload: {\"workspace_id\": \"main\", \"tag\": \"outside\"}\n"
    )
    status_path = workflows_api.engine.workspace.root / "main" / "runs" / str(run_id) / "status.md"
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(artifact, encoding="utf-8")

    response = client.get(f"/api/runs/{run_id}/status-audits?status=approved&date_range=today&tz_offset_minutes=540")
    assert response.status_code == 200
    body = response.json()
    target_items = [item for item in body["items"] if item["payload"].get("tag") in {"inside", "outside"}]
    assert len(target_items) == 1
    assert target_items[0]["payload"]["tag"] == "inside"


def test_scan_stale_human_gate_alerts_returns_overdue_pending_nodes():
    payload = {
        "name": "Stale Human Gate",
        "description": "",
        "graph": {"nodes": [{"id": "review", "type": "human_gate", "label": "Review"}], "edges": []},
    }
    created = client.post("/api/workflows", json=payload)
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    run_id = run.json()["id"]

    for _ in range(20):
        current = client.get(f"/api/runs/{run_id}")
        node = current.json()["node_runs"][0]
        if node["status"] == "approval_pending":
            break
        time.sleep(0.1)

    db = SessionLocal()
    try:
        stale_point = datetime.now(timezone.utc) - timedelta(hours=30)
        node = db.query(NodeRun).filter(NodeRun.run_id == run_id, NodeRun.node_id == "review").first()
        workflow_run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
        assert node is not None
        assert workflow_run is not None
        node.updated_at = stale_point
        workflow_run.status = "waiting"
        db.commit()
    finally:
        db.close()

    scanned = client.post("/api/runs/human-gate-alerts/scan?stale_hours=24&limit=10")
    assert scanned.status_code == 200
    items = scanned.json()
    assert any(item["run_id"] == run_id and item["node_id"] == "review" for item in items)


def test_scan_stale_human_gate_alerts_returns_409_when_distributed_lock_is_busy(monkeypatch):
    class BusyLock:
        def acquire(self, blocking: bool = False, timeout: float | None = None) -> bool:
            return False

        def release(self) -> None:
            return None

        def extend(self, ttl_seconds: int | None = None) -> bool:
            return False

    class BusyProvider:
        def get_run_lock(self, _run_id: int) -> BusyLock:
            return BusyLock()

    monkeypatch.setattr(workflows_api, "stale_scan_lock_provider", BusyProvider())
    response = client.post("/api/runs/human-gate-alerts/scan?stale_hours=24&limit=10")
    assert response.status_code == 409
    assert "lock is busy" in response.json()["detail"]


def test_human_gate_approve_is_idempotent_for_same_decider(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_workspaces", "main")
    payload = {
        "name": "Human Gate Idempotent",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "review", "type": "human_gate", "label": "Review"},
            ],
            "edges": [{"id": "e1", "source": "idea", "target": "review"}],
        },
    }
    created = client.post("/api/workflows", json=payload, headers={"X-Workspace-Id": "main"})
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    run_id = run.json()["id"]

    for _ in range(30):
        current = client.get(f"/api/runs/{run_id}")
        if any(node["status"] == "approval_pending" for node in current.json()["node_runs"]):
            break
        time.sleep(0.1)

    headers = {
        "X-Approver-Token": "secret-approver",
        "X-Approver-Role": "reviewer",
        "X-Workspace-Id": "main",
    }
    first = client.post(f"/api/runs/{run_id}/approve?node_id=review", headers=headers)
    second = client.post(f"/api/runs/{run_id}/approve?node_id=review", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200


def test_human_gate_approve_concurrency_creates_single_audit(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_workspaces", "main")
    payload = {
        "name": "Human Gate Concurrency",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "review", "type": "human_gate", "label": "Review"},
            ],
            "edges": [{"id": "e1", "source": "idea", "target": "review"}],
        },
    }

    headers = {
        "X-Approver-Token": "secret-approver",
        "X-Approver-Role": "reviewer",
        "X-Workspace-Id": "main",
    }

    created = client.post("/api/workflows", json=payload, headers={"X-Workspace-Id": "main"})
    assert created.status_code == 200
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    for _ in range(30):
        current = client.get(f"/api/runs/{run_id}")
        assert current.status_code == 200
        if any(node["status"] == "approval_pending" for node in current.json()["node_runs"]):
            break
        time.sleep(0.05)

    def _approve_once() -> int:
        response = client.post(f"/api/runs/{run_id}/approve?node_id=review", headers=headers)
        return response.status_code

    with ThreadPoolExecutor(max_workers=10) as executor:
        status_codes = list(executor.map(lambda _: _approve_once(), range(10)))

    assert any(code == 200 for code in status_codes)
    assert all(code in {200, 409} for code in status_codes)

    db = SessionLocal()
    try:
        decision_count = (
            db.query(HumanGateDecisionAudit)
            .filter(
                HumanGateDecisionAudit.run_id == run_id,
                HumanGateDecisionAudit.node_id == "review",
                HumanGateDecisionAudit.decision == "approved",
                HumanGateDecisionAudit.decided_by == "reviewer@main",
            )
            .count()
        )
    finally:
        db.close()
    assert decision_count == 1


def test_nginx_sse_timeout_is_longer_than_backend_heartbeat():
    api_root = Path(__file__).resolve().parents[1]
    conf = (api_root / "scripts" / "nginx" / "default.conf").resolve()
    if not conf.exists():
        conf = (api_root / "scripts" / "nginx" / "sse_proxy.conf").resolve()
    assert conf.exists()

    content = conf.read_text(encoding="utf-8")
    match = re.search(r"proxy_read_timeout\s+(\d+)s\s*;", content)
    assert match is not None
    proxy_read_timeout_seconds = int(match.group(1))
    heartbeat = max(1, int(workflows_api.settings.sse_heartbeat_interval_seconds))
    assert proxy_read_timeout_seconds >= heartbeat * 6


def test_human_gate_audit_supports_pagination_and_filters():
    created = client.post("/api/workflows", json=PAYLOAD)
    workflow_id = created.json()["id"]
    run = client.post(f"/api/workflows/{workflow_id}/runs")
    run_id = run.json()["id"]

    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        for idx in range(25):
            db.add(
                HumanGateDecisionAudit(
                    run_id=run_id,
                    node_id="review",
                    decision="approved" if idx % 2 == 0 else "rejected",
                    decided_by="reviewer@main",
                    decided_at=now - timedelta(hours=idx),
                    payload={"idx": idx},
                )
            )
        db.commit()
    finally:
        db.close()

    paged = client.get(f"/api/runs/{run_id}/human-gate-audits?limit=10&offset=0")
    assert paged.status_code == 200
    body = paged.json()
    assert body["total_count"] >= 25
    assert body["limit"] == 10
    assert len(body["items"]) == 10

    filtered = client.get(f"/api/runs/{run_id}/human-gate-audits?limit=10&status=approved&date_range=24h")
    assert filtered.status_code == 200
    filtered_body = filtered.json()
    assert all(item["decision"] == "approved" for item in filtered_body["items"])


def test_human_gate_audit_filters_status_and_date_range_combo_precisely():
    created = client.post("/api/workflows", json=PAYLOAD)
    workflow_id = created.json()["id"]
    run = client.post(f"/api/workflows/{workflow_id}/runs")
    run_id = run.json()["id"]

    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.add(
            HumanGateDecisionAudit(
                run_id=run_id,
                node_id="review-a",
                decision="approved",
                decided_by="reviewer@main",
                decided_at=now - timedelta(hours=3),
                payload={"tag": "keep"},
            )
        )
        db.add(
            HumanGateDecisionAudit(
                run_id=run_id,
                node_id="review-b",
                decision="approved",
                decided_by="reviewer@main",
                decided_at=now - timedelta(days=8),
                payload={"tag": "old"},
            )
        )
        db.add(
            HumanGateDecisionAudit(
                run_id=run_id,
                node_id="review-c",
                decision="rejected",
                decided_by="reviewer@main",
                decided_at=now - timedelta(hours=2),
                payload={"tag": "wrong-status"},
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.get(f"/api/runs/{run_id}/human-gate-audits?status=approved&date_range=7d&limit=100")
    assert response.status_code == 200
    body = response.json()

    target_items = [item for item in body["items"] if item["payload"].get("tag") in {"keep", "old", "wrong-status"}]
    assert len(target_items) == 1
    assert target_items[0]["payload"]["tag"] == "keep"
    assert target_items[0]["decision"] == "approved"


def test_cancel_pending_approval_resets_node_to_queue(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_workspaces", "main")
    payload = {
        "name": "Human Gate Cancel Approval",
        "description": "",
        "graph": {"nodes": [{"id": "review", "type": "human_gate", "label": "Review"}], "edges": []},
    }
    created = client.post("/api/workflows", json=payload, headers={"X-Workspace-Id": "main"})
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    run_id = run.json()["id"]

    pending_node = None
    for _ in range(25):
        current = client.get(f"/api/runs/{run_id}")
        node = next((item for item in current.json()["node_runs"] if item["node_id"] == "review"), None)
        if node and node["status"] == "approval_pending":
            pending_node = node
            break
        time.sleep(0.1)
    assert pending_node is not None

    cancelled = client.post(
        f"/api/approvals/{pending_node['id']}/cancel",
        headers={
            "X-Approver-Token": "secret-approver",
            "X-Approver-Role": "reviewer",
            "X-Workspace-Id": "main",
        },
    )
    assert cancelled.status_code == 200
    refreshed_node = next(item for item in cancelled.json()["node_runs"] if item["node_id"] == "review")
    assert refreshed_node["status"] in {"queued", "approval_pending"}


def test_cancel_pending_approval_is_idempotent_for_same_decider(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_workspaces", "main")

    payload = {
        "name": "Human Gate Cancel Idempotent",
        "description": "",
        "graph": {"nodes": [{"id": "review", "type": "human_gate", "label": "Review"}], "edges": []},
    }
    created = client.post("/api/workflows", json=payload, headers={"X-Workspace-Id": "main"})
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    run_id = run.json()["id"]

    pending_node = None
    for _ in range(25):
        current = client.get(f"/api/runs/{run_id}")
        node = next((item for item in current.json()["node_runs"] if item["node_id"] == "review"), None)
        if node and node["status"] == "approval_pending":
            pending_node = node
            break
        time.sleep(0.1)
    assert pending_node is not None

    headers = {
        "X-Approver-Token": "secret-approver",
        "X-Approver-Role": "reviewer",
        "X-Workspace-Id": "main",
    }
    first = client.post(f"/api/approvals/{pending_node['id']}/cancel", headers=headers)
    second = client.post(f"/api/approvals/{pending_node['id']}/cancel", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    second_node = next(item for item in second.json()["node_runs"] if item["node_id"] == "review")
    assert second_node["status"] in {"queued", "approval_pending"}


def test_cancel_run_marks_run_and_non_terminal_nodes_cancelled():
    payload = {
        "name": "Cancelable Flow",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "review", "type": "human_gate", "label": "Review"},
                {"id": "pr", "type": "task", "label": "PR"},
            ],
            "edges": [{"id": "e1", "source": "review", "target": "pr"}],
        },
    }
    created = client.post("/api/workflows", json=payload)
    assert created.status_code == 200
    workflow_id = created.json()["id"]
    run = client.post(f"/api/workflows/{workflow_id}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    waiting = client.get(f"/api/runs/{run_id}")
    assert waiting.status_code == 200
    assert waiting.json()["status"] in {"waiting", "running", "queued"}

    cancelled = client.post(f"/api/runs/{run_id}/cancel")
    assert cancelled.status_code == 200
    body = cancelled.json()
    assert body["status"] == "cancelled"
    assert any(node["status"] == "cancelled" for node in body["node_runs"])

    latest = client.get(f"/api/runs/{run_id}")
    assert latest.status_code == 200
    assert latest.json()["status"] == "cancelled"


def test_artifact_chunk_endpoint_returns_partial_content():
    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]
    run = client.post(f"/api/workflows/{workflow_id}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    latest = None
    for _ in range(25):
        response = client.get(f"/api/runs/{run_id}")
        assert response.status_code == 200
        if response.json()["status"] == "done":
            latest = response
            break
        time.sleep(0.1)
    assert latest is not None

    first = client.get(f"/api/runs/{run_id}/artifacts/idea?offset=0&limit=24")
    assert first.status_code == 200
    body = first.json()
    assert body["run_id"] == run_id
    assert body["node_id"] == "idea"
    assert body["content"]
    assert body["next_offset"] > 0
    assert isinstance(body["has_more"], bool)


def test_stream_metrics_endpoint_returns_active_connections(monkeypatch):
    monkeypatch.setattr(workflows_api.asyncio, "sleep", _instant_sleep)
    workflows_api.active_stream_connections = 0

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    with client.stream("GET", f"/api/workflows/{workflow_id}/runs/stream?max_ticks=2") as response:
        assert response.status_code == 200
        metrics = client.get("/api/runs/stream-metrics/active-connections")
        assert metrics.status_code == 200
        assert isinstance(metrics.json()["active_stream_connections"], int)


def test_cancel_run_closes_active_workflow_stream(monkeypatch):
    real_async_sleep = asyncio.sleep

    async def _tiny_sleep(_seconds: float) -> None:
        await real_async_sleep(0.01)

    monkeypatch.setattr(workflows_api.asyncio, "sleep", _tiny_sleep)
    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]
    run = client.post(f"/api/workflows/{workflow_id}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    with client.stream("GET", f"/api/workflows/{workflow_id}/runs/stream?max_ticks=600") as response:
        assert response.status_code == 200
        iterator = response.iter_lines()
        first_lines: list[str] = []
        for _ in range(4):
            line = next(itertools.islice(iterator, 1))
            if isinstance(line, bytes):
                line = line.decode("utf-8")
            first_lines.append(line)
        assert any("event: run_status" in line for line in first_lines)

        cancelled = client.post(f"/api/runs/{run_id}/cancel")
        assert cancelled.status_code == 200

        lines = []
        for _ in range(20):
            try:
                line = next(iterator)
            except StopIteration:
                break
            if isinstance(line, bytes):
                line = line.decode("utf-8")
            lines.append(line)
            if "stream closed by workflow cancellation" in line:
                break

    end_detected = any(("event: end" in line) or ("stream closed by workflow cancellation" in line) for line in lines)
    active = None
    for _ in range(20):
        metrics = client.get("/api/runs/stream-metrics/active-connections")
        assert metrics.status_code == 200
        active = metrics.json()["active_stream_connections"]
        if active == 0:
            break
        time.sleep(0.05)

    assert end_detected or (active == 0)
