import asyncio
import json
import hmac
from datetime import datetime, timedelta, timezone
from collections.abc import AsyncIterator
import logging
from ipaddress import ip_address
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.workflow import HumanGateDecisionAudit, NodeRun, WorkflowDefinition, WorkflowRun
from app.schemas.workflow import (
    HumanGateAuditListOut,
    HumanGateDecisionStatus,
    RunEventOut,
    WorkflowCreate,
    WorkflowGraph,
    WorkflowOut,
    WorkflowRunOut,
    WorkflowUpdate,
)
from app.services.rate_limiter import create_sse_reconnect_limiter
from app.services.workflow_engine import WorkflowEngine
from app.services.workspace import InvalidNodeIdError


router = APIRouter(prefix="/workflows", tags=["workflows"])
run_router = APIRouter(prefix="/runs", tags=["runs"])
approval_router = APIRouter(prefix="/approvals", tags=["approvals"])
engine = WorkflowEngine()
active_stream_connections = 0
active_stream_connections_lock = Lock()
workflow_stream_generation: dict[int, int] = {}
reconnect_rate_limiter = create_sse_reconnect_limiter()
logger = logging.getLogger(__name__)


def _get_stream_generation(workflow_id: int) -> int:
    with active_stream_connections_lock:
        return workflow_stream_generation.get(workflow_id, 0)


def _bump_stream_generation(workflow_id: int) -> int:
    with active_stream_connections_lock:
        next_generation = workflow_stream_generation.get(workflow_id, 0) + 1
        workflow_stream_generation[workflow_id] = next_generation
        return next_generation


def _extract_client_key(request: Request) -> str:
    client_host = request.client.host if request.client and request.client.host else "unknown"
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if not forwarded:
        return client_host

    trusted_proxy_ips = settings.trusted_sse_proxy_ips
    trust_forwarded = "*" in trusted_proxy_ips or client_host in trusted_proxy_ips
    if not trust_forwarded:
        logger.warning(
            "Ignoring x-forwarded-for for SSE from untrusted proxy host: host=%s configured=%s",
            client_host,
            sorted(trusted_proxy_ips),
        )
        return client_host

    candidates = [item.strip() for item in forwarded.split(",") if item.strip()]
    if not candidates:
        return client_host

    for candidate in candidates:
        try:
            ip_address(candidate)
        except ValueError:
            logger.warning(
                "Ignoring malformed x-forwarded-for for SSE: host=%s value=%s",
                client_host,
                forwarded,
            )
            return client_host

    for candidate in reversed(candidates):
        is_trusted_proxy = "*" in trusted_proxy_ips or candidate in trusted_proxy_ips
        if not is_trusted_proxy:
            return candidate

    return candidates[0]


def _is_reconnect_rate_limited(client_key: str) -> bool:
    return not reconnect_rate_limiter.allow(
        key=client_key,
        limit=max(1, settings.sse_reconnect_limit_per_second),
        window_seconds=max(1, settings.sse_rate_limit_window_seconds),
    )


async def _stream_workflow_runs_events(db: Session, workflow_id: int, max_ticks: int) -> AsyncIterator[str]:
    global active_stream_connections
    generation_on_start = _get_stream_generation(workflow_id)
    with active_stream_connections_lock:
        active_stream_connections += 1
    try:
        last_data = ""
        tick_limit = max(1, min(max_ticks, 600))
        for _ in range(tick_limit):
            db.expire_all()
            if _get_stream_generation(workflow_id) != generation_on_start:
                yield "event: end\ndata: stream closed by workflow cancellation\n\n"
                return
            runs = (
                db.query(WorkflowRun)
                .filter(WorkflowRun.workflow_id == workflow_id)
                .order_by(WorkflowRun.id.desc())
                .limit(20)
                .all()
            )
            payload = {
                "workflow_id": workflow_id,
                "runs": [
                    {
                        "id": run.id,
                        "status": run.status,
                        "updated_at": run.updated_at.isoformat(),
                    }
                    for run in runs
                ],
            }
            encoded = json.dumps(payload, ensure_ascii=False)
            if encoded != last_data:
                last_data = encoded
                yield f"event: run_status\ndata: {encoded}\n\n"
            await asyncio.sleep(1.0)
        yield "event: end\ndata: stream closed\n\n"
    except asyncio.CancelledError:
        # Ensure ASGI disconnect/cancellation propagates while keeping cleanup in finally.
        raise
    finally:
        with active_stream_connections_lock:
            active_stream_connections = max(0, active_stream_connections - 1)


@router.get("", response_model=list[WorkflowOut])
def list_workflows(db: Session = Depends(get_db)):
    return db.query(WorkflowDefinition).order_by(WorkflowDefinition.id.desc()).all()


@router.post("", response_model=WorkflowOut)
def create_workflow(payload: WorkflowCreate, request: Request, db: Session = Depends(get_db)):
    workspace_id = _extract_workspace_id(request) or settings.default_workspace_id
    graph_data = payload.graph.model_dump()
    graph_data["meta"] = {"workspace_id": workspace_id}
    workflow = WorkflowDefinition(name=payload.name, description=payload.description, graph=graph_data)
    db.add(workflow)
    db.commit()
    db.refresh(workflow)
    return workflow


@router.post("/validate")
def validate_workflow_graph(graph: WorkflowGraph):
    return {"valid": True, "node_count": len(graph.nodes), "edge_count": len(graph.edges)}


@router.get("/{workflow_id}", response_model=WorkflowOut)
def get_workflow(workflow_id: int, db: Session = Depends(get_db)):
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow not found")
    return workflow


@router.put("/{workflow_id}", response_model=WorkflowOut)
def update_workflow(workflow_id: int, payload: WorkflowUpdate, request: Request, db: Session = Depends(get_db)):
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow not found")
    has_runs = db.query(WorkflowRun.id).filter(WorkflowRun.workflow_id == workflow_id).first() is not None
    if has_runs:
        raise HTTPException(status_code=409, detail="workflow with existing runs cannot be modified")

    workflow.name = payload.name
    workflow.description = payload.description
    workspace_id = _extract_workspace_id(request) or _resolve_workflow_workspace_id(workflow)
    graph_data = payload.graph.model_dump()
    graph_data["meta"] = {"workspace_id": workspace_id}
    workflow.graph = graph_data
    db.commit()
    db.refresh(workflow)
    return workflow


@router.post("/{workflow_id}/runs", response_model=WorkflowRunOut)
def create_workflow_run(workflow_id: int, db: Session = Depends(get_db)):
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow not found")

    try:
        run = engine.create_run(db, workflow)
    except InvalidNodeIdError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run.id).first()
    return run


@router.get("/{workflow_id}/runs", response_model=list[WorkflowRunOut])
def list_workflow_runs(workflow_id: int, db: Session = Depends(get_db)):
    runs = db.query(WorkflowRun).filter(WorkflowRun.workflow_id == workflow_id).order_by(WorkflowRun.id.desc()).all()
    return runs


@router.get("/{workflow_id}/runs/stream")
def stream_workflow_runs(
    workflow_id: int,
    request: Request,
    max_ticks: int = 180,
    db: Session = Depends(get_db),
):
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow not found")
    client_key = _extract_client_key(request)
    if _is_reconnect_rate_limited(client_key):
        raise HTTPException(status_code=429, detail="too many reconnect attempts")

    return StreamingResponse(
        _stream_workflow_runs_events(db=db, workflow_id=workflow_id, max_ticks=max_ticks),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@run_router.get("/stream-metrics/active-connections")
def get_stream_metrics():
    with active_stream_connections_lock:
        active = active_stream_connections
    return {"active_stream_connections": active}


@run_router.get("/{run_id}", response_model=WorkflowRunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    return run


@run_router.get("/{run_id}/events", response_model=RunEventOut)
def get_run_events(run_id: int, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")

    statuses = {node.node_id: node.status for node in run.node_runs}
    return RunEventOut(run_id=run.id, status=run.status, node_statuses=statuses, updated_at=run.updated_at)


def _extract_approver_token(request: Request) -> str:
    bearer = request.headers.get("Authorization", "")
    if bearer.startswith("Bearer "):
        return bearer.removeprefix("Bearer ").strip()
    return request.headers.get("X-Approver-Token", "").strip()


def _extract_approver_role(request: Request) -> str:
    return request.headers.get("X-Approver-Role", "").strip().lower()


def _extract_workspace_id(request: Request) -> str:
    return request.headers.get("X-Workspace-Id", "").strip().lower()


def _resolve_workflow_workspace_id(workflow: WorkflowDefinition | None) -> str:
    if not workflow or not isinstance(workflow.graph, dict):
        return settings.default_workspace_id
    graph_meta = workflow.graph.get("meta")
    if not isinstance(graph_meta, dict):
        return settings.default_workspace_id
    workspace_id = graph_meta.get("workspace_id")
    if isinstance(workspace_id, str) and workspace_id.strip():
        return workspace_id.strip().lower()
    return settings.default_workspace_id


def _build_decider_identity(role: str, workspace: str) -> str:
    safe_role = role.strip().lower() or "unknown"
    safe_workspace = workspace.strip().lower() or "unknown"
    return f"{safe_role}@{safe_workspace}"


def _load_run_or_404(db: Session, run_id: int) -> WorkflowRun:
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    return run


def _is_idempotent_human_gate_decision(
    db: Session,
    *,
    run_id: int,
    node_id: str,
    decision: HumanGateDecisionStatus,
    decided_by: str,
) -> bool:
    latest = (
        db.query(HumanGateDecisionAudit)
        .filter(
            HumanGateDecisionAudit.run_id == run_id,
            HumanGateDecisionAudit.node_id == node_id,
            HumanGateDecisionAudit.decision == decision,
            HumanGateDecisionAudit.decided_by == decided_by,
        )
        .order_by(HumanGateDecisionAudit.decided_at.desc(), HumanGateDecisionAudit.id.desc())
        .first()
    )
    return latest is not None


def _parse_audit_date_range_or_400(date_range: str | None) -> datetime | None:
    if not date_range:
        return None
    value = date_range.strip().lower()
    now = datetime.now(timezone.utc)
    if value == "24h":
        return now - timedelta(hours=24)
    if value == "7d":
        return now - timedelta(days=7)
    if value == "30d":
        return now - timedelta(days=30)
    if value == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    raise HTTPException(status_code=400, detail="invalid date_range")


@run_router.post("/{run_id}/approve", response_model=WorkflowRunOut)
def approve_human_gate(run_id: int, node_id: str, request: Request, db: Session = Depends(get_db)):
    configured_token = settings.human_gate_approver_token.strip()
    if not configured_token:
        raise HTTPException(status_code=403, detail="human gate approver token is not configured")

    provided_token = _extract_approver_token(request)
    if not provided_token:
        raise HTTPException(status_code=401, detail="missing approver token")
    if not hmac.compare_digest(provided_token, configured_token):
        raise HTTPException(status_code=403, detail="invalid approver token")
    approver_role = _extract_approver_role(request)
    if not approver_role:
        raise HTTPException(status_code=403, detail="missing approver role")
    if approver_role not in settings.allowed_human_gate_roles:
        raise HTTPException(status_code=403, detail="insufficient approver role")
    approver_workspace = _extract_workspace_id(request)
    if not approver_workspace:
        raise HTTPException(status_code=403, detail="missing approver workspace")
    if approver_workspace not in settings.allowed_human_gate_workspaces:
        raise HTTPException(status_code=403, detail="insufficient approver workspace")

    decided_by = _build_decider_identity(approver_role, approver_workspace)
    run = _load_run_or_404(db, run_id)
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == run.workflow_id).first()
    workflow_workspace = _resolve_workflow_workspace_id(workflow)
    if workflow_workspace != approver_workspace:
        raise HTTPException(status_code=403, detail="workspace does not match workflow")
    node = db.query(NodeRun).filter(NodeRun.run_id == run_id, NodeRun.node_id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="node not found in run")
    if node.status != "approval_pending":
        if _is_idempotent_human_gate_decision(
            db,
            run_id=run_id,
            node_id=node_id,
            decision="approved",
            decided_by=decided_by,
        ):
            return _load_run_or_404(db, run_id)
        raise HTTPException(status_code=409, detail="node is not approval_pending")
    if run.status not in {"waiting", "running"}:
        if _is_idempotent_human_gate_decision(
            db,
            run_id=run_id,
            node_id=node_id,
            decision="approved",
            decided_by=decided_by,
        ):
            return _load_run_or_404(db, run_id)
        raise HTTPException(status_code=409, detail="run is not waiting for approval")

    try:
        updated = engine.approve_human_gate(
            db,
            run=run,
            node_id=node_id,
            decided_by=decided_by,
            payload={
                "node_id": node_id,
                "decision": "approved",
                "role": approver_role,
                "workspace_id": approver_workspace,
            },
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        if str(exc) == "node is not approval_pending" and _is_idempotent_human_gate_decision(
            db,
            run_id=run_id,
            node_id=node_id,
            decision="approved",
            decided_by=decided_by,
        ):
            return _load_run_or_404(db, run_id)
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return updated


@run_router.post("/{run_id}/reject", response_model=WorkflowRunOut)
def reject_human_gate(run_id: int, node_id: str, request: Request, db: Session = Depends(get_db)):
    configured_token = settings.human_gate_approver_token.strip()
    if not configured_token:
        raise HTTPException(status_code=403, detail="human gate approver token is not configured")

    provided_token = _extract_approver_token(request)
    if not provided_token:
        raise HTTPException(status_code=401, detail="missing approver token")
    if not hmac.compare_digest(provided_token, configured_token):
        raise HTTPException(status_code=403, detail="invalid approver token")
    approver_role = _extract_approver_role(request)
    if not approver_role:
        raise HTTPException(status_code=403, detail="missing approver role")
    if approver_role not in settings.allowed_human_gate_roles:
        raise HTTPException(status_code=403, detail="insufficient approver role")
    approver_workspace = _extract_workspace_id(request)
    if not approver_workspace:
        raise HTTPException(status_code=403, detail="missing approver workspace")
    if approver_workspace not in settings.allowed_human_gate_workspaces:
        raise HTTPException(status_code=403, detail="insufficient approver workspace")

    decided_by = _build_decider_identity(approver_role, approver_workspace)
    run = _load_run_or_404(db, run_id)
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == run.workflow_id).first()
    workflow_workspace = _resolve_workflow_workspace_id(workflow)
    if workflow_workspace != approver_workspace:
        raise HTTPException(status_code=403, detail="workspace does not match workflow")
    node = db.query(NodeRun).filter(NodeRun.run_id == run_id, NodeRun.node_id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="node not found in run")
    if node.status != "approval_pending":
        if _is_idempotent_human_gate_decision(
            db,
            run_id=run_id,
            node_id=node_id,
            decision="rejected",
            decided_by=decided_by,
        ):
            return _load_run_or_404(db, run_id)
        raise HTTPException(status_code=409, detail="node is not approval_pending")
    if run.status not in {"waiting", "running"}:
        if _is_idempotent_human_gate_decision(
            db,
            run_id=run_id,
            node_id=node_id,
            decision="rejected",
            decided_by=decided_by,
        ):
            return _load_run_or_404(db, run_id)
        raise HTTPException(status_code=409, detail="run is not waiting for approval")

    try:
        updated = engine.reject_human_gate(
            db,
            run=run,
            node_id=node_id,
            decided_by=decided_by,
            payload={
                "node_id": node_id,
                "decision": "rejected",
                "role": approver_role,
                "workspace_id": approver_workspace,
            },
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        if str(exc) == "node is not approval_pending" and _is_idempotent_human_gate_decision(
            db,
            run_id=run_id,
            node_id=node_id,
            decision="rejected",
            decided_by=decided_by,
        ):
            return _load_run_or_404(db, run_id)
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return updated


@run_router.get("/{run_id}/human-gate-audits", response_model=HumanGateAuditListOut)
def list_human_gate_audits(
    run_id: int,
    limit: int = 20,
    offset: int = 0,
    status: HumanGateDecisionStatus | None = None,
    date_range: str | None = None,
    db: Session = Depends(get_db),
):
    _load_run_or_404(db, run_id)
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    since = _parse_audit_date_range_or_400(date_range)

    query = db.query(HumanGateDecisionAudit).filter(HumanGateDecisionAudit.run_id == run_id)
    if status:
        query = query.filter(HumanGateDecisionAudit.decision == status)
    if since:
        query = query.filter(HumanGateDecisionAudit.decided_at >= since)

    total_count = query.count()
    records = (
        query.order_by(HumanGateDecisionAudit.decided_at.desc(), HumanGateDecisionAudit.id.desc())
        .offset(safe_offset)
        .limit(safe_limit)
        .all()
    )
    return {
        "items": records,
        "total_count": total_count,
        "limit": safe_limit,
        "offset": safe_offset,
    }


@approval_router.post("/{approval_id}/cancel", response_model=WorkflowRunOut)
def cancel_pending_approval(approval_id: int, request: Request, db: Session = Depends(get_db)):
    configured_token = settings.human_gate_approver_token.strip()
    if not configured_token:
        raise HTTPException(status_code=403, detail="human gate approver token is not configured")

    provided_token = _extract_approver_token(request)
    if not provided_token:
        raise HTTPException(status_code=401, detail="missing approver token")
    if not hmac.compare_digest(provided_token, configured_token):
        raise HTTPException(status_code=403, detail="invalid approver token")

    approver_role = _extract_approver_role(request)
    if not approver_role:
        raise HTTPException(status_code=403, detail="missing approver role")
    if approver_role not in settings.allowed_human_gate_roles:
        raise HTTPException(status_code=403, detail="insufficient approver role")
    approver_workspace = _extract_workspace_id(request)
    if not approver_workspace:
        raise HTTPException(status_code=403, detail="missing approver workspace")
    if approver_workspace not in settings.allowed_human_gate_workspaces:
        raise HTTPException(status_code=403, detail="insufficient approver workspace")

    node = db.query(NodeRun).filter(NodeRun.id == approval_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="approval not found")
    run = _load_run_or_404(db, node.run_id)
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == run.workflow_id).first()
    workflow_workspace = _resolve_workflow_workspace_id(workflow)
    if workflow_workspace != approver_workspace:
        raise HTTPException(status_code=403, detail="workspace does not match workflow")

    try:
        updated = engine.cancel_human_gate_pending(
            db,
            run=run,
            node_id=node.node_id,
            cancelled_by=_build_decider_identity(approver_role, approver_workspace),
            payload={
                "approval_id": approval_id,
                "node_id": node.node_id,
                "decision": "cancelled",
                "role": approver_role,
                "workspace_id": approver_workspace,
            },
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return updated


@run_router.post("/{run_id}/cancel", response_model=WorkflowRunOut)
def cancel_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")

    try:
        updated = engine.cancel_run(db, run)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _bump_stream_generation(updated.workflow_id)
    return updated


@run_router.get("/{run_id}/artifacts/{node_id}")
def get_artifact_chunk(run_id: int, node_id: str, offset: int = 0, limit: int = 16384):
    try:
        chunk, has_more, next_offset = engine.workspace.read_artifact_chunk(
            run_id=run_id,
            node_id=node_id,
            offset=offset,
            limit=limit,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="artifact not found") from exc
    except InvalidNodeIdError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "run_id": run_id,
        "node_id": node_id,
        "offset": max(0, offset),
        "next_offset": next_offset,
        "limit": min(max(1, limit), 256 * 1024),
        "has_more": has_more,
        "content": chunk,
    }


@run_router.get("/{run_id}/constellation")
def get_constellation(run_id: int, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")

    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == run.workflow_id).first()
    nodes = [
        {
            "id": n.node_id,
            "label": n.node_name,
            "status": n.status,
            "sequence": n.sequence,
        }
        for n in sorted(run.node_runs, key=lambda x: x.sequence)
    ]

    links: list[dict[str, str]] = []
    node_ids = {node["id"] for node in nodes}
    graph = workflow.graph if workflow else {}
    edges = graph.get("edges", []) if isinstance(graph, dict) else []
    if isinstance(edges, list):
        for edge in edges:
            if not isinstance(edge, dict):
                continue
            source = edge.get("source")
            target = edge.get("target")
            if source in node_ids and target in node_ids:
                links.append({"source": source, "target": target})

    if not links:
        for idx in range(len(nodes) - 1):
            links.append({"source": nodes[idx]["id"], "target": nodes[idx + 1]["id"]})

    return {"run_id": run.id, "status": run.status, "nodes": nodes, "links": links}
