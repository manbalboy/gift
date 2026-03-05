from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import re
from threading import Lock


_ENTRY_HEADER_PATTERN = re.compile(r"^##\s+(?P<timestamp>[^·]+?)\s+·\s+(?P<decision>[a-z_]+)\s*$")
_FIELD_PATTERN = re.compile(r"^-\s+(?P<key>[a-z_]+):\s*(?P<value>.*)$")
_STATUS_ARTIFACT_CACHE: dict[str, tuple[float, list[dict]]] = {}
_STATUS_ARTIFACT_CACHE_LOCK = Lock()


def _parse_timestamp(raw: str) -> datetime | None:
    value = raw.strip()
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_status_artifact_entries(run_id: int, artifact_path: Path) -> list[dict]:
    if not artifact_path.exists():
        return []
    cache_key = str(artifact_path.resolve())
    stat = artifact_path.stat()
    with _STATUS_ARTIFACT_CACHE_LOCK:
        cached = _STATUS_ARTIFACT_CACHE.get(cache_key)
        if cached and cached[0] == stat.st_mtime:
            return [dict(item) for item in cached[1]]

    lines = artifact_path.read_text(encoding="utf-8").splitlines()
    entries: list[dict] = []
    current: dict | None = None

    def flush_current() -> None:
        nonlocal current
        if not current:
            return
        decided_at = _parse_timestamp(str(current.get("decided_at", "")))
        decision = str(current.get("decision", "")).strip().lower()
        node_id = str(current.get("node_id", "")).strip()
        decided_by = str(current.get("decided_by", "")).strip()
        payload = current.get("payload", {})
        if not decided_at or not decision:
            current = None
            return
        if not isinstance(payload, dict):
            payload = {}
        entries.append(
            {
                "run_id": run_id,
                "node_id": node_id or "unknown",
                "decision": decision,
                "decided_by": decided_by or "unknown",
                "decided_at": decided_at,
                "payload": payload,
            }
        )
        current = None

    for line in lines:
        header_match = _ENTRY_HEADER_PATTERN.match(line.strip())
        if header_match:
            flush_current()
            current = {
                "decided_at": header_match.group("timestamp").strip(),
                "decision": header_match.group("decision").strip().lower(),
                "payload": {},
            }
            continue
        if not current:
            continue
        field_match = _FIELD_PATTERN.match(line.strip())
        if not field_match:
            continue
        key = field_match.group("key").strip().lower()
        value = field_match.group("value").strip()
        if key in {"node_id", "decided_by"}:
            current[key] = value
            continue
        if key == "payload":
            try:
                parsed_payload = json.loads(value) if value else {}
            except json.JSONDecodeError:
                parsed_payload = {}
            current["payload"] = parsed_payload if isinstance(parsed_payload, dict) else {}

    flush_current()
    with _STATUS_ARTIFACT_CACHE_LOCK:
        _STATUS_ARTIFACT_CACHE[cache_key] = (stat.st_mtime, [dict(item) for item in entries])
    return entries
