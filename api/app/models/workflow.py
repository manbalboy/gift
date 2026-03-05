from datetime import datetime, timezone
import re

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.core.config import settings


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class WorkflowDefinition(Base):
    __tablename__ = "workflow_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    graph: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    runs: Mapped[list["WorkflowRun"]] = relationship(back_populates="workflow", cascade="all, delete-orphan")


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workflow_id: Mapped[int] = mapped_column(ForeignKey("workflow_definitions.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    workflow: Mapped[WorkflowDefinition] = relationship(back_populates="runs")
    node_runs: Mapped[list["NodeRun"]] = relationship(back_populates="workflow_run", cascade="all, delete-orphan")
    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="workflow_run", cascade="all, delete-orphan")
    decision_audits: Mapped[list["HumanGateDecisionAudit"]] = relationship(
        back_populates="workflow_run",
        cascade="all, delete-orphan",
    )


class NodeRun(Base):
    __tablename__ = "node_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("workflow_runs.id"), index=True)
    node_id: Mapped[str] = mapped_column(String(120), index=True)
    node_name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    log: Mapped[str] = mapped_column(Text, default="")
    artifact_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    workflow_run: Mapped[WorkflowRun] = relationship(back_populates="node_runs")
    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="node_run", cascade="all, delete-orphan")

    @property
    def attempt_count(self) -> int:
        text = (self.log or "").strip()
        if not text:
            return 0
        matches = re.findall(r"\[attempt\s+(\d+)/(\d+)\]", text, flags=re.IGNORECASE)
        if matches:
            return max(int(current) for current, _ in matches)
        if self.status in {"done", "failed", "running", "paused"}:
            return 1
        return 0

    @property
    def attempt_limit(self) -> int:
        limit = int(getattr(settings, "workflow_node_max_retries", 3))
        if limit < 1:
            return 1
        return limit

    @property
    def error_snippet(self) -> str:
        lines = (self.log or "").splitlines()
        if not lines:
            return ""
        snippet = lines[-40:]
        return "\n".join(snippet)


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("workflow_runs.id"), index=True)
    node_run_id: Mapped[int | None] = mapped_column(ForeignKey("node_runs.id"), nullable=True, index=True)
    node_id: Mapped[str] = mapped_column(String(120), index=True)
    category: Mapped[str] = mapped_column(String(40), default="artifact", index=True)
    path: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    workflow_run: Mapped[WorkflowRun] = relationship(back_populates="artifacts")
    node_run: Mapped[NodeRun | None] = relationship(back_populates="artifacts")


class HumanGateDecisionAudit(Base):
    __tablename__ = "human_gate_decision_audits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("workflow_runs.id"), index=True)
    node_id: Mapped[str] = mapped_column(String(120), index=True)
    decision: Mapped[str] = mapped_column(String(32), index=True)
    decided_by: Mapped[str] = mapped_column(String(120))
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)

    workflow_run: Mapped[WorkflowRun] = relationship(back_populates="decision_audits")
