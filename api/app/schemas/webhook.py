from pydantic import BaseModel


class WebhookEventOut(BaseModel):
    accepted: bool
    provider: str
    category: str
    event_type: str
    workflow_id: int | None = None
    triggered: bool
    triggered_run_id: int | None = None
