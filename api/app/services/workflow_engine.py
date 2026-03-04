from sqlalchemy.orm import Session

from app.models.workflow import NodeRun, WorkflowDefinition, WorkflowRun
from app.schemas.agent import AgentTaskRequest
from app.services.agent_runner import AgentRunner
from app.services.workspace import InvalidNodeIdError, WorkspaceService, is_safe_node_id


class WorkflowEngine:
    def __init__(self) -> None:
        self.workspace = WorkspaceService()
        self.agent_runner = AgentRunner()

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
