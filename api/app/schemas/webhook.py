from datetime import datetime

from pydantic import BaseModel


class WebhookEventOut(BaseModel):
    accepted: bool
    provider: str
    category: str
    event_type: str
    workflow_id: int | None = None
    warning_code: str | None = None
    warning_message: str | None = None
    triggered: bool
    triggered_run_id: int | None = None


class WebhookBlockedEventOut(BaseModel):
    id: str
    created_at: datetime
    reason: str
    client_ip: str
    provider: str
    event_type: str
    detail: str
