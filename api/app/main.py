from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.workflows import router as workflows_router
from app.api.workflows import run_router
from app.core.config import settings
from app.db.base import Base
from app.db.session import engine


app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        "https://manbalboy.com",
        "http://manbalboy.com",
    ],
    allow_origin_regex=(
        r"^https?://(([a-zA-Z0-9-]+\.)*manbalboy\.com)(:\d+)?$|^https?://(localhost|127\.0\.0\.1):31\d\d$"
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
