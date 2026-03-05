from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import threading
import time

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.workflow import HumanGateDecisionAudit, NodeRun, WorkflowDefinition, WorkflowRun
from app.schemas.agent import AgentTaskRequest
from app.services.agent_runner import AgentRunner
from app.services.lock_provider import LockProviderFactory
from app.services.workspace import InvalidNodeIdError, WorkspaceService, is_safe_node_id


DEFAULT_COMPENSATION_TIMEOUT_SECONDS = 120
logger = logging.getLogger(__name__)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _extract_node_command(graph: dict | None, node_id: str) -> str | None:
    if not isinstance(graph, dict):
        return None
    nodes = graph.get("nodes")
    if not isinstance(nodes, list):
        return None

    for node in nodes:
        if not isinstance(node, dict) or node.get("id") != node_id:
            continue

        direct = node.get("command")
        if isinstance(direct, str) and direct.strip():
            return direct.strip()

        data = node.get("data")
        if isinstance(data, dict):
            nested = data.get("command")
            if isinstance(nested, str) and nested.strip():
                return nested.strip()
    return None


def _extract_node_type(graph: dict | None, node_id: str) -> str:
    if not isinstance(graph, dict):
        return "task"
    nodes = graph.get("nodes")
    if not isinstance(nodes, list):
        return "task"

    for node in nodes:
        if not isinstance(node, dict) or node.get("id") != node_id:
            continue
        raw_type = node.get("type")
        if isinstance(raw_type, str) and raw_type.strip():
            return raw_type.strip()
        return "task"
    return "task"


class WorkflowEngine:
    def __init__(self) -> None:
        self.workspace = WorkspaceService()
        self.agent_runner = AgentRunner()
        self.lock_provider = LockProviderFactory.create()

        self._engine_guard = threading.Lock()
        self._workers: dict[int, threading.Thread] = {}
        self._node_workers: dict[int, dict[str, threading.Thread]] = {}
        self._cancel_events: dict[int, threading.Event] = {}
        self._approval_events: dict[int, dict[str, threading.Event]] = {}

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

        recovered = 0
        for node in stuck_nodes:
            if _as_utc(node.updated_at) > cutoff:
                continue
            try:
                locked_node = db.query(NodeRun).filter(NodeRun.id == node.id).with_for_update().first()
                if not locked_node or locked_node.status != "running" or _as_utc(locked_node.updated_at) > cutoff:
                    continue

                workflow_run = db.query(WorkflowRun).filter(WorkflowRun.id == locked_node.run_id).with_for_update().first()
                if workflow_run and workflow_run.status == "running":
                    workflow_run.status = "failed"

                locked_node.status = "failed"
                previous = (locked_node.log or "").strip()
                prefix = f"[compensation] stale running node recovered at {now.isoformat()}"
                locked_node.log = f"{prefix}\n{previous}".strip()
                db.commit()
                recovered += 1
            except SQLAlchemyError:
                db.rollback()
        return recovered

    def _get_cancel_event(self, run_id: int) -> threading.Event:
        with self._engine_guard:
            event = self._cancel_events.get(run_id)
            if event is None:
                event = threading.Event()
                self._cancel_events[run_id] = event
            return event

    def _get_approval_event(self, run_id: int, node_id: str) -> threading.Event:
        with self._engine_guard:
            run_events = self._approval_events.get(run_id)
            if run_events is None:
                run_events = {}
                self._approval_events[run_id] = run_events
            event = run_events.get(node_id)
            if event is None:
                event = threading.Event()
                run_events[node_id] = event
            return event

    def _clear_run_runtime_state(self, run_id: int) -> None:
        with self._engine_guard:
            self._workers.pop(run_id, None)
            self._node_workers.pop(run_id, None)
            self._cancel_events.pop(run_id, None)
            self._approval_events.pop(run_id, None)

    def _dispatch_task_node_async(self, run_id: int, node_id: str, node_name: str, command: str | None) -> None:
        def _run_node() -> None:
            try:
                self._execute_task_node(run_id=run_id, node_id=node_id, node_name=node_name, command=command)
            finally:
                with self._engine_guard:
                    run_workers = self._node_workers.get(run_id)
                    if run_workers is not None:
                        run_workers.pop(node_id, None)

        with self._engine_guard:
            run_workers = self._node_workers.setdefault(run_id, {})
            existing = run_workers.get(node_id)
            if existing and existing.is_alive():
                return
            worker = threading.Thread(
                target=_run_node,
                name=f"workflow-node-runner-{run_id}-{node_id}",
                daemon=True,
            )
            run_workers[node_id] = worker
            worker.start()

    def _start_background_worker(self, run_id: int) -> None:
        cancel_event = self._get_cancel_event(run_id)
        cancel_event.clear()

        with self._engine_guard:
            existing = self._workers.get(run_id)
            if existing and existing.is_alive():
                return

            worker = threading.Thread(
                target=self._background_worker_loop,
                args=(run_id,),
                name=f"workflow-runner-{run_id}",
                daemon=True,
            )
            self._workers[run_id] = worker
            worker.start()

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

    def _build_predecessors(self, graph: dict | None, node_runs: list[NodeRun]) -> dict[str, set[str]]:
        node_ids = {node.node_id for node in node_runs}
        predecessors: dict[str, set[str]] = {node_id: set() for node_id in node_ids}

        edges: list[dict] = []
        if isinstance(graph, dict):
            raw_edges = graph.get("edges")
            if isinstance(raw_edges, list):
                edges = [edge for edge in raw_edges if isinstance(edge, dict)]

        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            if source in node_ids and target in node_ids:
                predecessors[target].add(source)

        return predecessors

    def health_snapshot(self) -> dict[str, object]:
        with self._engine_guard:
            worker_count = len(self._workers)
            alive_workers = sum(1 for worker in self._workers.values() if worker.is_alive())
            node_worker_count = sum(len(node_workers) for node_workers in self._node_workers.values())
            node_worker_alive = sum(
                1 for node_workers in self._node_workers.values() for worker in node_workers.values() if worker.is_alive()
            )
            tracked_cancels = len(self._cancel_events)
            pending_approval_runs = len(self._approval_events)
            pending_approval_nodes = sum(len(nodes) for nodes in self._approval_events.values())
        return {
            "workers": {"tracked": worker_count, "alive": alive_workers},
            "node_workers": {"tracked": node_worker_count, "alive": node_worker_alive},
            "runtime_state": {
                "cancel_events": tracked_cancels,
                "approval_runs": pending_approval_runs,
                "approval_nodes": pending_approval_nodes,
            },
        }

    def dlq_snapshot(self, db: Session) -> dict[str, int]:
        failed_nodes = db.query(NodeRun).filter(NodeRun.status == "failed").count()
        compensated_nodes = (
            db.query(NodeRun)
            .filter(NodeRun.status == "failed")
            .filter(NodeRun.log.contains("[compensation]"))
            .count()
        )
        return {
            "failed_nodes": int(failed_nodes),
            "compensated_nodes": int(compensated_nodes),
        }

    def _sync_run_status(self, run: WorkflowRun, node_runs: list[NodeRun]) -> str:
        if run.status in {"done", "failed", "cancelled"}:
            return run.status

        if any(node.status == "failed" for node in node_runs):
            run.status = "failed"
        elif any(node.status == "cancelled" for node in node_runs):
            run.status = "cancelled"
        elif any(node.status == "approval_pending" for node in node_runs):
            run.status = "waiting"
        elif all(node.status == "done" for node in node_runs):
            run.status = "done"
        elif any(node.status == "running" for node in node_runs):
            run.status = "running"
        else:
            run.status = "queued"
        return run.status

    def _mark_run_cancelled_locked(self, run: WorkflowRun, nodes: list[NodeRun]) -> None:
        for node in nodes:
            if node.status in {"done", "failed", "cancelled"}:
                continue
            node.status = "cancelled"
            previous = (node.log or "").strip()
            node.log = f"[cancelled] user requested cancellation\n{previous}".strip()
        run.status = "cancelled"

    def _execute_task_node(self, run_id: int, node_id: str, node_name: str, command: str | None) -> None:
        attempts = max(1, int(settings.workflow_node_max_retries))
        backoff = max(0.0, float(settings.workflow_retry_backoff_seconds))
        cancel_event = self._get_cancel_event(run_id)

        logs: list[str] = []
        last_ok = False
        for attempt in range(1, attempts + 1):
            if cancel_event.is_set():
                break
            if attempt > 1:
                wait_for = backoff * (2 ** (attempt - 2))
                if wait_for > 0:
                    logs.append(f"[retry] backoff {wait_for:.2f}s before attempt {attempt}")
                    time.sleep(wait_for)

            payload: dict[str, str | int] = {"run_id": run_id}
            if command:
                payload["command"] = command

            result = self.agent_runner.run(
                AgentTaskRequest(
                    node_id=node_id,
                    node_name=node_name,
                    payload=payload,
                )
            )
            logs.append(result.log.strip())
            if result.ok:
                last_ok = True
                break

        db = SessionLocal()
        run_lock = self.lock_provider.get_run_lock(run_id)
        acquired = run_lock.acquire(blocking=True, timeout=2)
        if not acquired:
            db.close()
            return

        try:
            run = self._load_locked_run(db, run_id)
            if not run:
                return
            nodes = self._load_locked_nodes(db, run_id)
            node = next((item for item in nodes if item.node_id == node_id), None)
            if not node:
                return
            if cancel_event.is_set() or run.status == "cancelled":
                self._mark_run_cancelled_locked(run, nodes)
                db.commit()
                return
            if node.status != "running":
                db.commit()
                return

            node.status = "done" if last_ok else "failed"
            node.log = "\n".join(part for part in logs if part).strip()
            if node.status == "done":
                try:
                    node.artifact_path = self.workspace.write_artifact(
                        run_id,
                        node.node_id,
                        f"# Artifact\n\n- run_id: {run_id}\n- node: {node.node_name}\n- result: success\n",
                    )
                except InvalidNodeIdError as exc:
                    node.status = "failed"
                    node.log = f"invalid node_id: {exc}"

            self._sync_run_status(run, nodes)
            db.commit()
        except SQLAlchemyError:
            db.rollback()
        finally:
            run_lock.release()
            db.close()

    def _background_worker_loop(self, run_id: int) -> None:
        cancel_event = self._get_cancel_event(run_id)

        try:
            while True:
                if cancel_event.is_set():
                    db = SessionLocal()
                    run_lock = self.lock_provider.get_run_lock(run_id)
                    if run_lock.acquire(blocking=True, timeout=2):
                        try:
                            run = self._load_locked_run(db, run_id)
                            if run:
                                nodes = self._load_locked_nodes(db, run_id)
                                self._mark_run_cancelled_locked(run, nodes)
                                db.commit()
                        except SQLAlchemyError:
                            db.rollback()
                        finally:
                            run_lock.release()
                    db.close()
                    break

                execution_targets: list[tuple[str, str, str | None]] = []
                wait_for_approval_event: threading.Event | None = None
                should_sleep = False

                db = SessionLocal()
                run_lock = self.lock_provider.get_run_lock(run_id)
                acquired = run_lock.acquire(blocking=True, timeout=2)
                if not acquired:
                    db.close()
                    time.sleep(max(0.02, float(settings.workflow_worker_poll_interval_seconds)))
                    continue

                try:
                    run = self._load_locked_run(db, run_id)
                    if not run:
                        break
                    if run.status in {"done", "failed", "cancelled"}:
                        db.commit()
                        break

                    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == run.workflow_id).first()
                    graph = workflow.graph if workflow else {}
                    nodes = self._load_locked_nodes(db, run.id)
                    if not nodes:
                        run.status = "done"
                        db.commit()
                        break

                    if cancel_event.is_set():
                        self._mark_run_cancelled_locked(run, nodes)
                        db.commit()
                        break

                    predecessors = self._build_predecessors(graph, nodes)
                    node_by_id = {node.node_id: node for node in nodes}

                    runnable = [
                        node
                        for node in nodes
                        if node.status == "queued"
                        and all(node_by_id[p].status == "done" for p in predecessors.get(node.node_id, set()) if p in node_by_id)
                    ]

                    if runnable:
                        queued_human_gate: list[NodeRun] = []
                        queued_tasks: list[NodeRun] = []
                        for candidate in sorted(runnable, key=lambda item: item.sequence):
                            if _extract_node_type(graph, candidate.node_id) == "human_gate":
                                queued_human_gate.append(candidate)
                            else:
                                queued_tasks.append(candidate)

                        for gate_node in queued_human_gate:
                            gate_node.status = "approval_pending"
                            gate_node.log = "승인 대기 중"
                            approval_event = self._get_approval_event(run.id, gate_node.node_id)
                            approval_event.clear()
                            if wait_for_approval_event is None:
                                wait_for_approval_event = approval_event

                        for task_node in queued_tasks:
                            task_node.status = "running"
                            task_node.log = "실행 중"
                            command = _extract_node_command(graph, task_node.node_id)
                            execution_targets.append((task_node.node_id, task_node.node_name, command))

                        if queued_tasks:
                            run.status = "running"
                        elif queued_human_gate:
                            run.status = "waiting"
                        db.commit()
                    else:
                        run_status = self._sync_run_status(run, nodes)
                        if run_status in {"done", "failed", "cancelled"}:
                            db.commit()
                            break
                        if any(node.status == "approval_pending" for node in nodes):
                            run.status = "waiting"
                        elif any(node.status == "queued" for node in nodes):
                            run.status = "running"
                        db.commit()
                        should_sleep = True
                except SQLAlchemyError:
                    db.rollback()
                    should_sleep = True
                finally:
                    run_lock.release()
                    db.close()

                if execution_targets:
                    for node_id, node_name, command in execution_targets:
                        self._dispatch_task_node_async(run_id=run_id, node_id=node_id, node_name=node_name, command=command)
                    continue

                if wait_for_approval_event is not None:
                    while not cancel_event.is_set() and not wait_for_approval_event.wait(
                        timeout=max(0.05, float(settings.workflow_approval_poll_interval_seconds))
                    ):
                        pass
                    wait_for_approval_event.clear()
                    continue

                if should_sleep:
                    time.sleep(max(0.02, float(settings.workflow_worker_poll_interval_seconds)))
        finally:
            self._clear_run_runtime_state(run_id)

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
        self._start_background_worker(run.id)
        return run

    def refresh_run(self, db: Session, run: WorkflowRun) -> WorkflowRun:
        latest = db.query(WorkflowRun).filter(WorkflowRun.id == run.id).first()
        return latest or run

    def approve_human_gate(
        self,
        db: Session,
        run: WorkflowRun,
        node_id: str,
        *,
        decided_by: str = "system",
        payload: dict | None = None,
    ) -> WorkflowRun:
        return self._handle_human_gate_decision(
            db=db,
            run=run,
            node_id=node_id,
            decision="approved",
            decided_by=decided_by,
            payload=payload,
        )

    def reject_human_gate(
        self,
        db: Session,
        run: WorkflowRun,
        node_id: str,
        *,
        decided_by: str = "system",
        payload: dict | None = None,
    ) -> WorkflowRun:
        return self._handle_human_gate_decision(
            db=db,
            run=run,
            node_id=node_id,
            decision="rejected",
            decided_by=decided_by,
            payload=payload,
        )

    def _handle_human_gate_decision(
        self,
        db: Session,
        run: WorkflowRun,
        node_id: str,
        *,
        decision: str,
        decided_by: str,
        payload: dict | None,
    ) -> WorkflowRun:
        run_lock = self.lock_provider.get_run_lock(run.id)
        if not run_lock.acquire(blocking=False):
            raise RuntimeError("run lock is busy")

        try:
            locked_run = self._load_locked_run(db, run.id)
            if not locked_run:
                raise ValueError("run not found")
            if locked_run.status in {"done", "failed", "cancelled"}:
                raise ValueError("run cannot be approved in terminal state")

            node = (
                db.query(NodeRun)
                .filter(NodeRun.run_id == run.id, NodeRun.node_id == node_id)
                .with_for_update()
                .first()
            )
            if not node:
                raise ValueError("node not found in run")
            if node.status != "approval_pending":
                raise ValueError("node is not approval_pending")

            if decision == "approved":
                node.status = "done"
                previous = (node.log or "").strip()
                node.log = f"[human_gate] approved\n{previous}".strip()
            else:
                node.status = "failed"
                previous = (node.log or "").strip()
                node.log = f"[human_gate] rejected\n{previous}".strip()

            all_nodes = self._load_locked_nodes(db, run.id)
            if decision == "approved":
                self._sync_run_status(locked_run, all_nodes)
                if locked_run.status == "waiting" and any(item.status == "queued" for item in all_nodes):
                    locked_run.status = "running"
            else:
                locked_run.status = "failed"
                self._sync_run_status(locked_run, all_nodes)

            audit = HumanGateDecisionAudit(
                run_id=run.id,
                node_id=node_id,
                decision=decision,
                decided_by=decided_by,
                decided_at=datetime.now(timezone.utc),
                payload=payload or {},
            )
            db.add(audit)

            db.commit()
            db.refresh(locked_run)
        except SQLAlchemyError as exc:
            db.rollback()
            raise RuntimeError("approval failed") from exc
        finally:
            run_lock.release()

        approval_event = self._get_approval_event(run.id, node_id)
        approval_event.set()
        if decision == "approved":
            self._start_background_worker(run.id)
        return locked_run

    def cancel_human_gate_pending(
        self,
        db: Session,
        run: WorkflowRun,
        node_id: str,
        *,
        cancelled_by: str = "system",
        payload: dict | None = None,
    ) -> WorkflowRun:
        run_lock = self.lock_provider.get_run_lock(run.id)
        if not run_lock.acquire(blocking=False):
            raise RuntimeError("run lock is busy")

        try:
            locked_run = self._load_locked_run(db, run.id)
            if not locked_run:
                raise ValueError("run not found")
            if locked_run.status in {"done", "failed", "cancelled"}:
                raise ValueError("run cannot be cancelled in terminal state")

            node = (
                db.query(NodeRun)
                .filter(NodeRun.run_id == run.id, NodeRun.node_id == node_id)
                .with_for_update()
                .first()
            )
            if not node:
                raise ValueError("node not found in run")
            if node.status != "approval_pending":
                raise ValueError("node is not approval_pending")

            previous = (node.log or "").strip()
            node.status = "queued"
            node.log = f"[human_gate] approval cancelled\n{previous}".strip()

            all_nodes = self._load_locked_nodes(db, run.id)
            self._sync_run_status(locked_run, all_nodes)
            if any(item.status == "queued" for item in all_nodes):
                locked_run.status = "running"

            audit = HumanGateDecisionAudit(
                run_id=run.id,
                node_id=node_id,
                decision="cancelled",
                decided_by=cancelled_by,
                decided_at=datetime.now(timezone.utc),
                payload=payload or {},
            )
            db.add(audit)
            db.commit()
            db.refresh(locked_run)
        except SQLAlchemyError as exc:
            db.rollback()
            raise RuntimeError("approval cancellation failed") from exc
        finally:
            run_lock.release()

        approval_event = self._get_approval_event(run.id, node_id)
        approval_event.set()
        self._start_background_worker(run.id)
        return locked_run

    def cancel_run(self, db: Session, run: WorkflowRun) -> WorkflowRun:
        cancel_event = self._get_cancel_event(run.id)
        cancel_event.set()

        run_lock = self.lock_provider.get_run_lock(run.id)
        if not run_lock.acquire(blocking=False):
            raise RuntimeError("run lock is busy")

        try:
            locked_run = self._load_locked_run(db, run.id)
            if not locked_run:
                raise ValueError("run not found")
            if locked_run.status not in {"done", "failed", "cancelled"}:
                nodes = self._load_locked_nodes(db, run.id)
                self._mark_run_cancelled_locked(locked_run, nodes)
                db.commit()
                db.refresh(locked_run)
            else:
                db.refresh(locked_run)
        except SQLAlchemyError as exc:
            db.rollback()
            raise RuntimeError("cancel failed") from exc
        finally:
            run_lock.release()

        with self._engine_guard:
            run_events = self._approval_events.get(run.id, {})
        for event in run_events.values():
            event.set()

        worker: threading.Thread | None
        node_workers: list[threading.Thread]
        with self._engine_guard:
            worker = self._workers.get(run.id)
            node_workers = list(self._node_workers.get(run.id, {}).values())
        if worker and worker.is_alive():
            worker.join(timeout=max(0.1, float(settings.workflow_cancel_join_timeout_seconds)))
        for node_worker in node_workers:
            if node_worker.is_alive():
                node_worker.join(timeout=max(0.05, float(settings.workflow_cancel_join_timeout_seconds)))

        return locked_run
