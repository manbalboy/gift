import hmac

from fastapi import HTTPException, Request

from app.core.config import settings


def _extract_viewer_token(request: Request) -> str:
    bearer = request.headers.get("Authorization", "").strip()
    if bearer.lower().startswith("bearer "):
        return bearer[7:].strip()
    return request.headers.get("X-Viewer-Token", "").strip()


def require_viewer_token(request: Request) -> None:
    configured = settings.viewer_token.strip()
    if not configured:
        return

    path = request.url.path.rstrip("/")
    if path == f"{settings.api_prefix}/preview/viewer-token":
        return
    if path == "/health":
        return

    provided = _extract_viewer_token(request)
    if not provided:
        raise HTTPException(status_code=401, detail="missing viewer token")
    if not hmac.compare_digest(provided, configured):
        raise HTTPException(status_code=401, detail="invalid viewer token")
