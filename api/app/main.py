from contextlib import asynccontextmanager
import subprocess
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import workflows as workflows_api
from app.api.agents import router as agents_router
from app.api.webhooks import router as webhooks_router
from app.api.workflows import router as workflows_router
from app.api.workflows import run_router, engine as workflow_engine
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

_CORS_PORT_PATTERN = r"(?::(?:3\d{3}|70\d{2}))?"
_CORS_ALLOWED_HOST_PATTERN = r"(?:(?:localhost|127\.0\.0\.1)|(?:[A-Za-z0-9-]+\.)*manbalboy\.com)"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3100",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3100",
        "https://manbalboy.com",
        "http://manbalboy.com",
    ],
    allow_origin_regex=rf"^https?://{_CORS_ALLOWED_HOST_PATTERN}{_CORS_PORT_PATTERN}$",
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
    docker_health = _docker_health_snapshot()
    return {
        "status": "ok",
        "docker_available": docker_health["available"],
        "docker_health": docker_health,
        "agent_runner": agent_runner_health,
        "sse_rate_limiter": limiter_health,
    }


app.include_router(workflows_router, prefix=settings.api_prefix)
app.include_router(run_router, prefix=settings.api_prefix)
app.include_router(agents_router, prefix=settings.api_prefix)
app.include_router(webhooks_router, prefix=settings.api_prefix)
