import time
from datetime import datetime, timedelta, timezone

from app.api.workflows import engine as workflow_engine
from app.db.session import SessionLocal
from app.models.workflow import NodeRun, WorkflowDefinition, WorkflowRun


def _now_minus(minutes: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(minutes=minutes)


def test_dlq_compensation_stress_and_health_visibility():
    db = SessionLocal()
    try:
        workflow = WorkflowDefinition(
            name="DLQ Stress",
            description="",
            graph={"nodes": [{"id": "idea", "type": "task", "label": "Idea"}], "edges": []},
        )
        db.add(workflow)
        db.flush()

        stale_count = 25
        for index in range(stale_count):
            run = WorkflowRun(workflow_id=workflow.id, status="running")
            run.updated_at = _now_minus(10)
            db.add(run)
            db.flush()

            node = NodeRun(
                run_id=run.id,
                node_id=f"idea-{index}",
                node_name="Idea",
                sequence=0,
                status="running",
                log="실행 중",
            )
            node.updated_at = _now_minus(10)
            db.add(node)
        db.commit()

        recovered = workflow_engine.recover_stuck_runs(db, stale_after_seconds=5)
        assert recovered == stale_count

        snapshot = workflow_engine.dlq_snapshot(db)
        assert snapshot["failed_nodes"] >= stale_count
        assert snapshot["compensated_nodes"] >= stale_count
    finally:
        db.close()


def test_worker_health_snapshot_counts_active_runtime_state():
    health = workflow_engine.health_snapshot()
    assert "workers" in health
    assert "node_workers" in health
    assert "runtime_state" in health
    assert isinstance(health["workers"]["tracked"], int)
    assert isinstance(health["node_workers"]["alive"], int)
    assert isinstance(health["runtime_state"]["cancel_events"], int)

    # 런타임 상태 조회가 반복 호출에서 안정적으로 동작해야 한다.
    for _ in range(10):
        next_health = workflow_engine.health_snapshot()
        assert set(next_health.keys()) == set(health.keys())
        time.sleep(0.01)
