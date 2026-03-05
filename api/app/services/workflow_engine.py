from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import logging
from pathlib import Path
import re
import threading
import time
from typing import Protocol

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.workflow import Artifact, HumanGateDecisionAudit, NodeRun, WorkflowDefinition, WorkflowRun
from app.schemas.agent import AgentTaskRequest
from app.services.agent_runner import AgentRunner
from app.services.lock_provider import LockProviderFactory
from app.services.system_alerts import record_system_alert
from app.services.workspace import InvalidNodeIdError, WorkspaceArtifactIOError, WorkspaceService, is_safe_node_id


DEFAULT_COMPENSATION_TIMEOUT_SECONDS = 120
DEFAULT_LINEAR_V1_NODE_IDS = ("idea", "plan", "code", "test", "pr")
logger = logging.getLogger(__name__)
_WHITESPACE_NORMALIZER = re.compile(r"\s+")


def _normalize_semantic_text(content: str) -> str:
    return _WHITESPACE_NORMALIZER.sub(" ", content).strip()


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


def _extract_node_timeout_override(graph: dict | None, node_id: str) -> float | None:
    if not isinstance(graph, dict):
        return None
    nodes = graph.get("nodes")
    if not isinstance(nodes, list):
        return None

    for node in nodes:
        if not isinstance(node, dict) or node.get("id") != node_id:
            continue
        direct = node.get("timeout_override")
        if isinstance(direct, (int, float)) and float(direct) > 0:
            return float(direct)

        data = node.get("data")
        if isinstance(data, dict):
            nested = data.get("timeout_override")
            if isinstance(nested, (int, float)) and float(nested) > 0:
                return float(nested)
    return None


def _build_linear_edges(node_ids: list[str]) -> list[dict[str, str]]:
    edges: list[dict[str, str]] = []
    for index in range(len(node_ids) - 1):
        edges.append(
            {
                "id": f"default-linear-{index + 1}",
                "source": node_ids[index],
                "target": node_ids[index + 1],
            }
        )
    return edges


def _default_linear_v1_graph() -> dict[str, object]:
    node_ids = list(DEFAULT_LINEAR_V1_NODE_IDS)
    return {
        "nodes": [
            {
                "id": node_id,
                "type": "task",
                "label": node_id.upper(),
            }
            for node_id in node_ids
        ],
        "edges": _build_linear_edges(node_ids),
        "meta": {"graph_version": "default_linear_v1"},
    }


def _normalize_workflow_graph(raw_graph: dict | None) -> tuple[dict[str, object], bool]:
    if isinstance(raw_graph, dict):
        nodes = raw_graph.get("nodes")
        edges = raw_graph.get("edges")
        if isinstance(nodes, list) and nodes:
            normalized_nodes = [node for node in nodes if isinstance(node, dict) and str(node.get("id", "")).strip()]
            if normalized_nodes:
                normalized_graph: dict[str, object] = {
                    "nodes": normalized_nodes,
                    "edges": [edge for edge in edges if isinstance(edge, dict)] if isinstance(edges, list) else [],
                }
                if isinstance(raw_graph.get("meta"), dict):
                    normalized_graph["meta"] = raw_graph["meta"]
                return normalized_graph, False

        legacy_sequence = raw_graph.get("sequence")
        if isinstance(legacy_sequence, list):
            node_ids = [str(item).strip() for item in legacy_sequence if str(item).strip()]
            if node_ids:
                return (
                    {
                        "nodes": [
                            {"id": node_id, "type": "task", "label": node_id.replace("-", " ").title()}
                            for node_id in node_ids
                        ],
                        "edges": _build_linear_edges(node_ids),
                        "meta": {"graph_version": "default_linear_v1", "fallback_source": "legacy_sequence"},
                    },
                    True,
                )

    return _default_linear_v1_graph(), True


class NodeExecutor(Protocol):
    def stage(
        self,
        *,
        engine: "WorkflowEngine",
        run_id: int,
        node: NodeRun,
        graph: dict | None,
        execution_targets: list[tuple[str, str, str | None]],
        approval_events: list[threading.Event],
    ) -> None: ...


class TaskNodeExecutor:
    def stage(
        self,
        *,
        engine: "WorkflowEngine",
        run_id: int,
        node: NodeRun,
        graph: dict | None,
        execution_targets: list[tuple[str, str, str | None]],
        approval_events: list[threading.Event],
    ) -> None:
        node.status = "running"
        node.log = "실행 중"
        command = _extract_node_command(graph, node.node_id)
        execution_targets.append((node.node_id, node.node_name, command))


class HumanGateNodeExecutor:
    def stage(
        self,
        *,
        engine: "WorkflowEngine",
        run_id: int,
        node: NodeRun,
        graph: dict | None,
        execution_targets: list[tuple[str, str, str | None]],
        approval_events: list[threading.Event],
    ) -> None:
        node.status = "approval_pending"
        node.log = "승인 대기 중"
        approval_event = engine._get_approval_event(run_id, node.node_id)
        approval_event.clear()
        approval_events.append(approval_event)


class ExecutorRegistry:
    def __init__(self) -> None:
        self._executors: dict[str, NodeExecutor] = {
            "task": TaskNodeExecutor(),
            "human_gate": HumanGateNodeExecutor(),
        }

    def register(self, node_type: str, executor: NodeExecutor) -> None:
        key = node_type.strip().lower()
        if key:
            self._executors[key] = executor

    def resolve(self, node_type: str) -> NodeExecutor:
        key = node_type.strip().lower()
        return self._executors.get(key, self._executors["task"])


class WorkflowEngine:
    def __init__(self) -> None:
        self.workspace = WorkspaceService()
        self.agent_runner = AgentRunner()
        self.lock_provider = LockProviderFactory.create()
        self.executor_registry = ExecutorRegistry()

        self._engine_guard = threading.Lock()
        self._workers: dict[int, threading.Thread] = {}
        self._node_workers: dict[int, dict[str, threading.Thread]] = {}
        self._cancel_events: dict[int, threading.Event] = {}
        self._approval_events: dict[int, dict[str, threading.Event]] = {}
        self._node_iteration_counts: dict[int, dict[str, int]] = {}
        self._node_failure_streaks: dict[tuple[int, str], int] = {}

    def _append_human_gate_status_artifact(
        self,
        *,
        run_id: int,
        node_id: str,
        decision: str,
        decided_by: str,
        payload: dict | None,
    ) -> str | None:
        decided_at = datetime.now(timezone.utc).isoformat()
        encoded_payload = json.dumps(payload or {}, ensure_ascii=False, sort_keys=True)
        artifact_entry = "\n".join(
            [
                f"## {decided_at} · {decision}",
                f"- node_id: {node_id}",
                f"- decided_by: {decided_by}",
                f"- payload: {encoded_payload}",
            ]
        )

        artifact_path = self.workspace.root / "main" / "runs" / str(run_id) / "status.md"
        existing = ""
        if artifact_path.exists():
            existing = artifact_path.read_text(encoding="utf-8").strip()
        if not existing:
            existing = "# Human Gate Status Log"
        composed = f"{existing}\n\n{artifact_entry}\n"
        try:
            return self.workspace.write_artifact(run_id=run_id, node_id="status", content=composed)
        except (InvalidNodeIdError, WorkspaceArtifactIOError):
            return None

    def _upsert_artifact_record(
        self,
        db: Session,
        *,
        run_id: int,
        node: NodeRun | None,
        node_id: str,
        category: str,
        path: str,
    ) -> None:
        size_bytes = 0
        try:
            size_bytes = max(0, int(Path(path).stat().st_size))
        except Exception:
            size_bytes = 0

        existing = (
            db.query(Artifact)
            .filter(
                Artifact.run_id == run_id,
                Artifact.node_id == node_id,
                Artifact.path == path,
                Artifact.category == category,
            )
            .order_by(Artifact.id.desc())
            .first()
        )
        if existing:
            existing.size_bytes = size_bytes
            return

        db.add(
            Artifact(
                run_id=run_id,
                node_run_id=node.id if node else None,
                node_id=node_id,
                category=category,
                path=path,
                size_bytes=size_bytes,
            )
        )

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
            self._node_iteration_counts.pop(run_id, None)

    def _record_node_iteration(self, run_id: int, node_id: str) -> tuple[int, int]:
        budget = max(1, int(settings.workflow_node_iteration_budget))
        with self._engine_guard:
            run_counts = self._node_iteration_counts.setdefault(run_id, {})
            next_count = run_counts.get(node_id, 0) + 1
            run_counts[node_id] = next_count
        return next_count, budget

    def _record_node_failure_streak(self, workflow_id: int, node_id: str, *, failed: bool) -> int:
        key = (workflow_id, node_id)
        with self._engine_guard:
            if failed:
                next_count = self._node_failure_streaks.get(key, 0) + 1
                self._node_failure_streaks[key] = next_count
                return next_count
            self._node_failure_streaks.pop(key, None)
        return 0

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

    def _collect_missing_resume_artifacts(self, node_runs: list[NodeRun]) -> list[tuple[str, str]]:
        missing: list[tuple[str, str]] = []
        for node in node_runs:
            if node.status != "done":
                continue
            artifact_path = (node.artifact_path or "").strip()
            if not artifact_path:
                continue
            try:
                artifact_exists = Path(artifact_path).is_file()
            except OSError as exc:
                missing.append((node.node_id, f"{artifact_path} (os-error: {exc.__class__.__name__})"))
                continue
            if not artifact_exists:
                missing.append((node.node_id, artifact_path))
        return missing

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
            tracked_iteration_runs = len(self._node_iteration_counts)
        return {
            "workers": {"tracked": worker_count, "alive": alive_workers},
            "node_workers": {"tracked": node_worker_count, "alive": node_worker_alive},
            "runtime_state": {
                "cancel_events": tracked_cancels,
                "approval_runs": pending_approval_runs,
                "approval_nodes": pending_approval_nodes,
                "iteration_budgets": tracked_iteration_runs,
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
        if run.status in {"done", "failed", "cancelled", "paused", "blocked"}:
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
            if node.status in {"done", "failed", "cancelled", "blocked"}:
                continue
            node.status = "cancelled"
            previous = (node.log or "").strip()
            node.log = f"[cancelled] user requested cancellation\n{previous}".strip()
        run.status = "cancelled"

    def _fail_run_gracefully(self, run_id: int, *, reason: str) -> None:
        db = SessionLocal()
        run_lock = self.lock_provider.get_run_lock(run_id)
        acquired = run_lock.acquire(blocking=True, timeout=2)
        if not acquired:
            db.close()
            logger.error("failed to acquire run lock while handling failure", extra={"run_id": run_id, "reason": reason})
            return

        try:
            run = self._load_locked_run(db, run_id)
            if not run:
                return

            nodes = self._load_locked_nodes(db, run_id)
            for node in nodes:
                if node.status in {"done", "failed", "cancelled"}:
                    continue
                previous = (node.log or "").strip()
                node.status = "failed"
                node.log = f"[system_failed] {reason}\n{previous}".strip()

            run.status = "failed"
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            logger.exception(
                "failed to persist graceful failure",
                extra={"run_id": run_id, "reason": reason},
            )
        finally:
            run_lock.release()
            db.close()

    def _execute_task_node(self, run_id: int, node_id: str, node_name: str, command: str | None) -> None:
        try:
            attempts = max(1, int(settings.workflow_node_max_retries))
            backoff = max(0.0, float(settings.workflow_retry_backoff_seconds))
            cancel_event = self._get_cancel_event(run_id)

            logs: list[str] = []
            last_ok = False
            for attempt in range(1, attempts + 1):
                if cancel_event.is_set():
                    break
                logs.append(f"[attempt {attempt}/{attempts}] node execution started")
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
                workflow_id = run.workflow_id
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
                    self._record_node_failure_streak(workflow_id, node.node_id, failed=False)
                    artifact_content = (
                        "# Artifact\n\n"
                        f"- run_id: {run_id}\n"
                        f"- node: {node.node_name}\n"
                        "- result: success\n"
                    )
                    try:
                        artifact_path = self.workspace.root / "main" / "runs" / str(run_id) / f"{node.node_id}.md"
                        has_semantic_diff = True
                        try:
                            if artifact_path.exists():
                                existing = artifact_path.read_text(encoding="utf-8")
                                has_semantic_diff = (
                                    _normalize_semantic_text(existing) != _normalize_semantic_text(artifact_content)
                                )
                        except OSError:
                            has_semantic_diff = True
                        if has_semantic_diff:
                            node.artifact_path = self.workspace.write_artifact(run_id, node.node_id, artifact_content)
                        else:
                            node.artifact_path = str(artifact_path)
                            node.log = f"{node.log}\n[dedup] semantic duplicate change skipped".strip()
                        self._upsert_artifact_record(
                            db,
                            run_id=run_id,
                            node=node,
                            node_id=node.node_id,
                            category="node_output",
                            path=node.artifact_path,
                        )
                    except InvalidNodeIdError as exc:
                        node.status = "failed"
                        node.log = f"invalid node_id: {exc}"
                    except WorkspaceArtifactIOError as exc:
                        node.status = "failed"
                        node.log = f"workspace artifact io failed: {exc}"

                self._sync_run_status(run, nodes)
                db.commit()

                if node.status == "failed":
                    failure_streak = self._record_node_failure_streak(workflow_id, node.node_id, failed=True)
                    risk_score = min(100, 30 + (failure_streak * 20) + (max(0, attempts - 1) * 10))
                    record_system_alert(
                        level="error" if risk_score >= 80 else "warning",
                        code="workflow_node_failure_risk",
                        message=(
                            f"run_id={run_id} node_id={node.node_id} failed after retries "
                            f"(attempts={attempts}, streak={failure_streak})"
                        ),
                        source="workflow_engine",
                        context={
                            "run_id": run_id,
                            "workflow_id": workflow_id,
                            "node_id": node.node_id,
                            "attempt_limit": attempts,
                            "failure_streak": failure_streak,
                            "risk_score": risk_score,
                        },
                    )
            except SQLAlchemyError:
                db.rollback()
            finally:
                run_lock.release()
                db.close()
        except Exception as exc:
            logger.exception(
                "task node execution crashed",
                extra={"run_id": run_id, "node_id": node_id, "node_name": node_name},
            )
            self._fail_run_gracefully(
                run_id,
                reason=f"task node {node_id} crashed: {exc.__class__.__name__}: {exc}",
            )

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
                    if run.status in {"done", "failed", "cancelled", "paused", "blocked"}:
                        db.commit()
                        break

                    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == run.workflow_id).first()
                    graph, used_fallback_graph = _normalize_workflow_graph(workflow.graph if workflow else None)
                    if workflow and used_fallback_graph:
                        workflow.graph = graph
                    nodes = self._load_locked_nodes(db, run.id)
                    if not nodes:
                        run.status = "done"
                        db.commit()
                        break

                    if cancel_event.is_set():
                        self._mark_run_cancelled_locked(run, nodes)
                        db.commit()
                        break

                    default_timeout_seconds = max(1.0, float(settings.workflow_node_timeout_seconds))
                    now = datetime.now(timezone.utc)
                    timed_out_running_nodes: list[tuple[NodeRun, float, float]] = []
                    for candidate in nodes:
                        if candidate.status != "running":
                            continue
                        timeout_seconds = _extract_node_timeout_override(graph, candidate.node_id) or default_timeout_seconds
                        elapsed = (now - _as_utc(candidate.updated_at)).total_seconds()
                        if elapsed > timeout_seconds:
                            timed_out_running_nodes.append((candidate, elapsed, timeout_seconds))

                    if timed_out_running_nodes:
                        for candidate, elapsed, timeout_seconds in timed_out_running_nodes:
                            candidate.status = "paused"
                            previous = (candidate.log or "").strip()
                            candidate.log = (
                                f"[pause] node timeout exceeded ({elapsed:.2f}s>{timeout_seconds:.2f}s)\n{previous}".strip()
                            )
                        run.status = "paused"
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
                        paused_by_budget = False
                        approval_events: list[threading.Event] = []
                        for candidate in sorted(runnable, key=lambda item: item.sequence):
                            count, budget = self._record_node_iteration(run.id, candidate.node_id)
                            if count > budget:
                                candidate.status = "blocked"
                                previous = (candidate.log or "").strip()
                                candidate.log = (
                                    f"[blocked] node iteration budget exceeded ({count}>{budget})\n{previous}".strip()
                                )
                                run.status = "blocked"
                                record_system_alert(
                                    level="error",
                                    code="workflow_node_iteration_budget_blocked",
                                    message=(
                                        f"run_id={run.id} node_id={candidate.node_id} iteration budget exceeded "
                                        f"({count}>{budget}), execution blocked"
                                    ),
                                    source="workflow_engine",
                                    context={
                                        "run_id": run.id,
                                        "workflow_id": run.workflow_id,
                                        "node_id": candidate.node_id,
                                        "current_iteration": count,
                                        "iteration_budget": budget,
                                        "risk_score": 100,
                                    },
                                )
                                paused_by_budget = True
                                break
                            node_type = _extract_node_type(graph, candidate.node_id)
                            executor = self.executor_registry.resolve(node_type)
                            executor.stage(
                                engine=self,
                                run_id=run.id,
                                node=candidate,
                                graph=graph,
                                execution_targets=execution_targets,
                                approval_events=approval_events,
                            )

                        if paused_by_budget:
                            db.commit()
                            break

                        if wait_for_approval_event is None and approval_events:
                            wait_for_approval_event = approval_events[0]

                        if execution_targets:
                            run.status = "running"
                        elif approval_events:
                            run.status = "waiting"
                        db.commit()
                    else:
                        run_status = self._sync_run_status(run, nodes)
                        if run_status in {"done", "failed", "cancelled", "paused", "blocked"}:
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
        except Exception as exc:
            logger.exception("background worker loop crashed", extra={"run_id": run_id})
            self._fail_run_gracefully(run_id, reason=f"background worker crashed: {exc.__class__.__name__}: {exc}")
        finally:
            self._clear_run_runtime_state(run_id)

    def create_run(self, db: Session, workflow: WorkflowDefinition) -> WorkflowRun:
        graph, used_fallback_graph = _normalize_workflow_graph(workflow.graph if isinstance(workflow.graph, dict) else None)
        nodes = graph.get("nodes", [])
        if used_fallback_graph:
            workflow.graph = graph

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
            if locked_run.status in {"done", "failed", "cancelled", "blocked"}:
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
            status_artifact_path = self._append_human_gate_status_artifact(
                run_id=run.id,
                node_id=node_id,
                decision=decision,
                decided_by=decided_by,
                payload=payload,
            )
            if status_artifact_path:
                node.artifact_path = status_artifact_path
                self._upsert_artifact_record(
                    db,
                    run_id=run.id,
                    node=node,
                    node_id="status",
                    category="human_gate_status_log",
                    path=status_artifact_path,
                )

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
            if locked_run.status in {"done", "failed", "cancelled", "blocked"}:
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
            status_artifact_path = self._append_human_gate_status_artifact(
                run_id=run.id,
                node_id=node_id,
                decision="cancelled",
                decided_by=cancelled_by,
                payload=payload,
            )
            if status_artifact_path:
                node.artifact_path = status_artifact_path
                self._upsert_artifact_record(
                    db,
                    run_id=run.id,
                    node=node,
                    node_id="status",
                    category="human_gate_status_log",
                    path=status_artifact_path,
                )
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
            if locked_run.status not in {"done", "failed", "cancelled", "blocked"}:
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

    def resume_run(self, db: Session, run: WorkflowRun) -> WorkflowRun:
        run_lock = self.lock_provider.get_run_lock(run.id)
        if not run_lock.acquire(blocking=True, timeout=2):
            raise RuntimeError("run lock is busy")

        should_start_worker = False
        try:
            locked_run = self._load_locked_run(db, run.id)
            if not locked_run:
                raise ValueError("run not found")
            if locked_run.status != "paused":
                raise ValueError("run is not paused")

            nodes = self._load_locked_nodes(db, run.id)
            paused_nodes = [node for node in nodes if node.status == "paused"]
            if not paused_nodes:
                raise ValueError("paused nodes not found")

            resume_precondition_errors: list[str] = []
            run_workspace_path = self.workspace.root / "main" / "runs" / str(run.id)
            try:
                if not run_workspace_path.exists():
                    resume_precondition_errors.append(f"workspace missing: {run_workspace_path}")
            except OSError as exc:
                resume_precondition_errors.append(
                    f"workspace access failed: {run_workspace_path} ({exc.__class__.__name__})"
                )

            missing_artifacts = self._collect_missing_resume_artifacts(nodes)
            if missing_artifacts:
                preview = ", ".join(f"{node_id}={path}" for node_id, path in missing_artifacts[:3])
                if len(missing_artifacts) > 3:
                    preview = f"{preview}, +{len(missing_artifacts) - 3} more"
                resume_precondition_errors.append(f"required artifacts missing: {preview}")

            if resume_precondition_errors:
                failure_reason = "; ".join(resume_precondition_errors)
                for node in paused_nodes:
                    previous = (node.log or "").strip()
                    node.status = "failed"
                    node.log = f"[resume_failed] {failure_reason}\n{previous}".strip()
                locked_run.status = "failed"
                db.commit()
                db.refresh(locked_run)
                raise ValueError("resume failed: required runtime artifacts expired or missing")

            for node in paused_nodes:
                previous = (node.log or "").strip()
                node.status = "queued"
                node.log = f"[resume] node resumed by user\n{previous}".strip()

            with self._engine_guard:
                run_counts = self._node_iteration_counts.get(run.id)
                if run_counts is not None:
                    for node in paused_nodes:
                        run_counts.pop(node.node_id, None)
                    if not run_counts:
                        self._node_iteration_counts.pop(run.id, None)

            locked_run.status = "running"
            db.commit()
            db.refresh(locked_run)
            should_start_worker = True
        except SQLAlchemyError as exc:
            db.rollback()
            raise RuntimeError("resume failed") from exc
        finally:
            run_lock.release()

        if should_start_worker:
            self._start_background_worker(run.id)
        return locked_run
