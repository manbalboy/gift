import base64
import hashlib
import hmac
import json
import threading
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException

from app.core.config import settings


router = APIRouter(prefix="/preview", tags=["preview"])
_issued_nonce_expiry: dict[str, int] = {}
_issued_nonce_lock = threading.Lock()
PREVIEW_VIEWER_TOKEN_HEADER = "x-preview-viewer-token"


def _token_secret() -> str:
    configured = settings.preview_viewer_token_secret.strip()
    if configured:
        return configured
    return "devflow-preview-local-viewer-secret"


def _cleanup_expired_nonces(now_ts: int) -> None:
    expired = [nonce for nonce, exp in _issued_nonce_expiry.items() if exp <= now_ts]
    for nonce in expired:
        _issued_nonce_expiry.pop(nonce, None)


def issue_preview_viewer_token() -> tuple[str, datetime]:
    ttl_seconds = max(30, settings.preview_viewer_token_ttl_seconds)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    nonce = uuid.uuid4().hex
    payload = {"exp": int(expires_at.timestamp()), "nonce": nonce}
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    encoded = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    signature = hmac.new(_token_secret().encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).hexdigest()

    with _issued_nonce_lock:
        _cleanup_expired_nonces(int(datetime.now(timezone.utc).timestamp()))
        _issued_nonce_expiry[nonce] = int(expires_at.timestamp())
    return f"{encoded}.{signature}", expires_at


def consume_preview_viewer_token(token: str) -> bool:
    value = token.strip()
    if not value or "." not in value:
        return False
    encoded, provided_sig = value.rsplit(".", maxsplit=1)
    expected_sig = hmac.new(_token_secret().encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(provided_sig, expected_sig):
        return False

    missing_padding = (-len(encoded)) % 4
    encoded_padded = f"{encoded}{'=' * missing_padding}"
    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded_padded.encode("ascii")).decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return False

    nonce = payload.get("nonce")
    exp = payload.get("exp")
    if not isinstance(nonce, str) or not nonce.strip():
        return False
    if not isinstance(exp, int):
        return False

    now_ts = int(datetime.now(timezone.utc).timestamp())
    if exp <= now_ts:
        return False

    with _issued_nonce_lock:
        _cleanup_expired_nonces(now_ts)
        stored_exp = _issued_nonce_expiry.get(nonce)
        if stored_exp is None or stored_exp != exp:
            return False
        _issued_nonce_expiry.pop(nonce, None)
    return True


def is_preview_protected_host(host_header: str) -> bool:
    host = host_header.strip()
    if not host:
        return False
    if ":" not in host:
        return False
    port_text = host.rsplit(":", maxsplit=1)[1].strip()
    if not port_text.isdigit():
        return False
    port = int(port_text)
    return settings.preview_protected_port_start <= port <= settings.preview_protected_port_end


@router.post("/viewer-token")
def create_viewer_token(x_preview_issue_secret: str | None = Header(default=None)):
    issue_secret = settings.preview_viewer_issue_secret.strip()
    if issue_secret:
        if not x_preview_issue_secret or not hmac.compare_digest(x_preview_issue_secret.strip(), issue_secret):
            raise HTTPException(status_code=403, detail="preview token issuance is forbidden")

    token, expires_at = issue_preview_viewer_token()
    return {
        "token": token,
        "expires_at": expires_at.isoformat(),
        "port_range": f"{settings.preview_protected_port_start}-{settings.preview_protected_port_end}",
    }
