from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class LoopStatusOut(BaseModel):
    mode: Literal["idle", "running", "paused", "stopped"]
    current_stage: str | None = None
    cycle_count: int
    emitted_alert_count: int
    quality_score: int | None = None
    started_at: datetime | None = None
    updated_at: datetime
