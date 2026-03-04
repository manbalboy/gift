import json
import time
import hmac
from collections.abc import Iterator
import logging
from ipaddress import ip_address
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.workflow import NodeRun, WorkflowDefinition, WorkflowRun
from app.schemas.workflow import RunEventOut, WorkflowCreate, WorkflowGraph, WorkflowOut, WorkflowRunOut, WorkflowUpdate
from app.services.rate_limiter import create_sse_reconnect_limiter
from app.services.workflow_engine import WorkflowEngine
from app.services.workspace import InvalidNodeIdError


router = APIRouter(prefix="/workflows", tags=["workflows"])
run_router = APIRouter(prefix="/runs", tags=["runs"])
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


def _stream_workflow_runs_events(db: Session, workflow_id: int, max_ticks: int) -> Iterator[str]:
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
            time.sleep(1.0)
        yield "event: end\ndata: stream closed\n\n"
    finally:
        with active_stream_connections_lock:
            active_stream_connections = max(0, active_stream_connections - 1)


@router.get("", response_model=list[WorkflowOut])
def list_workflows(db: Session = Depends(get_db)):
    return db.query(WorkflowDefinition).order_by(WorkflowDefinition.id.desc()).all()


@router.post("", response_model=WorkflowOut)
def create_workflow(payload: WorkflowCreate, db: Session = Depends(get_db)):
    workflow = WorkflowDefinition(name=payload.name, description=payload.description, graph=payload.graph.model_dump())
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
def update_workflow(workflow_id: int, payload: WorkflowUpdate, db: Session = Depends(get_db)):
    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not workflow:
        raise HTTPException(status_code=404, detail="workflow not found")
    has_runs = db.query(WorkflowRun.id).filter(WorkflowRun.workflow_id == workflow_id).first() is not None
    if has_runs:
        raise HTTPException(status_code=409, detail="workflow with existing runs cannot be modified")

    workflow.name = payload.name
    workflow.description = payload.description
    workflow.graph = payload.graph.model_dump()
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

    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    node = db.query(NodeRun).filter(NodeRun.run_id == run_id, NodeRun.node_id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="node not found in run")
    if node.status != "approval_pending":
        raise HTTPException(status_code=409, detail="node is not approval_pending")
    if run.status not in {"waiting", "running"}:
        raise HTTPException(status_code=409, detail="run is not waiting for approval")

    try:
        updated = engine.approve_human_gate(db, run=run, node_id=node_id)
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
