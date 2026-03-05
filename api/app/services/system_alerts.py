import re
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import delete, desc, func, select

from app.db.system_alert_model import SystemAlertLog


_MAX_ALERTS = 500
_MAX_SANITIZE_INPUT_CHARS = 10_000
_MASKED = "***[MASKED]***"
_BEARER_TOKEN_PATTERN = re.compile(r"Bearer\s+[A-Za-z0-9\-\._~+/]+=*", flags=re.IGNORECASE)
_SENSITIVE_PATH_PATTERN = re.compile(r"(?:(?:/home/docker/|/root/)[^\s\"']*)")


def _new_session():
    from app.db.session import SessionLocal

    return SessionLocal()


def _sanitize_string(value: str) -> str:
    bounded = value[:_MAX_SANITIZE_INPUT_CHARS]
    masked = _BEARER_TOKEN_PATTERN.sub(_MASKED, bounded)
    return _SENSITIVE_PATH_PATTERN.sub(_MASKED, masked)


def _sanitize_value(value: Any) -> Any:
    if isinstance(value, str):
        return _sanitize_string(value)
    if isinstance(value, dict):
        return {key: _sanitize_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value]
    if isinstance(value, tuple):
        return tuple(_sanitize_value(item) for item in value)
    return value


def _extract_risk_score(context: dict[str, Any]) -> int | None:
    raw = context.get("risk_score")
    if raw is None:
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError, OverflowError):
        return None
    return max(0, min(100, value))


def record_system_alert(
    *,
    level: str,
    code: str,
    message: str,
    source: str,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sanitized_message = _sanitize_string(message)
    sanitized_context = _sanitize_value(context or {})
    risk_score = _extract_risk_score(sanitized_context if isinstance(sanitized_context, dict) else {})

    entry: dict[str, Any] = {
        "id": f"alert-{uuid4().hex[:12]}",
        "created_at": datetime.now().astimezone(),
        "level": str(level).strip().lower() or "warning",
        "code": code,
        "message": sanitized_message,
        "source": source,
        "context": sanitized_context,
        "risk_score": risk_score,
    }

    db = _new_session()
    try:
        db.add(
            SystemAlertLog(
                id=entry["id"],
                created_at=entry["created_at"],
                level=entry["level"],
                code=entry["code"],
                message=entry["message"],
                source=entry["source"],
                context=entry["context"],
            )
        )
        db.flush()

        total = int(db.scalar(select(func.count()).select_from(SystemAlertLog)) or 0)
        if total > _MAX_ALERTS:
            excess = total - _MAX_ALERTS
            stale_ids = db.scalars(
                select(SystemAlertLog.id)
                .order_by(SystemAlertLog.created_at.asc(), SystemAlertLog.id.asc())
                .limit(excess)
            ).all()
            if stale_ids:
                db.execute(delete(SystemAlertLog).where(SystemAlertLog.id.in_(stale_ids)))

        db.commit()
    finally:
        db.close()

    return entry


def list_system_alerts(limit: int = 50) -> list[dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 50))
    db = _new_session()
    try:
        rows = db.scalars(
            select(SystemAlertLog)
            .order_by(desc(SystemAlertLog.created_at), desc(SystemAlertLog.id))
            .limit(safe_limit)
        ).all()
    finally:
        db.close()

    payload: list[dict[str, Any]] = []
    for row in rows:
        sanitized_context = _sanitize_value(row.context or {})
        payload.append(
            {
                "id": row.id,
                "created_at": row.created_at,
                "level": row.level,
                "code": row.code,
                "message": _sanitize_string(row.message),
                "source": row.source,
                "context": sanitized_context,
                "risk_score": _extract_risk_score(sanitized_context if isinstance(sanitized_context, dict) else {}),
            }
        )
    return payload


def reset_system_alerts_for_tests() -> None:
    db = _new_session()
    try:
        db.execute(delete(SystemAlertLog))
        db.commit()
    finally:
        db.close()
