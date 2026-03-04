from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.workflows import engine
from app.db.session import get_db
from app.models.workflow import WorkflowDefinition
from app.schemas.webhook import WebhookEventOut

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _normalize_github_event(event_name: str, payload: dict) -> tuple[str, bool, str]:
    if event_name == "pull_request":
        action = str(payload.get("action", ""))
        should_trigger = action in {"opened", "reopened", "synchronize", "ready_for_review"}
        return "pull_request", should_trigger, f"github.pull_request.{action or 'unknown'}"

    if event_name in {"check_suite", "check_run"}:
        conclusion = payload.get("check_suite", {}).get("conclusion") or payload.get("check_run", {}).get("conclusion")
        normalized = str(conclusion or "requested")
        should_trigger = normalized in {"success", "failure", "timed_out", "cancelled"}
        return "ci", should_trigger, f"github.{event_name}.{normalized}"

    if event_name == "deployment_status":
        state = str(payload.get("deployment_status", {}).get("state", "unknown"))
        should_trigger = state in {"success", "failure", "error"}
        return "preview", should_trigger, f"github.deployment_status.{state}"

    return "generic", False, f"github.{event_name}"


def _normalize_generic_event(payload: dict) -> tuple[str, bool, str]:
    event_type = str(payload.get("event_type", "generic.unknown"))
    if event_type.startswith("ci."):
        return "ci", event_type.endswith("completed"), event_type
    if event_type.startswith("preview."):
        return "preview", event_type.endswith("ready") or event_type.endswith("deployed"), event_type
    if event_type.startswith("issue."):
        return "issue", False, event_type
    return "generic", False, event_type


@router.post("/dev-integration", response_model=WebhookEventOut)
async def receive_dev_integration_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="invalid webhook payload")

    github_event = request.headers.get("X-GitHub-Event")
    provider = "github" if github_event else str(payload.get("provider", "generic"))

    if github_event:
        category, should_trigger, normalized_event = _normalize_github_event(github_event, payload)
    else:
        category, should_trigger, normalized_event = _normalize_generic_event(payload)

    workflow_id_raw = payload.get("workflow_id")
    workflow_id = int(workflow_id_raw) if isinstance(workflow_id_raw, int) or str(workflow_id_raw).isdigit() else None

    triggered_run_id: int | None = None
    if should_trigger and workflow_id is not None:
        workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
        if workflow:
            run = engine.create_run(db, workflow)
            triggered_run_id = run.id

    return WebhookEventOut(
        accepted=True,
        provider=provider,
        category=category,
        event_type=normalized_event,
        workflow_id=workflow_id,
        triggered=triggered_run_id is not None,
        triggered_run_id=triggered_run_id,
    )
