import asyncio
from datetime import datetime, timezone
import time

from app.api import workflows as workflows_api
from app.db.session import SessionLocal
from app.models.workflow import HumanGateDecisionAudit, NodeRun, WorkflowDefinition, WorkflowRun
from app.services.human_gate_audit import scan_stale_human_gate_nodes
from freezegun import freeze_time

from .conftest import client


def _seed_pending_runs() -> tuple[int, int]:
    db = SessionLocal()
    try:
        db.query(NodeRun).delete()
        db.query(WorkflowRun).delete()
        db.query(WorkflowDefinition).delete()
        db.commit()

        workflow = WorkflowDefinition(
            name="Human Gate Monitor",
            description="stale monitor test",
            graph={
                "nodes": [{"id": "review", "type": "human_gate", "label": "Review"}],
                "edges": [],
                "meta": {"workspace_id": "main"},
            },
        )
        db.add(workflow)
        db.commit()
        db.refresh(workflow)

        stale_run = WorkflowRun(
            workflow_id=workflow.id,
            status="waiting",
            started_at=datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc),
            updated_at=datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc),
        )
        fresh_run = WorkflowRun(
            workflow_id=workflow.id,
            status="waiting",
            started_at=datetime(2026, 3, 2, 9, 0, tzinfo=timezone.utc),
            updated_at=datetime(2026, 3, 2, 9, 0, tzinfo=timezone.utc),
        )
        db.add_all([stale_run, fresh_run])
        db.commit()
        db.refresh(stale_run)
        db.refresh(fresh_run)

        db.add_all(
            [
                NodeRun(
                    run_id=stale_run.id,
                    node_id="review",
                    node_name="Review",
                    status="approval_pending",
                    sequence=1,
                    log="pending",
                    updated_at=datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc),
                ),
                NodeRun(
                    run_id=fresh_run.id,
                    node_id="review",
                    node_name="Review",
                    status="approval_pending",
                    sequence=1,
                    log="pending",
                    updated_at=datetime(2026, 3, 2, 8, 30, tzinfo=timezone.utc),
                ),
            ]
        )
        db.commit()
        return stale_run.id, fresh_run.id
    finally:
        db.close()


@freeze_time("2026-03-02T09:00:00+00:00")
def test_scan_stale_human_gate_nodes_detects_only_over_24h_entries():
    stale_run_id, fresh_run_id = _seed_pending_runs()
    db = SessionLocal()
    try:
        alerts = scan_stale_human_gate_nodes(
            db,
            stale_hours=24,
            limit=10,
        )
    finally:
        db.close()

    run_ids = [item["run_id"] for item in alerts]
    assert stale_run_id in run_ids
    assert fresh_run_id not in run_ids
    target = next(item for item in alerts if item["run_id"] == stale_run_id)
    assert target["overdue_seconds"] >= 60 * 60 * 24


@freeze_time("2026-03-10T09:01:00+00:00")
def test_scan_stale_human_gate_nodes_respects_limit():
    _seed_pending_runs()
    db = SessionLocal()
    try:
        alerts = scan_stale_human_gate_nodes(
            db,
            stale_hours=1,
            limit=1,
        )
    finally:
        db.close()

    assert len(alerts) == 1
    assert alerts[0]["node_status"] == "approval_pending"


def test_human_gate_approve_10_async_requests_transitions_only_once(monkeypatch):
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
    monkeypatch.setattr(workflows_api.settings, "human_gate_approver_workspaces", "main")

    payload = {
        "name": "Human Gate Async 10",
        "description": "asyncio gather lock test",
        "graph": {
            "nodes": [
                {"id": "idea", "type": "task", "label": "Idea"},
                {"id": "review", "type": "human_gate", "label": "Review"},
            ],
            "edges": [{"id": "e1", "source": "idea", "target": "review"}],
        },
    }
    created = client.post("/api/workflows", json=payload, headers={"X-Workspace-Id": "main"})
    assert created.status_code == 200
    run = client.post(f"/api/workflows/{created.json()['id']}/runs")
    assert run.status_code == 200
    run_id = run.json()["id"]

    for _ in range(50):
        current = client.get(f"/api/runs/{run_id}")
        assert current.status_code == 200
        if any(node["status"] == "approval_pending" for node in current.json()["node_runs"]):
            break
        time.sleep(0.05)

    headers = {
        "X-Approver-Token": "secret-approver",
        "X-Approver-Role": "reviewer",
        "X-Workspace-Id": "main",
    }

    async def approve_once() -> int:
        response = await asyncio.to_thread(client.post, f"/api/runs/{run_id}/approve?node_id=review", headers=headers)
        return response.status_code

    async def run_concurrent_requests() -> list[int]:
        return await asyncio.gather(*[approve_once() for _ in range(10)])

    status_codes = asyncio.run(run_concurrent_requests())
    assert any(code == 200 for code in status_codes)
    assert all(code in {200, 409} for code in status_codes)

    db = SessionLocal()
    try:
        approved_count = (
            db.query(HumanGateDecisionAudit)
            .filter(
                HumanGateDecisionAudit.run_id == run_id,
                HumanGateDecisionAudit.node_id == "review",
                HumanGateDecisionAudit.decision == "approved",
            )
            .count()
        )
        node = (
            db.query(NodeRun)
            .filter(
                NodeRun.run_id == run_id,
                NodeRun.node_id == "review",
            )
            .first()
        )
    finally:
        db.close()

    assert approved_count == 1
    assert node is not None
    assert node.status == "done"
