import re
from pathlib import Path

from app.core.config import settings


NODE_ID_SAFE_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


class InvalidNodeIdError(ValueError):
    pass


def is_safe_node_id(node_id: str) -> bool:
    return NODE_ID_SAFE_PATTERN.match(node_id) is not None


class WorkspaceService:
    def __init__(self) -> None:
        self.root = Path(settings.workspaces_root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve_under_root(self, path: Path) -> Path:
        resolved = path.resolve()
        if resolved != self.root and self.root not in resolved.parents:
            raise InvalidNodeIdError(f"unsafe workspace path: {path}")
        return resolved

    def write_artifact(self, run_id: int, node_id: str, content: str) -> str:
        if not is_safe_node_id(node_id):
            raise InvalidNodeIdError(f"unsafe node_id: {node_id}")
        if run_id < 0:
            raise InvalidNodeIdError(f"unsafe run_id: {run_id}")

        target_dir = self._resolve_under_root(self.root / "main" / "runs" / str(run_id))
        target_dir.mkdir(parents=True, exist_ok=True)
        artifact = self._resolve_under_root(target_dir / f"{node_id}.md")
        artifact.write_text(content, encoding="utf-8")
        return str(artifact)
