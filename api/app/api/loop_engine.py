from datetime import datetime, timezone
import hmac

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.config import settings
from app.schemas.loop import (
    LoopComponentMockIn,
    LoopComponentMockOut,
    LoopInstructionEnqueueOut,
    LoopInstructionIn,
    LoopInstructionStatusOut,
    LoopStatusOut,
)
from app.services.loop_simulator import loop_simulator


router = APIRouter(prefix="/loop", tags=["loop"])
_LOOP_COMPONENT_ORDER = ("analyzer", "evaluator", "planner", "executor")


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


def require_loop_action_permission(permission: str):
    required = permission.strip().lower()

    def _dependency(request: Request) -> str:
        authorized_role = require_loop_control_permission(request)
        permissions_by_role = settings.workflow_control_permissions_by_role
        if not permissions_by_role:
            return authorized_role

        role = authorized_role.strip().lower()
        if not role or role == "system":
            raise HTTPException(status_code=403, detail="missing workflow control role")

        granted = permissions_by_role.get(role, set())
        if "*" in granted or required in granted:
            return role
        raise HTTPException(status_code=403, detail="insufficient workflow control permission")

    return _dependency


@router.post("/start", response_model=LoopStatusOut)
def start_loop_engine(_authorized_role: str = Depends(require_loop_action_permission("loop:start"))):
    return loop_simulator.start()


@router.post("/pause", response_model=LoopStatusOut)
def pause_loop_engine(_authorized_role: str = Depends(require_loop_action_permission("loop:pause"))):
    return loop_simulator.pause()


@router.post("/resume", response_model=LoopStatusOut)
def resume_loop_engine(_authorized_role: str = Depends(require_loop_action_permission("loop:resume"))):
    return loop_simulator.resume()


@router.post("/stop", response_model=LoopStatusOut)
def stop_loop_engine(_authorized_role: str = Depends(require_loop_action_permission("loop:stop"))):
    return loop_simulator.stop()


@router.post("/inject", response_model=LoopInstructionEnqueueOut)
def inject_loop_instruction(
    payload: LoopInstructionIn,
    _authorized_role: str = Depends(require_loop_action_permission("loop:inject")),
):
    instruction_id, status = loop_simulator.inject_instruction(payload.instruction)
    if not instruction_id:
        raise HTTPException(status_code=400, detail="instruction is empty")
    return {"instruction_id": instruction_id, "status": status}


@router.get("/instruction/{instruction_id}", response_model=LoopInstructionStatusOut)
def get_instruction_status(
    instruction_id: str,
    _authorized_role: str = Depends(require_loop_action_permission("loop:inject")),
):
    status = loop_simulator.get_instruction_status(instruction_id)
    if status is None:
        raise HTTPException(status_code=404, detail="instruction not found")
    return status


@router.get("/status", response_model=LoopStatusOut)
def get_loop_engine_status():
    return loop_simulator.status()


def _next_component(component: str) -> str | None:
    try:
        idx = _LOOP_COMPONENT_ORDER.index(component)
    except ValueError:
        return None
    if idx + 1 < len(_LOOP_COMPONENT_ORDER):
        return _LOOP_COMPONENT_ORDER[idx + 1]
    return _LOOP_COMPONENT_ORDER[0]


@router.post("/analyzer/mock", response_model=LoopComponentMockOut)
def run_analyzer_mock(
    payload: LoopComponentMockIn,
    _authorized_role: str = Depends(require_loop_action_permission("loop:inject")),
):
    score = min(100, 58 + min(payload.budget_remaining // 500, 20))
    return {
        "component": "analyzer",
        "accepted": True,
        "status": "ok",
        "score": score,
        "next_component": _next_component("analyzer"),
        "reason": "코드/로그 요약 분석이 완료되었습니다.",
        "recommended_action": "Evaluator 단계에서 quality threshold를 검증하세요.",
        "created_at": datetime.now(timezone.utc),
    }


@router.post("/evaluator/mock", response_model=LoopComponentMockOut)
def run_evaluator_mock(
    payload: LoopComponentMockIn,
    _authorized_role: str = Depends(require_loop_action_permission("loop:inject")),
):
    previous = payload.previous_score if payload.previous_score is not None else 64
    score = max(0, min(100, previous - 2 if payload.max_loop_count < 5 else previous + 4))
    needs_review = payload.max_loop_count <= 2 or score < 55
    return {
        "component": "evaluator",
        "accepted": True,
        "status": "needs_review" if needs_review else "ok",
        "score": score,
        "next_component": _next_component("evaluator") if not needs_review else None,
        "reason": "품질 점수와 루프 제약 조건을 평가했습니다.",
        "recommended_action": "score가 낮으면 Loop Control 정책을 조정한 뒤 재평가하세요." if needs_review else "Planner로 개선 액션을 작성하세요.",
        "created_at": datetime.now(timezone.utc),
    }


@router.post("/planner/mock", response_model=LoopComponentMockOut)
def run_planner_mock(
    payload: LoopComponentMockIn,
    _authorized_role: str = Depends(require_loop_action_permission("loop:inject")),
):
    score = min(100, 60 + min(payload.max_loop_count // 8, 24))
    return {
        "component": "planner",
        "accepted": True,
        "status": "ok",
        "score": score,
        "next_component": _next_component("planner"),
        "reason": "리팩터링/테스트 개선 계획 초안이 생성되었습니다.",
        "recommended_action": "Executor에서 변경 실행 후 memory snapshot을 기록하세요.",
        "created_at": datetime.now(timezone.utc),
    }


@router.post("/executor/mock", response_model=LoopComponentMockOut)
def run_executor_mock(
    payload: LoopComponentMockIn,
    _authorized_role: str = Depends(require_loop_action_permission("loop:inject")),
):
    is_halted = payload.budget_remaining <= 0
    score = 48 if is_halted else 78
    return {
        "component": "executor",
        "accepted": not is_halted,
        "status": "halted" if is_halted else "ok",
        "score": score,
        "next_component": None if is_halted else _next_component("executor"),
        "reason": "변경 적용 시뮬레이션이 완료되었습니다." if not is_halted else "budget_remaining 부족으로 실행이 중단되었습니다.",
        "recommended_action": "다음 루프에서 Analyzer 입력으로 결과를 반영하세요." if not is_halted else "Loop budget을 늘리거나 작업 범위를 축소하세요.",
        "created_at": datetime.now(timezone.utc),
    }
