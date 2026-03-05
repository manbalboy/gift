import hashlib
import hmac
import json
import logging
from collections import deque
from datetime import datetime, timezone
from ipaddress import ip_address
from threading import Lock
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.api.workflows import engine
from app.db.session import get_db
from app.models.workflow import WorkflowDefinition
from app.schemas.webhook import WebhookBlockedEventOut, WebhookEventOut
from app.services.rate_limiter import LocalSlidingWindowRateLimiter

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
MAX_WEBHOOK_PAYLOAD_BYTES = 5 * 1024 * 1024
MAX_BLOCKED_EVENTS = 100
webhook_rate_limiter = LocalSlidingWindowRateLimiter()
blocked_events: deque[dict] = deque(maxlen=MAX_BLOCKED_EVENTS)
blocked_events_lock = Lock()
logger = logging.getLogger(__name__)


def _record_blocked_event(
    *,
    reason: str,
    client_ip: str,
    provider: str,
    event_type: str,
    detail: str,
) -> None:
    with blocked_events_lock:
        blocked_events.appendleft(
            {
                "id": str(uuid.uuid4()),
                "created_at": datetime.now(timezone.utc),
                "reason": reason,
                "client_ip": client_ip,
                "provider": provider or "unknown",
                "event_type": event_type or "unknown",
                "detail": detail,
            }
        )


def _extract_client_key(request: Request) -> str:
    client_host = request.client.host if request.client and request.client.host else "unknown"
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if not forwarded:
        return client_host

    trusted_proxy_ips = settings.trusted_webhook_proxy_ips
    trust_forwarded = "*" in trusted_proxy_ips or client_host in trusted_proxy_ips
    if not trust_forwarded:
        logger.warning(
            "Ignoring x-forwarded-for from untrusted proxy host: host=%s configured=%s",
            client_host,
            sorted(trusted_proxy_ips),
        )
        return client_host

    candidates = [item.strip() for item in forwarded.split(",") if item.strip()]
    if not candidates:
        return client_host
    for candidate in candidates:
        try:
            ip_address(candidate)
        except ValueError:
            logger.warning("Ignoring malformed x-forwarded-for header: host=%s value=%s", client_host, forwarded)
            return client_host

    for candidate in reversed(candidates):
        is_trusted_proxy = "*" in trusted_proxy_ips or candidate in trusted_proxy_ips
        if not is_trusted_proxy:
            return candidate

    return candidates[0]


def _is_allowed_source_ip(client_key: str) -> bool:
    allowed_ips = settings.allowed_webhook_source_ips
    if not allowed_ips:
        return True
    if "*" in allowed_ips:
        return True
    return client_key in allowed_ips


def _parse_workflow_id(value: object) -> int | None:
    if type(value) is int:
        return value if value > 0 else None

    if type(value) is str:
        trimmed = value.strip()
        if trimmed.isdigit():
            parsed = int(trimmed)
            return parsed if parsed > 0 else None

    return None


def reset_webhook_limiter_for_tests() -> None:
    webhook_rate_limiter.reset()
    with blocked_events_lock:
        blocked_events.clear()


@router.get("/blocked-events", response_model=list[WebhookBlockedEventOut])
def list_blocked_webhook_events(limit: int = 20):
    safe_limit = max(1, min(limit, 50))
    with blocked_events_lock:
        return list(blocked_events)[:safe_limit]


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


def _extract_shared_secret(request: Request) -> str:
    bearer = request.headers.get("Authorization", "")
    if bearer.startswith("Bearer "):
        return bearer.removeprefix("Bearer ").strip()
    return request.headers.get("X-API-Secret", "").strip()


def _verify_github_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    provided = signature_header.removeprefix("sha256=").strip()
    return hmac.compare_digest(expected, provided)


@router.post("/dev-integration", response_model=WebhookEventOut)
async def receive_dev_integration_webhook(request: Request, db: Session = Depends(get_db)):
    client_key = _extract_client_key(request)
    provider_hint = request.headers.get("X-GitHub-Event") and "github" or "generic"
    event_hint = request.headers.get("X-GitHub-Event", "unknown")
    if not _is_allowed_source_ip(client_key):
        _record_blocked_event(
            reason="ip_not_allowed",
            client_ip=client_key,
            provider=provider_hint,
            event_type=event_hint,
            detail="forbidden webhook source ip",
        )
        raise HTTPException(status_code=403, detail="forbidden webhook source ip")

    allowed = webhook_rate_limiter.allow(
        key=client_key,
        limit=max(1, int(settings.webhook_rate_limit_per_window)),
        window_seconds=max(0.2, float(settings.webhook_rate_limit_window_seconds)),
    )
    if not allowed:
        _record_blocked_event(
            reason="rate_limited",
            client_ip=client_key,
            provider=provider_hint,
            event_type=event_hint,
            detail="too many webhook requests",
        )
        raise HTTPException(status_code=429, detail="too many webhook requests")

    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_WEBHOOK_PAYLOAD_BYTES:
        raise HTTPException(status_code=413, detail="payload too large")

    collected = bytearray()
    async for chunk in request.stream():
        if not chunk:
            continue
        collected.extend(chunk)
        if len(collected) > MAX_WEBHOOK_PAYLOAD_BYTES:
            raise HTTPException(status_code=413, detail="payload too large")
    raw_body = bytes(collected)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="invalid webhook payload") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=422, detail="invalid webhook payload")

    github_event = request.headers.get("X-GitHub-Event")
    provider = "github" if github_event else str(payload.get("provider", "generic"))

    if github_event:
        github_secret = settings.github_webhook_secret.strip()
        if not github_secret:
            _record_blocked_event(
                reason="missing_server_secret",
                client_ip=client_key,
                provider="github",
                event_type=github_event,
                detail="github webhook secret is not configured",
            )
            raise HTTPException(status_code=403, detail="github webhook secret is not configured")
        signature = request.headers.get("X-Hub-Signature-256", "").strip()
        if not signature or not signature.startswith("sha256="):
            _record_blocked_event(
                reason="missing_signature",
                client_ip=client_key,
                provider="github",
                event_type=github_event,
                detail="missing github signature",
            )
            raise HTTPException(status_code=401, detail="missing github signature")
        if not _verify_github_signature(raw_body=raw_body, signature_header=signature, secret=github_secret):
            _record_blocked_event(
                reason="invalid_signature",
                client_ip=client_key,
                provider="github",
                event_type=github_event,
                detail="invalid github signature",
            )
            raise HTTPException(status_code=401, detail="invalid github signature")
        category, should_trigger, normalized_event = _normalize_github_event(github_event, payload)
    else:
        generic_secret = settings.generic_webhook_secret.strip()
        if not generic_secret:
            _record_blocked_event(
                reason="missing_server_secret",
                client_ip=client_key,
                provider="generic",
                event_type="unknown",
                detail="generic webhook secret is not configured",
            )
            raise HTTPException(status_code=403, detail="generic webhook secret is not configured")
        provided_secret = _extract_shared_secret(request)
        if not provided_secret:
            _record_blocked_event(
                reason="missing_secret",
                client_ip=client_key,
                provider="generic",
                event_type="unknown",
                detail="missing webhook secret",
            )
            raise HTTPException(status_code=401, detail="missing webhook secret")
        if not hmac.compare_digest(provided_secret, generic_secret):
            _record_blocked_event(
                reason="invalid_secret",
                client_ip=client_key,
                provider="generic",
                event_type="unknown",
                detail="invalid webhook secret",
            )
            raise HTTPException(status_code=401, detail="invalid webhook secret")
        category, should_trigger, normalized_event = _normalize_generic_event(payload)

    workflow_id_raw = payload.get("workflow_id")
    if type(workflow_id_raw) is bool:
        logger.warning(
            "Rejected webhook workflow_id with boolean type: provider=%s event_type=%s",
            provider,
            normalized_event,
        )
        raise HTTPException(status_code=422, detail="workflow_id must be an integer")
    workflow_id = _parse_workflow_id(workflow_id_raw)
    if workflow_id_raw is not None and workflow_id is None:
        logger.warning(
            "Rejected webhook workflow_id due to parse failure: provider=%s event_type=%s raw_type=%s raw_value=%r",
            provider,
            normalized_event,
            type(workflow_id_raw).__name__,
            workflow_id_raw,
        )
        raise HTTPException(status_code=422, detail="workflow_id must be a positive integer")

    workflow: WorkflowDefinition | None = None
    if workflow_id is not None:
        workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
        if workflow is None:
            logger.warning(
                "Rejected webhook due to unknown workflow_id: provider=%s event_type=%s workflow_id=%s",
                provider,
                normalized_event,
                workflow_id,
            )
            raise HTTPException(status_code=422, detail="workflow_id does not exist")

    triggered_run_id: int | None = None
    if should_trigger and workflow is not None:
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
