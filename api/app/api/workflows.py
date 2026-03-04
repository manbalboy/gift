import json
import time
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.workflow import WorkflowDefinition, WorkflowRun
from app.schemas.workflow import RunEventOut, WorkflowCreate, WorkflowOut, WorkflowRunOut, WorkflowUpdate
from app.services.rate_limiter import create_sse_reconnect_limiter
from app.services.workflow_engine import WorkflowEngine
from app.services.workspace import InvalidNodeIdError


router = APIRouter(prefix="/workflows", tags=["workflows"])
run_router = APIRouter(prefix="/runs", tags=["runs"])
engine = WorkflowEngine()
active_stream_connections = 0
reconnect_rate_limiter = create_sse_reconnect_limiter()


def _extract_client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _is_reconnect_rate_limited(client_key: str) -> bool:
    return not reconnect_rate_limiter.allow(
        key=client_key,
        limit=max(1, settings.sse_reconnect_limit_per_second),
        window_seconds=max(1, settings.sse_rate_limit_window_seconds),
    )


def _stream_workflow_runs_events(db: Session, workflow_id: int, max_ticks: int) -> Iterator[str]:
    global active_stream_connections
    active_stream_connections += 1
    try:
        last_data = ""
        tick_limit = max(1, min(max_ticks, 600))
        for _ in range(tick_limit):
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
    return [engine.refresh_run(db, run) for run in runs]


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


@run_router.get("/{run_id}", response_model=WorkflowRunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    return engine.refresh_run(db, run)


@run_router.get("/{run_id}/events", response_model=RunEventOut)
def get_run_events(run_id: int, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    run = engine.refresh_run(db, run)

    statuses = {node.node_id: node.status for node in run.node_runs}
    return RunEventOut(run_id=run.id, status=run.status, node_statuses=statuses, updated_at=run.updated_at)


@run_router.get("/{run_id}/constellation")
def get_constellation(run_id: int, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="run not found")

    run = engine.refresh_run(db, run)
    nodes = [
        {
            "id": n.node_id,
            "label": n.node_name,
            "status": n.status,
            "sequence": n.sequence,
        }
        for n in sorted(run.node_runs, key=lambda x: x.sequence)
    ]

    links = []
    for idx in range(len(nodes) - 1):
        links.append({"source": nodes[idx]["id"], "target": nodes[idx + 1]["id"]})

    return {"run_id": run.id, "status": run.status, "nodes": nodes, "links": links}
