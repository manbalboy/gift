from __future__ import annotations

from collections import OrderedDict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from threading import Event, RLock, Thread
import time
from uuid import uuid4

from app.core.config import settings
from app.services.lock_provider import LockProviderFactory
from app.services.system_alerts import record_system_alert


logger = logging.getLogger(__name__)

_LOOP_STAGES = ("analyzer", "evaluator", "planner", "executor")
_LOOP_STAGE_LABELS = {
    "analyzer": "Analyzer",
    "evaluator": "Evaluator",
    "planner": "Planner",
    "executor": "Executor",
}
_LOOP_SIMULATOR_LOCK_KEY = -73_001
_LOCK_EXTEND_INTERVAL_SECONDS = 5.0
_MAX_PENDING_INSTRUCTIONS = 256
_MAX_INSTRUCTION_STATUS_HISTORY = 2_048


@dataclass
class LoopStatus:
    mode: str
    current_stage: str | None
    cycle_count: int
    emitted_alert_count: int
    pending_instruction_count: int
    quality_score: int | None
    started_at: datetime | None
    updated_at: datetime

    def to_payload(self) -> dict[str, object]:
        return {
            "mode": self.mode,
            "current_stage": self.current_stage,
            "cycle_count": self.cycle_count,
            "emitted_alert_count": self.emitted_alert_count,
            "pending_instruction_count": self.pending_instruction_count,
            "quality_score": self.quality_score,
            "started_at": self.started_at,
            "updated_at": self.updated_at,
        }


@dataclass
class InstructionStatus:
    id: str
    instruction: str
    status: str
    queued_at: datetime
    updated_at: datetime
    applied_at: datetime | None = None
    dropped_reason: str | None = None

    def to_payload(self) -> dict[str, object]:
        return {
            "id": self.id,
            "instruction": self.instruction,
            "status": self.status,
            "queued_at": self.queued_at,
            "updated_at": self.updated_at,
            "applied_at": self.applied_at,
            "dropped_reason": self.dropped_reason,
        }


class LoopSimulator:
    def __init__(self) -> None:
        self._lock = RLock()
        self._thread: Thread | None = None
        self._stop_event = Event()
        self._pause_event = Event()
        self._pause_event.set()
        self._mode = "idle"
        self._current_stage: str | None = None
        self._cycle_count = 0
        self._emitted_alert_count = 0
        self._pending_instructions: deque[tuple[str, str]] = deque(maxlen=_MAX_PENDING_INSTRUCTIONS)
        self._instruction_statuses: OrderedDict[str, InstructionStatus] = OrderedDict()
        self._quality_score: int | None = None
        self._safe_mode_reason: str | None = None
        self._started_at: datetime | None = None
        self._updated_at = datetime.now(timezone.utc)
        self._last_lock_extend_at = 0.0
        self._lock_provider = LockProviderFactory.create()
        self._execution_lock = self._lock_provider.get_run_lock(_LOOP_SIMULATOR_LOCK_KEY)
        self._execution_lock_held = False

    def status(self) -> dict[str, object]:
        with self._lock:
            return self._snapshot_locked().to_payload()

    def start(self) -> dict[str, object]:
        with self._lock:
            if self._mode == "running":
                return self._snapshot_locked().to_payload()

            if not self._acquire_execution_lock_locked():
                self._emit_lifecycle_alert_locked(
                    code="LOOP_START_SKIPPED_LOCK",
                    message="다른 워커가 이미 Loop Engine을 실행 중입니다.",
                    level="warning",
                )
                return self._snapshot_locked().to_payload()

            if self._thread and self._thread.is_alive() and self._mode == "paused":
                return self._resume_locked()

            self._stop_event = Event()
            self._pause_event = Event()
            self._pause_event.set()
            self._mode = "running"
            self._current_stage = _LOOP_STAGES[0]
            self._cycle_count = 0
            self._emitted_alert_count = 0
            self._pending_instructions.clear()
            self._quality_score = 62
            self._safe_mode_reason = None
            self._started_at = datetime.now(timezone.utc)
            self._touch_locked()
            self._emit_lifecycle_alert_locked(
                code="LOOP_START",
                message="Self-Improvement Loop Engine 시작",
                level="warning",
            )

            self._thread = Thread(target=self._run_forever, name="loop-simulator", daemon=True)
            self._thread.start()
            return self._snapshot_locked().to_payload()

    def resume(self) -> dict[str, object]:
        with self._lock:
            return self._resume_locked()

    def _resume_locked(self) -> dict[str, object]:
        if self._mode == "running":
            return self._snapshot_locked().to_payload()
        if self._mode in {"paused", "safe_mode"} and self._thread and self._thread.is_alive():
            self._mode = "running"
            self._safe_mode_reason = None
            self._pause_event.set()
            self._touch_locked()
            self._emit_lifecycle_alert_locked(
                code="LOOP_RESUME",
                message="Self-Improvement Loop Engine 재개",
                level="info",
            )
            return self._snapshot_locked().to_payload()
        return self._snapshot_locked().to_payload()

    def inject_instruction(self, instruction: str) -> tuple[str | None, dict[str, object]]:
        sanitized = " ".join(instruction.strip().split())
        with self._lock:
            if not sanitized:
                return None, self._snapshot_locked().to_payload()

            instruction_id = f"instr-{uuid4().hex[:12]}"
            instruction_text = sanitized[:2000]
            queued_at = datetime.now(timezone.utc)

            if len(self._pending_instructions) >= _MAX_PENDING_INSTRUCTIONS:
                dropped_id, dropped_instruction = self._pending_instructions.popleft()
                dropped = self._instruction_statuses.get(dropped_id)
                if dropped is None:
                    dropped = InstructionStatus(
                        id=dropped_id,
                        instruction=dropped_instruction,
                        status="queued",
                        queued_at=queued_at,
                        updated_at=queued_at,
                    )
                dropped.status = "dropped"
                dropped.updated_at = queued_at
                dropped.dropped_reason = "queue_overflow"
                self._instruction_statuses[dropped_id] = dropped
                self._instruction_statuses.move_to_end(dropped_id)

            self._pending_instructions.append((instruction_id, instruction_text))
            self._instruction_statuses[instruction_id] = InstructionStatus(
                id=instruction_id,
                instruction=instruction_text,
                status="queued",
                queued_at=queued_at,
                updated_at=queued_at,
            )
            self._instruction_statuses.move_to_end(instruction_id)
            self._trim_instruction_statuses_locked()
            self._touch_locked()
            self._emit_lifecycle_alert_locked(
                code="LOOP_INJECT_QUEUED",
                message=f"Inject Instruction 등록: {sanitized[:120]}",
                level="warning",
            )
            return instruction_id, self._snapshot_locked().to_payload()

    def pause(self) -> dict[str, object]:
        with self._lock:
            if self._mode != "running":
                return self._snapshot_locked().to_payload()
            self._mode = "paused"
            self._pause_event.clear()
            self._touch_locked()
            self._emit_lifecycle_alert_locked(
                code="LOOP_PAUSE",
                message="Self-Improvement Loop Engine 일시정지",
                level="warning",
            )
            return self._snapshot_locked().to_payload()

    def stop(self) -> dict[str, object]:
        worker: Thread | None = None
        with self._lock:
            if self._mode in {"idle", "stopped"} and not (self._thread and self._thread.is_alive()):
                self._mode = "stopped"
                self._current_stage = None
                self._release_execution_lock_locked()
                self._touch_locked()
                return self._snapshot_locked().to_payload()

            self._mode = "stopped"
            self._current_stage = None
            self._stop_event.set()
            self._pause_event.set()
            self._touch_locked()
            self._emit_lifecycle_alert_locked(
                code="LOOP_STOP",
                message="Self-Improvement Loop Engine 중지",
                level="error",
            )
            worker = self._thread

        if worker and worker.is_alive():
            worker.join(timeout=1.2)

        with self._lock:
            self._thread = None
            self._release_execution_lock_locked()
            if self._mode == "stopped":
                self._mode = "idle"
            self._touch_locked()
            return self._snapshot_locked().to_payload()

    def reset_for_tests(self) -> None:
        self.stop()
        with self._lock:
            self._mode = "idle"
            self._current_stage = None
            self._cycle_count = 0
            self._emitted_alert_count = 0
            self._pending_instructions.clear()
            self._instruction_statuses.clear()
            self._quality_score = None
            self._safe_mode_reason = None
            self._started_at = None
            self._release_execution_lock_locked()
            self._touch_locked()

    def _run_forever(self) -> None:
        stage_idx = 0
        try:
            while not self._stop_event.is_set():
                if not self._refresh_execution_lock_if_needed():
                    break

                if self._is_paused():
                    self._pause_event.wait(timeout=1.0)
                    continue

                self._drain_next_instruction()

                stage = _LOOP_STAGES[stage_idx]
                quality = self._quality_for_stage(stage, stage_idx)
                self._emit_stage_alert(stage=stage, quality=quality)

                stage_idx = (stage_idx + 1) % len(_LOOP_STAGES)
                if stage_idx == 0:
                    with self._lock:
                        self._cycle_count += 1
                        self._touch_locked()

                time.sleep(0.36)
        finally:
            with self._lock:
                self._thread = None
                self._release_execution_lock_locked()
                if self._mode == "stopped":
                    self._mode = "idle"
                self._touch_locked()

    def _is_paused(self) -> bool:
        with self._lock:
            return self._mode in {"paused", "safe_mode"}

    def _quality_for_stage(self, stage: str, stage_idx: int) -> int:
        with self._lock:
            cycle = self._cycle_count
        base = 64 + ((cycle * 7 + stage_idx * 6) % 31)
        if stage == "evaluator" and cycle > 0 and cycle % 9 == 0:
            return max(0, min(100, 24 + (cycle % 6)))
        if stage == "evaluator":
            return max(0, min(100, base - 4))
        if stage == "executor":
            return max(0, min(100, base + 3))
        return max(0, min(100, base))

    def _emit_stage_alert(self, *, stage: str, quality: int) -> None:
        level = "warning" if stage == "evaluator" and quality < 72 else "info"
        stage_label = _LOOP_STAGE_LABELS.get(stage, stage)

        previous_quality: int | None = None
        with self._lock:
            if self._mode != "running":
                return
            cycle = self._cycle_count + 1
            previous_quality = self._quality_score
            self._current_stage = stage
            self._quality_score = quality
            self._touch_locked()

        safe_mode_min_quality = max(0, min(100, int(settings.loop_safe_mode_min_quality)))
        safe_mode_drop_threshold = max(1, int(settings.loop_safe_mode_drop_threshold))
        quality_drop = (
            previous_quality - quality
            if isinstance(previous_quality, int)
            else 0
        )
        should_enter_safe_mode = (
            stage == "evaluator"
            and isinstance(previous_quality, int)
            and quality <= safe_mode_min_quality
            and quality_drop >= safe_mode_drop_threshold
        )
        if should_enter_safe_mode:
            self._enter_safe_mode(
                quality=quality,
                previous_quality=previous_quality,
                cycle=cycle,
            )
            return

        record_system_alert(
            level=level,
            code=f"LOOP_{stage.upper()}",
            source="loop-engine",
            message=(
                f"[{stage_label}] cycle={cycle} quality={quality} | "
                f"evidence=http://test.com/api?v=1.0. (refs: OPS-{200 + (cycle % 50)})"
            ),
            context={
                "loop": {
                    "stage": stage,
                    "cycle": cycle,
                    "status": self._mode,
                },
                "risk_score": max(5, 100 - quality),
            },
        )

        with self._lock:
            self._emitted_alert_count += 1
            self._touch_locked()

    def _enter_safe_mode(self, *, quality: int, previous_quality: int, cycle: int) -> None:
        reason = (
            f"quality score 급락 감지: prev={previous_quality}, current={quality}, "
            f"drop={previous_quality - quality}, cycle={cycle}"
        )
        with self._lock:
            if self._mode != "running":
                return
            self._mode = "safe_mode"
            self._safe_mode_reason = reason
            self._pause_event.clear()
            self._touch_locked()
            self._emit_lifecycle_alert_locked(
                code="LOOP_SAFE_MODE",
                message=f"Safe Mode 전환: {reason}",
                level="error",
            )

    def _drain_next_instruction(self) -> None:
        instruction_id: str | None = None
        with self._lock:
            if self._mode != "running" or not self._pending_instructions:
                return
            instruction_id, instruction = self._pending_instructions.popleft()
            cycle = self._cycle_count + 1
            stage = self._current_stage
            applied_at = datetime.now(timezone.utc)
            tracked = self._instruction_statuses.get(instruction_id)
            if tracked is not None:
                tracked.status = "applied"
                tracked.updated_at = applied_at
                tracked.applied_at = applied_at
                tracked.dropped_reason = None
                self._instruction_statuses.move_to_end(instruction_id)
            self._trim_instruction_statuses_locked()
            self._touch_locked()

        record_system_alert(
            level="warning",
            code="LOOP_INJECT_APPLIED",
            source="loop-engine",
            message=f"Inject Instruction 반영: {instruction[:180]}",
            context={
                "loop": {
                    "status": self._mode,
                    "stage": stage,
                    "cycle": cycle,
                },
                "instruction": instruction[:200],
            },
        )

        with self._lock:
            self._emitted_alert_count += 1
            self._touch_locked()

    def _emit_lifecycle_alert_locked(self, *, code: str, message: str, level: str) -> None:
        record_system_alert(
            level=level,
            code=code,
            source="loop-engine",
            message=message,
            context={
                "loop": {
                    "status": self._mode,
                    "stage": self._current_stage,
                    "cycle": self._cycle_count,
                }
            },
        )
        self._emitted_alert_count += 1
        self._touch_locked()

    def _acquire_execution_lock_locked(self) -> bool:
        if self._execution_lock_held:
            return True
        acquired = bool(self._execution_lock.acquire(blocking=False))
        if not acquired:
            return False
        self._execution_lock_held = True
        self._last_lock_extend_at = time.monotonic()
        return True

    def _release_execution_lock_locked(self) -> None:
        if not self._execution_lock_held:
            return
        try:
            self._execution_lock.release()
        except Exception as exc:  # pragma: no cover
            logger.warning("loop simulator lock release failed: %s", exc)
        finally:
            self._execution_lock_held = False
            self._last_lock_extend_at = 0.0

    def _refresh_execution_lock_if_needed(self) -> bool:
        now = time.monotonic()
        if now - self._last_lock_extend_at < _LOCK_EXTEND_INTERVAL_SECONDS:
            return True

        with self._lock:
            if not self._execution_lock_held:
                self._stop_event.set()
                self._pause_event.set()
                return False
            try:
                extended = bool(self._execution_lock.extend(settings.lock_ttl_seconds))
            except Exception as exc:
                logger.warning("loop simulator lock extend failed: %s", exc)
                extended = False
            if extended:
                self._last_lock_extend_at = now
                return True

            self._mode = "stopped"
            self._current_stage = None
            self._stop_event.set()
            self._pause_event.set()
            self._emit_lifecycle_alert_locked(
                code="LOOP_LOCK_LOST",
                message="분산 락 갱신에 실패해 루프 엔진을 안전 정지합니다.",
                level="error",
            )
            return False

    def get_instruction_status(self, instruction_id: str) -> dict[str, object] | None:
        with self._lock:
            normalized = instruction_id.strip()
            if not normalized:
                return None
            status = self._instruction_statuses.get(normalized)
            if status is None:
                return None
            return status.to_payload()

    def _trim_instruction_statuses_locked(self) -> None:
        while len(self._instruction_statuses) > _MAX_INSTRUCTION_STATUS_HISTORY:
            self._instruction_statuses.popitem(last=False)

    def _touch_locked(self) -> None:
        self._updated_at = datetime.now(timezone.utc)

    def _snapshot_locked(self) -> LoopStatus:
        return LoopStatus(
            mode=self._mode,
            current_stage=self._current_stage,
            cycle_count=self._cycle_count,
            emitted_alert_count=self._emitted_alert_count,
            pending_instruction_count=len(self._pending_instructions),
            quality_score=self._quality_score,
            started_at=self._started_at,
            updated_at=self._updated_at,
        )


loop_simulator = LoopSimulator()


def reset_loop_simulator_for_tests() -> None:
    loop_simulator.reset_for_tests()
