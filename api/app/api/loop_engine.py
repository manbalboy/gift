import hmac

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.config import settings
from app.schemas.loop import LoopStatusOut
from app.services.loop_simulator import loop_simulator


router = APIRouter(prefix="/loop", tags=["loop"])


def _extract_control_token(request: Request) -> str:
    bearer = request.headers.get("Authorization", "").strip()
    if bearer.lower().startswith("bearer "):
        return bearer[7:].strip()
    return request.headers.get("X-Workflow-Control-Token", "").strip()


def _extract_control_role(request: Request) -> str:
    return request.headers.get("X-Workflow-Control-Role", "").strip().lower()


def require_loop_control_permission(request: Request) -> str:
    configured_token = settings.workflow_control_token.strip()
    allowed_roles = settings.allowed_workflow_control_roles
    provided_token = _extract_control_token(request)
    provided_role = _extract_control_role(request)

    if configured_token:
        if not provided_token:
            raise HTTPException(status_code=401, detail="missing workflow control token")
        if not hmac.compare_digest(provided_token, configured_token):
            raise HTTPException(status_code=403, detail="invalid workflow control token")

    if allowed_roles:
        if not provided_role:
            raise HTTPException(status_code=403, detail="missing workflow control role")
        if provided_role not in allowed_roles:
            raise HTTPException(status_code=403, detail="insufficient workflow control role")

    return provided_role or "system"


@router.post("/start", response_model=LoopStatusOut)
def start_loop_engine(_authorized_role: str = Depends(require_loop_control_permission)):
    return loop_simulator.start()


@router.post("/pause", response_model=LoopStatusOut)
def pause_loop_engine(_authorized_role: str = Depends(require_loop_control_permission)):
    return loop_simulator.pause()


@router.post("/stop", response_model=LoopStatusOut)
def stop_loop_engine(_authorized_role: str = Depends(require_loop_control_permission)):
    return loop_simulator.stop()


@router.get("/status", response_model=LoopStatusOut)
def get_loop_engine_status():
    return loop_simulator.status()
