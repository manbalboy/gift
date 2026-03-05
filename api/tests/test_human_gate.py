from datetime import datetime, timezone

from app.db.session import SessionLocal
from app.models.workflow import NodeRun, WorkflowDefinition, WorkflowRun
from app.services.human_gate_audit import scan_stale_human_gate_nodes
from freezegun import freeze_time


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
