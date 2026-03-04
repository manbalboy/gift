from datetime import datetime, timedelta, timezone
from threading import Lock

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.workflow import NodeRun, WorkflowDefinition, WorkflowRun
from app.schemas.agent import AgentTaskRequest
from app.services.agent_runner import AgentRunner
from app.services.workspace import InvalidNodeIdError, WorkspaceService, is_safe_node_id


DEFAULT_COMPENSATION_TIMEOUT_SECONDS = 120


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class WorkflowEngine:
    def __init__(self) -> None:
        self.workspace = WorkspaceService()
        self.agent_runner = AgentRunner()
        self._lock_guard = Lock()
        self._run_locks: dict[int, Lock] = {}

    def _get_run_lock(self, run_id: int) -> Lock:
        with self._lock_guard:
            lock = self._run_locks.get(run_id)
            if lock is None:
                lock = Lock()
                self._run_locks[run_id] = lock
            return lock

    def recover_stuck_runs(self, db: Session, stale_after_seconds: int = DEFAULT_COMPENSATION_TIMEOUT_SECONDS) -> int:
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=stale_after_seconds)

        stuck_nodes = (
            db.query(NodeRun)
            .join(WorkflowRun, WorkflowRun.id == NodeRun.run_id)
            .filter(NodeRun.status == "running")
            .filter(WorkflowRun.status == "running")
            .all()
        )

        impacted_run_ids: set[int] = set()
        recovered = 0
        for node in stuck_nodes:
            if _as_utc(node.updated_at) > cutoff:
                continue
            node.status = "failed"
            previous = (node.log or "").strip()
            prefix = f"[compensation] stale running node recovered at {now.isoformat()}"
            node.log = f"{prefix}\n{previous}".strip()
            impacted_run_ids.add(node.run_id)
            recovered += 1

        if impacted_run_ids:
            runs = db.query(WorkflowRun).filter(WorkflowRun.id.in_(impacted_run_ids)).all()
            for run in runs:
                run.status = "failed"

        if recovered:
            db.commit()
        else:
            db.rollback()
        return recovered

    def create_run(self, db: Session, workflow: WorkflowDefinition) -> WorkflowRun:
        graph = workflow.graph or {}
        nodes = graph.get("nodes", [])

        run = WorkflowRun(workflow_id=workflow.id, status="queued")
        db.add(run)
        db.flush()

        for idx, node in enumerate(nodes):
            if not is_safe_node_id(node["id"]):
                raise InvalidNodeIdError(f"unsafe node_id: {node['id']}")
            node_run = NodeRun(
                run_id=run.id,
                node_id=node["id"],
                node_name=node.get("label", node["id"]),
                sequence=idx,
                status="queued",
                log="대기 중",
            )
            db.add(node_run)

        db.commit()
        db.refresh(run)
        return run

    def _load_locked_run(self, db: Session, run_id: int) -> WorkflowRun | None:
        return db.query(WorkflowRun).filter(WorkflowRun.id == run_id).with_for_update().first()

    def _load_locked_nodes(self, db: Session, run_id: int) -> list[NodeRun]:
        return (
            db.query(NodeRun)
            .filter(NodeRun.run_id == run_id)
            .order_by(NodeRun.sequence.asc())
            .with_for_update()
            .all()
        )

    def refresh_run(self, db: Session, run: WorkflowRun) -> WorkflowRun:
        run_lock = self._get_run_lock(run.id)
        if not run_lock.acquire(blocking=False):
            latest = db.query(WorkflowRun).filter(WorkflowRun.id == run.id).first()
            return latest or run

        try:
            locked_run = self._load_locked_run(db, run.id)
            if not locked_run:
                return run

            node_runs = self._load_locked_nodes(db, locked_run.id)
            if not node_runs:
                locked_run.status = "done"
                db.commit()
                db.refresh(locked_run)
                return locked_run

            if locked_run.status in {"done", "failed"}:
                db.refresh(locked_run)
                return locked_run

            running_node = next((n for n in node_runs if n.status == "running"), None)
            queued_node = next((n for n in node_runs if n.status == "queued"), None)
            if not running_node and not queued_node:
                locked_run.status = "done"
                db.commit()
                db.refresh(locked_run)
                return locked_run

            if running_node:
                db.refresh(locked_run)
                return locked_run

            assert queued_node is not None
            queued_node.status = "running"
            queued_node.log = "실행 중"
            locked_run.status = "running"
            node_id = queued_node.node_id
            node_name = queued_node.node_name
            run_id = locked_run.id
            db.commit()

            result = self.agent_runner.run(
                AgentTaskRequest(
                    node_id=node_id,
                    node_name=node_name,
                    payload={"run_id": run_id},
                )
            )

            locked_run = self._load_locked_run(db, run_id)
            if not locked_run:
                return run
            locked_node = db.query(NodeRun).filter(NodeRun.id == queued_node.id).with_for_update().first()
            if not locked_node:
                db.refresh(locked_run)
                return locked_run
            if locked_node.status != "running":
                db.refresh(locked_run)
                return locked_run

            locked_node.status = "done" if result.ok else "failed"
            locked_node.log = result.log

            if result.ok:
                try:
                    locked_node.artifact_path = self.workspace.write_artifact(
                        run_id,
                        locked_node.node_id,
                        f"# Artifact\n\n- run_id: {run_id}\n- node: {locked_node.node_name}\n- result: success\n",
                    )
                except InvalidNodeIdError as exc:
                    locked_node.status = "failed"
                    locked_node.log = f"invalid node_id: {exc}"

            all_nodes = self._load_locked_nodes(db, run_id)
            if any(node.status == "failed" for node in all_nodes):
                locked_run.status = "failed"
            elif all(node.status == "done" for node in all_nodes):
                locked_run.status = "done"
            else:
                locked_run.status = "running"

            db.commit()
            db.refresh(locked_run)
            return locked_run
        except SQLAlchemyError:
            db.rollback()
            latest = db.query(WorkflowRun).filter(WorkflowRun.id == run.id).first()
            return latest or run
        finally:
            run_lock.release()
