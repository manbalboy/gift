from contextlib import asynccontextmanager
import subprocess

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agents import router as agents_router
from app.api.webhooks import router as webhooks_router
from app.api.workflows import router as workflows_router
from app.api.workflows import run_router, engine as workflow_engine
from app.core.config import settings
from app.db.base import Base
from app.db.session import SessionLocal, engine


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "http://localhost:3101",
        "http://127.0.0.1:3101",
        "https://manbalboy.com:3100",
        "https://manbalboy.com:3101",
        "http://manbalboy.com:3100",
        "http://manbalboy.com:3101",
    ],
    allow_origin_regex=(
        r"^https?://(?:(?:localhost|127\.0\.0\.1):31\d{2}|(?:[A-Za-z0-9-]+\.)*manbalboy\.com:31\d{2})$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(workflows_router, prefix=settings.api_prefix)
app.include_router(run_router, prefix=settings.api_prefix)
app.include_router(agents_router, prefix=settings.api_prefix)
app.include_router(webhooks_router, prefix=settings.api_prefix)
