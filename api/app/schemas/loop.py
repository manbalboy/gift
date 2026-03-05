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
