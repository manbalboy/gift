from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.workflow import WorkflowDefinition, WorkflowRun
from app.schemas.workflow import RunEventOut, WorkflowCreate, WorkflowOut, WorkflowRunOut, WorkflowUpdate
from app.services.workflow_engine import WorkflowEngine
from app.services.workspace import InvalidNodeIdError


router = APIRouter(prefix="/workflows", tags=["workflows"])
run_router = APIRouter(prefix="/runs", tags=["runs"])
engine = WorkflowEngine()


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
