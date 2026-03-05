from collections import deque
from datetime import datetime, timezone
from threading import Lock
from typing import Any
from uuid import uuid4


_MAX_ALERTS = 500
_alerts: deque[dict[str, Any]] = deque(maxlen=_MAX_ALERTS)
_alerts_lock = Lock()


def record_system_alert(
    *,
    level: str,
    code: str,
    message: str,
    source: str,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    entry = {
        "id": f"alert-{uuid4().hex[:12]}",
        "created_at": datetime.now(timezone.utc),
        "level": str(level).strip().lower() or "warning",
        "code": code,
        "message": message,
        "source": source,
        "context": context or {},
    }
    with _alerts_lock:
        _alerts.appendleft(entry)
    return entry


def list_system_alerts(limit: int = 50) -> list[dict[str, Any]]:
    safe_limit = max(1, min(int(limit), 50))
    with _alerts_lock:
        return list(_alerts)[:safe_limit]


def reset_system_alerts_for_tests() -> None:
    with _alerts_lock:
        _alerts.clear()
