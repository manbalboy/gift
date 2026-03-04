from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.workflows import router as workflows_router
from app.api.workflows import run_router, engine as workflow_engine
from app.core.config import settings
from app.db.base import Base
from app.db.session import SessionLocal, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
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
        "https://manbalboy.com",
        "http://manbalboy.com",
    ],
    allow_origin_regex=(
        r"^https?://(?:(?:localhost|127\.0\.0\.1):31\d{2}|(?:[A-Za-z0-9-]+\.)*manbalboy\.com(?::31\d{2})?)$"
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
