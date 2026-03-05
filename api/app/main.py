from contextlib import asynccontextmanager
import re
import subprocess
import time

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import workflows as workflows_api
from app.api.dependencies import require_viewer_token
from app.api.agents import router as agents_router
from app.api.preview import (
    PREVIEW_VIEWER_TOKEN_HEADER,
    consume_preview_viewer_token,
    is_preview_protected_host,
    router as preview_router,
)
from app.api.webhooks import router as webhooks_router
from app.api.workflows import router as workflows_router
from app.api.workflows import approval_router, run_router, engine as workflow_engine
from app.core.config import settings
from app.db.base import Base
from app.db.session import SessionLocal, engine

_docker_health_cache_until = 0.0
_docker_health_cached = False
_docker_health_last_error = ""


def ensure_docker_daemon_available() -> None:
    result = subprocess.run(
        ["docker", "info"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
        timeout=4,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown docker error").strip()
        raise RuntimeError(f"Docker daemon health check failed: {detail}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.require_docker_ping_on_startup:
        ensure_docker_daemon_available()
    db = SessionLocal()
    try:
        workflow_engine.recover_stuck_runs(db)
    finally:
        db.close()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

_CORS_ALLOWED_HOST_PATTERN = r"(?:(?:localhost|127\.0\.0\.1)|(?:[A-Za-z0-9-]+\.)*manbalboy\.com)"
_CORS_ORIGIN_PATTERN = re.compile(rf"^https?://{_CORS_ALLOWED_HOST_PATTERN}(?::31\d{{2}})?$")


def _is_allowed_origin(origin: str) -> bool:
    return bool(_CORS_ORIGIN_PATTERN.fullmatch(origin.strip()))


@app.middleware("http")
async def enforce_origin_allowlist(request, call_next):
    origin = request.headers.get("origin", "").strip()
    if origin and not _is_allowed_origin(origin):
        return JSONResponse(status_code=403, content={"detail": "origin is not allowed"})
    return await call_next(request)


@app.middleware("http")
async def enforce_preview_viewer_token(request, call_next):
    host = request.headers.get("host", "")
    if request.url.path.rstrip("/") == f"{settings.api_prefix}/preview/viewer-token":
        return await call_next(request)
    if is_preview_protected_host(host):
        token = (
            request.headers.get(PREVIEW_VIEWER_TOKEN_HEADER, "").strip()
            or request.query_params.get("viewer_token", "").strip()
        )
        if not token:
            return JSONResponse(status_code=403, content={"detail": "preview viewer token is required"})
        if not consume_preview_viewer_token(token):
            return JSONResponse(status_code=403, content={"detail": "invalid or expired preview viewer token"})
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "https://manbalboy.com",
        "http://manbalboy.com",
    ],
    allow_origin_regex=rf"^https?://{_CORS_ALLOWED_HOST_PATTERN}(?::31\d{{2}})?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


def _docker_daemon_available_cached() -> bool:
    global _docker_health_cache_until
    global _docker_health_cached
    global _docker_health_last_error
    now = time.monotonic()
    if now < _docker_health_cache_until:
        return _docker_health_cached
    try:
        result = subprocess.run(
            ["docker", "info"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
            timeout=1,
        )
        _docker_health_cached = result.returncode == 0
        _docker_health_last_error = "" if _docker_health_cached else (result.stderr or result.stdout or "").strip()
    except Exception:
        _docker_health_cached = False
        _docker_health_last_error = "docker info command failed"
    _docker_health_cache_until = time.monotonic() + 3
    return _docker_health_cached


def _docker_health_snapshot() -> dict[str, object]:
    available = _docker_daemon_available_cached()
    remaining = max(0.0, _docker_health_cache_until - time.monotonic())
    return {
        "available": available,
        "cache_active": remaining > 0,
        "cache_remaining_seconds": round(remaining, 3),
        "last_error": "" if available else _docker_health_last_error,
    }


@app.get("/health")
def health():
    limiter_health = workflows_api.reconnect_rate_limiter.health_snapshot()
    agent_runner_health = workflow_engine.agent_runner.health_snapshot()
    workflow_health = workflow_engine.health_snapshot()
    db = SessionLocal()
    try:
        dlq_health = workflow_engine.dlq_snapshot(db)
    finally:
        db.close()
    docker_health = _docker_health_snapshot()
    return {
        "status": "ok",
        "docker_available": docker_health["available"],
        "docker_health": docker_health,
        "agent_runner": agent_runner_health,
        "workflow_engine": workflow_health,
        "dlq": dlq_health,
        "sse_rate_limiter": limiter_health,
    }


app.include_router(workflows_router, prefix=settings.api_prefix, dependencies=[Depends(require_viewer_token)])
app.include_router(run_router, prefix=settings.api_prefix, dependencies=[Depends(require_viewer_token)])
app.include_router(approval_router, prefix=settings.api_prefix, dependencies=[Depends(require_viewer_token)])
app.include_router(agents_router, prefix=settings.api_prefix, dependencies=[Depends(require_viewer_token)])
app.include_router(webhooks_router, prefix=settings.api_prefix, dependencies=[Depends(require_viewer_token)])
app.include_router(preview_router, prefix=settings.api_prefix, dependencies=[Depends(require_viewer_token)])
