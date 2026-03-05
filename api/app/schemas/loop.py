from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class LoopStatusOut(BaseModel):
    mode: Literal["idle", "running", "paused", "stopped", "safe_mode"]
    current_stage: str | None = None
    cycle_count: int
    emitted_alert_count: int
    pending_instruction_count: int = 0
    quality_score: int | None = None
    started_at: datetime | None = None
    updated_at: datetime


class LoopInstructionIn(BaseModel):
    instruction: str = Field(min_length=1, max_length=2000)


class LoopInstructionEnqueueOut(BaseModel):
    instruction_id: str
    status: LoopStatusOut


class LoopInstructionStatusOut(BaseModel):
    id: str
    instruction: str
    status: Literal["queued", "applied", "dropped"]
    queued_at: datetime
    updated_at: datetime
    applied_at: datetime | None = None
    dropped_reason: str | None = None


LoopComponentName = Literal["analyzer", "evaluator", "planner", "executor"]


class LoopControlPolicyIn(BaseModel):
    max_loop_count: int = Field(default=120, ge=1, le=10000)
    max_iteration_budget: int = Field(default=8000, ge=1, le=1_000_000)
    duplicate_change_threshold: int = Field(default=3, ge=1, le=100)
    safe_mode_min_quality: int = Field(default=35, ge=0, le=100)


class LoopControlPolicyOut(LoopControlPolicyIn):
    id: int
    workflow_id: int | None = None
    created_at: datetime
    updated_at: datetime


class LoopMemoryWriteIn(BaseModel):
    memory_key: str = Field(min_length=1, max_length=120)
    memory_value: str = Field(min_length=1, max_length=4000)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    stage: LoopComponentName


class LoopMemoryEntryOut(BaseModel):
    id: int
    run_id: int | None = None
    stage: LoopComponentName
    memory_key: str
    memory_value: str
    confidence: float
    created_at: datetime


class LoopComponentMockIn(BaseModel):
    run_id: int | None = Field(default=None, ge=1)
    summary: str = Field(min_length=1, max_length=2000)
    context: str | None = Field(default=None, max_length=4000)
    max_loop_count: int = Field(default=120, ge=1, le=10000)
    budget_remaining: int = Field(default=5000, ge=0, le=1_000_000)
    previous_score: int | None = Field(default=None, ge=0, le=100)


class LoopComponentMockOut(BaseModel):
    component: LoopComponentName
    accepted: bool
    status: Literal["ok", "needs_review", "halted"]
    score: int = Field(ge=0, le=100)
    next_component: LoopComponentName | None = None
    reason: str
    recommended_action: str
    created_at: datetime
