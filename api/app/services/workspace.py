import re
from pathlib import Path
import logging
import errno
import time
from collections.abc import Callable

from app.core.config import settings
from app.services.system_alerts import record_system_alert


NODE_ID_SAFE_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
logger = logging.getLogger(__name__)


class InvalidNodeIdError(ValueError):
    pass


class WorkspaceArtifactIOError(OSError):
    pass


def is_safe_node_id(node_id: str) -> bool:
    return NODE_ID_SAFE_PATTERN.match(node_id) is not None


class WorkspaceService:
    def __init__(self, root: str | Path | None = None) -> None:
        self.root = Path(root or settings.workspaces_root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve_under_root(self, path: Path) -> Path:
        resolved = path.resolve()
        if resolved != self.root and self.root not in resolved.parents:
            raise InvalidNodeIdError(f"unsafe workspace path: {path}")
        return resolved

    def _run_with_lock_retry(self, operation: Callable[[], object]) -> object:
        attempts = 3
        base_delay = 0.03
        for attempt in range(1, attempts + 1):
            try:
                return operation()
            except OSError as exc:
                is_lock_related = exc.errno in {errno.EACCES, errno.EAGAIN, errno.EBUSY, errno.ETXTBSY} or isinstance(
                    exc,
                    PermissionError,
                )
                if not is_lock_related or attempt >= attempts:
                    raise
                logger.warning(
                    "workspace_lock_contention_retry",
                    extra={
                        "attempt": attempt,
                        "max_attempts": attempts,
                        "error_type": exc.__class__.__name__,
                    },
                )
                time.sleep(base_delay * attempt)
        raise RuntimeError("workspace retry loop exhausted")

    def write_artifact(self, run_id: int, node_id: str, content: str) -> str:
        if not is_safe_node_id(node_id):
            raise InvalidNodeIdError(f"unsafe node_id: {node_id}")
        if run_id < 0:
            raise InvalidNodeIdError(f"unsafe run_id: {run_id}")

        target_dir = self._resolve_under_root(self.root / "main" / "runs" / str(run_id))
        try:
            self._run_with_lock_retry(lambda: target_dir.mkdir(parents=True, exist_ok=True))
        except OSError as exc:
            logger.error(
                "workspace_dir_access_failed",
                extra={
                    "run_id": run_id,
                    "node_id": node_id,
                    "path": str(target_dir),
                    "error_type": exc.__class__.__name__,
                },
                exc_info=True,
            )
            record_system_alert(
                level="error",
                code="workspace_dir_access_failed",
                message="워크스페이스 디렉터리 접근 중 Lock/권한 오류가 발생했습니다.",
                source="workspace",
                context={"run_id": run_id, "node_id": node_id, "path": str(target_dir), "error_type": exc.__class__.__name__},
            )
            raise WorkspaceArtifactIOError(
                f"workspace artifact directory access failed: {target_dir} ({exc.__class__.__name__})"
            ) from exc
        artifact = self._resolve_under_root(target_dir / f"{node_id}.md")
        try:
            self._run_with_lock_retry(lambda: artifact.write_text(content, encoding="utf-8"))
        except OSError as exc:
            logger.error(
                "workspace_write_failed",
                extra={
                    "run_id": run_id,
                    "node_id": node_id,
                    "path": str(artifact),
                    "error_type": exc.__class__.__name__,
                },
                exc_info=True,
            )
            record_system_alert(
                level="error",
                code="workspace_write_failed",
                message="아티팩트 파일 쓰기 중 Lock/권한 오류가 발생했습니다.",
                source="workspace",
                context={"run_id": run_id, "node_id": node_id, "path": str(artifact), "error_type": exc.__class__.__name__},
            )
            raise WorkspaceArtifactIOError(
                f"workspace artifact write failed: {artifact} ({exc.__class__.__name__})"
            ) from exc
        return str(artifact)

    def read_artifact_chunk(self, run_id: int, node_id: str, offset: int = 0, limit: int = 16384) -> tuple[str, bool, int]:
        if not is_safe_node_id(node_id):
            raise InvalidNodeIdError(f"unsafe node_id: {node_id}")
        if run_id < 0:
            raise InvalidNodeIdError(f"unsafe run_id: {run_id}")
        safe_offset = max(0, offset)
        safe_limit = min(max(1, limit), 256 * 1024)

        artifact = self._resolve_under_root(self.root / "main" / "runs" / str(run_id) / f"{node_id}.md")
        if not artifact.exists():
            raise FileNotFoundError(str(artifact))

        try:
            def _read_chunk() -> tuple[int, bytes]:
                size_local = artifact.stat().st_size
                with artifact.open("rb") as file_obj:
                    file_obj.seek(safe_offset)
                    raw_local = file_obj.read(safe_limit)
                return size_local, raw_local

            size, raw = self._run_with_lock_retry(_read_chunk)  # type: ignore[misc]
        except OSError as exc:
            logger.error(
                "workspace_read_failed",
                extra={
                    "run_id": run_id,
                    "node_id": node_id,
                    "path": str(artifact),
                    "error_type": exc.__class__.__name__,
                },
                exc_info=True,
            )
            record_system_alert(
                level="error",
                code="workspace_read_failed",
                message="아티팩트 파일 읽기 중 Lock/권한 오류가 발생했습니다.",
                source="workspace",
                context={"run_id": run_id, "node_id": node_id, "path": str(artifact), "error_type": exc.__class__.__name__},
            )
            raise WorkspaceArtifactIOError(
                f"workspace artifact read failed: {artifact} ({exc.__class__.__name__})"
            ) from exc
        chunk = raw.decode("utf-8", errors="replace")
        next_offset = safe_offset + len(raw)
        has_more = next_offset < size
        return chunk, has_more, next_offset

    def get_task_sandbox_dir(self, run_id: int, node_id: str) -> Path:
        if not is_safe_node_id(node_id):
            raise InvalidNodeIdError(f"unsafe node_id: {node_id}")
        if run_id < 0:
            raise InvalidNodeIdError(f"unsafe run_id: {run_id}")

        sandbox_dir = self._resolve_under_root(self.root / "main" / "runs" / str(run_id) / "sandbox" / node_id)
        try:
            self._run_with_lock_retry(lambda: sandbox_dir.mkdir(parents=True, exist_ok=True))
            self._run_with_lock_retry(lambda: sandbox_dir.chmod(0o777))
        except OSError as exc:
            logger.error(
                "workspace_sandbox_access_failed",
                extra={
                    "run_id": run_id,
                    "node_id": node_id,
                    "path": str(sandbox_dir),
                    "error_type": exc.__class__.__name__,
                },
                exc_info=True,
            )
            record_system_alert(
                level="error",
                code="workspace_sandbox_access_failed",
                message="샌드박스 디렉터리 접근 중 Lock/권한 오류가 발생했습니다.",
                source="workspace",
                context={
                    "run_id": run_id,
                    "node_id": node_id,
                    "path": str(sandbox_dir),
                    "error_type": exc.__class__.__name__,
                },
            )
            raise WorkspaceArtifactIOError(
                f"workspace sandbox access failed: {sandbox_dir} ({exc.__class__.__name__})"
            ) from exc
        return sandbox_dir
