import asyncio
import base64
import json
import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from collections.abc import AsyncIterator
import logging
from ipaddress import ip_address
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.workflow import HumanGateDecisionAudit, NodeRun, WorkflowDefinition, WorkflowRun
from app.schemas.workflow import (
    HumanGateAuditListOut,
    HumanGateDecisionStatus,
    HumanGateStaleAlertOut,
    HumanGateStatusArtifactAuditListOut,
    RunEventOut,
    WorkflowCreate,
    WorkflowGraph,
    WorkflowOut,
    WorkflowRunOut,
    WorkflowUpdate,
)
from app.services.rate_limiter import create_sse_reconnect_limiter
from app.services.human_gate_audit import as_utc, parse_status_artifact_entries, scan_stale_human_gate_nodes
from app.services.lock_provider import LockProviderFactory
from app.services.workflow_engine import WorkflowEngine
from app.services.workspace import InvalidNodeIdError, WorkspaceArtifactIOError


router = APIRouter(prefix="/workflows", tags=["workflows"])
run_router = APIRouter(prefix="/runs", tags=["runs"])
approval_router = APIRouter(prefix="/approvals", tags=["approvals"])
engine = WorkflowEngine()
active_stream_connections = 0
active_stream_connections_lock = Lock()
workflow_stream_generation: dict[int, int] = {}
workflow_stream_event_sequence: dict[int, int] = {}
workflow_stream_event_buffer: dict[int, list[tuple[int, str, int]]] = {}
reconnect_rate_limiter = create_sse_reconnect_limiter()
logger = logging.getLogger(__name__)
HUMAN_GATE_SESSION_COOKIE = "devflow_human_gate_session"
MAX_STREAM_EVENT_BUFFER_SIZE = 256
STALE_SCAN_LOCK_KEY = -9_001_001
stale_scan_lock_provider = LockProviderFactory.create()


def _get_stream_generation(workflow_id: int) -> int:
    with active_stream_connections_lock:
        return workflow_stream_generation.get(workflow_id, 0)


def _bump_stream_generation(workflow_id: int) -> int:
    with active_stream_connections_lock:
        next_generation = workflow_stream_generation.get(workflow_id, 0) + 1
        workflow_stream_generation[workflow_id] = next_generation
        return next_generation


def _next_stream_event_id(workflow_id: int) -> int:
    with active_stream_connections_lock:
        next_value = workflow_stream_event_sequence.get(workflow_id, 0) + 1
        workflow_stream_event_sequence[workflow_id] = next_value
        return next_value


def _append_stream_event(workflow_id: int, event_id: int, payload: str) -> None:
    payload_size = len(payload.encode("utf-8"))
    max_items = max(1, int(settings.sse_stream_event_buffer_max_items or MAX_STREAM_EVENT_BUFFER_SIZE))
    max_bytes = max(1, int(settings.sse_stream_event_buffer_max_bytes or 262_144))
    with active_stream_connections_lock:
        buffered = workflow_stream_event_buffer.setdefault(workflow_id, [])
        buffered.append((event_id, payload, payload_size))

        total_bytes = sum(item[2] for item in buffered)
        while buffered and (len(buffered) > max_items or total_bytes > max_bytes):
            _event_id, _event_payload, removed_size = buffered.pop(0)
            total_bytes -= removed_size


def _stream_events_after(workflow_id: int, last_event_id: int) -> list[tuple[int, str]]:
    with active_stream_connections_lock:
        buffered = workflow_stream_event_buffer.get(workflow_id, [])
        return [(event_id, payload) for event_id, payload, _size in buffered if event_id > last_event_id]


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


async def _stream_workflow_runs_events(
    db: Session,
    workflow_id: int,
    max_ticks: int,
    last_event_id: int | None = None,
) -> AsyncIterator[str]:
    global active_stream_connections
    generation_on_start = _get_stream_generation(workflow_id)
    heartbeat_interval = max(1, int(settings.sse_heartbeat_interval_seconds))
    with active_stream_connections_lock:
        active_stream_connections += 1
    try:
        last_data = ""
        safe_last_event_id = -1 if last_event_id is None else max(-1, int(last_event_id))
        if safe_last_event_id >= 0:
            replay_items = _stream_events_after(workflow_id, safe_last_event_id)
            for replay_event_id, replay_payload in replay_items:
                yield f"id: {replay_event_id}\nevent: run_status\ndata: {replay_payload}\n\n"
            if replay_items:
                last_data = replay_items[-1][1]
        tick_limit = max(1, min(max_ticks, 600))
        for tick in range(tick_limit):
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
                event_id = _next_stream_event_id(workflow_id)
                _append_stream_event(workflow_id, event_id, encoded)
                yield f"id: {event_id}\nevent: run_status\ndata: {encoded}\n\n"
            elif tick % heartbeat_interval == 0:
                yield f": keepalive {datetime.now(timezone.utc).isoformat()}\n\n"
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


@router.post("/auth/human-gate-session")
def create_human_gate_session(response: Response):
    allowed_roles = settings.allowed_human_gate_roles
    allowed_workspaces = settings.allowed_human_gate_workspaces
    if not allowed_roles or not allowed_workspaces:
        raise HTTPException(status_code=403, detail="human gate session is not available")

    role = "reviewer" if "reviewer" in allowed_roles else sorted(allowed_roles)[0]
    default_workspace = settings.default_workspace_id.strip().lower()
    workspace_id = default_workspace if default_workspace in allowed_workspaces else sorted(allowed_workspaces)[0]

    ttl_seconds = max(60, settings.human_gate_session_ttl_seconds)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    encoded_session = _encode_human_gate_session_cookie(
        role=role,
        workspace_id=workspace_id,
        expires_at=expires_at,
    )
    response.set_cookie(
        key=HUMAN_GATE_SESSION_COOKIE,
        value=encoded_session,
        max_age=ttl_seconds,
        httponly=True,
        secure=settings.human_gate_session_secure_cookie,
        samesite="lax",
        path="/api",
    )
    return {
        "ok": True,
        "role": role,
        "workspace_id": workspace_id,
        "expires_at": expires_at.isoformat(),
    }


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
def create_workflow_run(workflow_id: int, request: Request, db: Session = Depends(get_db)):
    _authorize_workflow_control_request(request)
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
    last_event_id: int | None = None,
    db: Session = Depends(get_db),
):
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow not found")
    client_key = _extract_client_key(request)
    if _is_reconnect_rate_limited(client_key):
        raise HTTPException(status_code=429, detail="too many reconnect attempts")
    header_last_event_id = request.headers.get("last-event-id", "").strip()
    if header_last_event_id and not last_event_id:
        try:
            parsed = int(header_last_event_id)
        except ValueError:
            parsed = 0
        last_event_id = parsed if parsed >= 0 else None

    return StreamingResponse(
        _stream_workflow_runs_events(
            db=db,
            workflow_id=workflow_id,
            max_ticks=max_ticks,
            last_event_id=last_event_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
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


def _extract_workflow_control_token(request: Request) -> str:
    bearer = request.headers.get("Authorization", "")
    if bearer.startswith("Bearer "):
        return bearer.removeprefix("Bearer ").strip()
    return request.headers.get("X-Workflow-Control-Token", "").strip()


def _extract_workflow_control_role(request: Request) -> str:
    return request.headers.get("X-Workflow-Control-Role", "").strip().lower()


def _authorize_workflow_control_request(request: Request) -> str:
    configured_token = settings.workflow_control_token.strip()
    allowed_roles = settings.allowed_workflow_control_roles
    provided_token = _extract_workflow_control_token(request)
    provided_role = _extract_workflow_control_role(request)

    if configured_token:
        if not provided_token:
            raise HTTPException(status_code=401, detail="missing workflow control token")
        if not hmac.compare_digest(provided_token, configured_token):
            raise HTTPException(status_code=403, detail="invalid workflow control token")

    if allowed_roles:
        if not provided_role:
            raise HTTPException(status_code=403, detail="missing workflow control role")
        if provided_role not in allowed_roles:
            raise HTTPException(status_code=403, detail="insufficient workflow control role")

    return provided_role or "system"


def _session_signing_secret() -> str:
    configured = settings.human_gate_session_secret.strip()
    if configured:
        return configured
    fallback = settings.human_gate_approver_token.strip()
    if fallback:
        return fallback
    return "devflow-human-gate-local-session-secret"


def _encode_human_gate_session_cookie(*, role: str, workspace_id: str, expires_at: datetime) -> str:
    payload = {
        "role": role,
        "workspace_id": workspace_id,
        "exp": int(expires_at.timestamp()),
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    signature = hmac.new(_session_signing_secret().encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def _decode_human_gate_session_cookie(request: Request) -> dict | None:
    token = request.cookies.get(HUMAN_GATE_SESSION_COOKIE, "").strip()
    if not token or "." not in token:
        return None

    encoded, provided_sig = token.rsplit(".", maxsplit=1)
    expected_sig = hmac.new(_session_signing_secret().encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(provided_sig, expected_sig):
        return None

    missing_padding = (-len(encoded)) % 4
    encoded_padded = f"{encoded}{'=' * missing_padding}"
    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded_padded.encode("ascii")).decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None

    if not isinstance(payload, dict):
        return None
    role = payload.get("role")
    workspace_id = payload.get("workspace_id")
    exp = payload.get("exp")
    if not isinstance(role, str) or not role.strip():
        return None
    if not isinstance(workspace_id, str) or not workspace_id.strip():
        return None
    if not isinstance(exp, int):
        return None
    now = int(datetime.now(timezone.utc).timestamp())
    if exp <= now:
        return None
    return payload


def _extract_approver_role(request: Request) -> str:
    role = request.headers.get("X-Approver-Role", "").strip().lower()
    if role:
        return role
    claims = _decode_human_gate_session_cookie(request)
    if not claims:
        return ""
    value = claims.get("role")
    return value.strip().lower() if isinstance(value, str) else ""


def _extract_workspace_id(request: Request) -> str:
    workspace = request.headers.get("X-Workspace-Id", "").strip().lower()
    if workspace:
        return workspace
    claims = _decode_human_gate_session_cookie(request)
    if not claims:
        return ""
    value = claims.get("workspace_id")
    return value.strip().lower() if isinstance(value, str) else ""


def _authorize_human_gate_request(request: Request) -> tuple[str, str]:
    configured_token = settings.human_gate_approver_token.strip()
    provided_token = _extract_approver_token(request)
    session_claims = _decode_human_gate_session_cookie(request)

    if not configured_token and not session_claims:
        raise HTTPException(status_code=403, detail="human gate approver token is not configured")
    if configured_token and not session_claims:
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
    return approver_role, approver_workspace


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


def _load_run_or_404(db: Session, run_id: int, *, for_update: bool = False) -> WorkflowRun:
    query = db.query(WorkflowRun).filter(WorkflowRun.id == run_id)
    if for_update:
        query = query.with_for_update()
    run = query.first()
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


def _parse_timezone_offset_or_400(tz_offset_minutes: int | None) -> int:
    if tz_offset_minutes is None:
        return 0
    if tz_offset_minutes < -14 * 60 or tz_offset_minutes > 14 * 60:
        raise HTTPException(status_code=400, detail="invalid tz_offset_minutes")
    return tz_offset_minutes


def _parse_audit_date_range_or_400(date_range: str | None, tz_offset_minutes: int = 0) -> datetime | None:
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
        local_now = now - timedelta(minutes=tz_offset_minutes)
        local_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
        return local_midnight + timedelta(minutes=tz_offset_minutes)
    raise HTTPException(status_code=400, detail="invalid date_range")


@run_router.post("/{run_id}/approve", response_model=WorkflowRunOut)
def approve_human_gate(run_id: int, node_id: str, request: Request, db: Session = Depends(get_db)):
    approver_role, approver_workspace = _authorize_human_gate_request(request)
    decided_by = _build_decider_identity(approver_role, approver_workspace)
    run = _load_run_or_404(db, run_id, for_update=True)
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == run.workflow_id).first()
    workflow_workspace = _resolve_workflow_workspace_id(workflow)
    if workflow_workspace != approver_workspace:
        raise HTTPException(status_code=403, detail="workspace does not match workflow")
    node = (
        db.query(NodeRun)
        .filter(NodeRun.run_id == run_id, NodeRun.node_id == node_id)
        .with_for_update()
        .first()
    )
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
    approver_role, approver_workspace = _authorize_human_gate_request(request)
    decided_by = _build_decider_identity(approver_role, approver_workspace)
    run = _load_run_or_404(db, run_id, for_update=True)
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == run.workflow_id).first()
    workflow_workspace = _resolve_workflow_workspace_id(workflow)
    if workflow_workspace != approver_workspace:
        raise HTTPException(status_code=403, detail="workspace does not match workflow")
    node = (
        db.query(NodeRun)
        .filter(NodeRun.run_id == run_id, NodeRun.node_id == node_id)
        .with_for_update()
        .first()
    )
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
    tz_offset_minutes: int | None = None,
    db: Session = Depends(get_db),
):
    _load_run_or_404(db, run_id)
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    safe_tz_offset_minutes = _parse_timezone_offset_or_400(tz_offset_minutes)
    since = _parse_audit_date_range_or_400(date_range, safe_tz_offset_minutes)

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


@run_router.get("/{run_id}/status-audits", response_model=HumanGateStatusArtifactAuditListOut)
def list_status_artifact_human_gate_audits(
    run_id: int,
    limit: int = 20,
    offset: int = 0,
    status: HumanGateDecisionStatus | None = None,
    date_range: str | None = None,
    tz_offset_minutes: int | None = None,
    db: Session = Depends(get_db),
):
    _load_run_or_404(db, run_id)
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    safe_tz_offset_minutes = _parse_timezone_offset_or_400(tz_offset_minutes)
    since = _parse_audit_date_range_or_400(date_range, safe_tz_offset_minutes)

    artifact_path = engine.workspace.root / "main" / "runs" / str(run_id) / "status.md"
    entries = parse_status_artifact_entries(run_id=run_id, artifact_path=artifact_path)
    if status:
        entries = [entry for entry in entries if entry["decision"] == status]
    if since:
        entries = [entry for entry in entries if as_utc(entry["decided_at"]) >= since]

    ordered_entries = sorted(entries, key=lambda item: item["decided_at"], reverse=True)
    total_count = len(ordered_entries)
    items = ordered_entries[safe_offset : safe_offset + safe_limit]
    return {"items": items, "total_count": total_count, "limit": safe_limit, "offset": safe_offset}


@run_router.post("/human-gate-alerts/scan", response_model=list[HumanGateStaleAlertOut])
def scan_stale_human_gate_alerts(
    stale_hours: int | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    configured_hours = max(1, int(settings.workflow_human_gate_stale_hours))
    safe_stale_hours = max(1, int(stale_hours or configured_hours))
    scan_lock = stale_scan_lock_provider.get_run_lock(STALE_SCAN_LOCK_KEY)
    if not scan_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="human gate stale scan lock is busy")
    try:
        return scan_stale_human_gate_nodes(
            db,
            stale_hours=safe_stale_hours,
            limit=limit,
        )
    finally:
        scan_lock.release()


@approval_router.post("/{approval_id}/cancel", response_model=WorkflowRunOut)
def cancel_pending_approval(approval_id: int, request: Request, db: Session = Depends(get_db)):
    approver_role, approver_workspace = _authorize_human_gate_request(request)
    cancelled_by = _build_decider_identity(approver_role, approver_workspace)

    node = db.query(NodeRun).filter(NodeRun.id == approval_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="approval not found")
    run = _load_run_or_404(db, node.run_id)
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == run.workflow_id).first()
    workflow_workspace = _resolve_workflow_workspace_id(workflow)
    if workflow_workspace != approver_workspace:
        raise HTTPException(status_code=403, detail="workspace does not match workflow")
    if node.status != "approval_pending":
        if _is_idempotent_human_gate_decision(
            db,
            run_id=run.id,
            node_id=node.node_id,
            decision="cancelled",
            decided_by=cancelled_by,
        ):
            return _load_run_or_404(db, run.id)
        raise HTTPException(status_code=409, detail="node is not approval_pending")
    if run.status not in {"waiting", "running"}:
        if _is_idempotent_human_gate_decision(
            db,
            run_id=run.id,
            node_id=node.node_id,
            decision="cancelled",
            decided_by=cancelled_by,
        ):
            return _load_run_or_404(db, run.id)
        raise HTTPException(status_code=409, detail="run is not waiting for approval")

    try:
        updated = engine.cancel_human_gate_pending(
            db,
            run=run,
            node_id=node.node_id,
            cancelled_by=cancelled_by,
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
        if str(exc) == "node is not approval_pending" and _is_idempotent_human_gate_decision(
            db,
            run_id=run.id,
            node_id=node.node_id,
            decision="cancelled",
            decided_by=cancelled_by,
        ):
            return _load_run_or_404(db, run.id)
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return updated


@run_router.post("/{run_id}/cancel", response_model=WorkflowRunOut)
def cancel_run(run_id: int, request: Request, db: Session = Depends(get_db)):
    _authorize_workflow_control_request(request)
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


@run_router.post("/{run_id}/resume", response_model=WorkflowRunOut)
def resume_run(run_id: int, request: Request, db: Session = Depends(get_db)):
    _authorize_workflow_control_request(request)
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")

    try:
        updated = engine.resume_run(db, run)
    except RuntimeError as exc:
        detail = str(exc)
        if detail == "run lock is busy":
            latest = _load_run_or_404(db, run_id)
            if latest.status in {"running", "done", "failed"}:
                return latest
        raise HTTPException(status_code=409, detail=detail) from exc
    except ValueError as exc:
        detail = str(exc)
        latest = _load_run_or_404(db, run_id)
        if detail == "run is not paused" and latest.status == "running":
            return latest
        if detail.startswith("resume failed:") and latest.status == "failed":
            _bump_stream_generation(latest.workflow_id)
            return latest
        raise HTTPException(status_code=409, detail=detail) from exc
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
    except WorkspaceArtifactIOError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

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
