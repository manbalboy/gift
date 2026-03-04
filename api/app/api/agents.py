from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.agent import AgentDefinition
from app.schemas.agent import AgentCreate, AgentOut, AgentUpdate

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentOut])
def list_agents(db: Session = Depends(get_db)):
    return db.query(AgentDefinition).order_by(AgentDefinition.id.desc()).all()


@router.post("", response_model=AgentOut)
def create_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    exists = db.query(AgentDefinition).filter(AgentDefinition.slug == payload.slug).first()
    if exists:
        raise HTTPException(status_code=409, detail="agent slug already exists")

    agent = AgentDefinition(**payload.model_dump())
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(AgentDefinition).filter(AgentDefinition.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentOut)
def update_agent(agent_id: int, payload: AgentUpdate, db: Session = Depends(get_db)):
    agent = db.query(AgentDefinition).filter(AgentDefinition.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="agent not found")

    conflict = (
        db.query(AgentDefinition)
        .filter(AgentDefinition.slug == payload.slug)
        .filter(AgentDefinition.id != agent_id)
        .first()
    )
    if conflict:
        raise HTTPException(status_code=409, detail="agent slug already exists")

    for key, value in payload.model_dump().items():
        setattr(agent, key, value)

    db.commit()
    db.refresh(agent)
    return agent


@router.delete("/{agent_id}")
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(AgentDefinition).filter(AgentDefinition.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="agent not found")

    db.delete(agent)
    db.commit()
    return {"deleted": True, "id": agent_id}
