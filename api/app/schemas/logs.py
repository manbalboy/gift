from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


class SystemAlertOut(BaseModel):
    id: str
    created_at: datetime
    level: Literal["warning", "error", "info"]
    code: str
    message: str
    source: str
    context: dict[str, Any]
