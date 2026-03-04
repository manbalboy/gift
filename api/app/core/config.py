from pathlib import Path
import os


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    app_name: str = "DevFlow Agent Hub API"
    api_prefix: str = "/api"
    db_path: str = os.getenv("DEVFLOW_DB_PATH", "./api/devflow.db")
    workspaces_root: str = os.getenv("DEVFLOW_WORKSPACES_ROOT", "./api/workspaces")
    runner_backend: str = os.getenv("DEVFLOW_RUNNER_BACKEND", "docker")
    enable_host_runner: bool = _as_bool(os.getenv("DEVFLOW_ENABLE_HOST_RUNNER"), default=False)
    require_docker_ping_on_startup: bool = _as_bool(
        os.getenv("DEVFLOW_REQUIRE_DOCKER_PING_ON_STARTUP"),
        default=True,
    )
    require_docker_ping_per_run: bool = _as_bool(
        os.getenv("DEVFLOW_REQUIRE_DOCKER_PING_PER_RUN"),
        default=True,
    )
    docker_image: str = os.getenv("DEVFLOW_DOCKER_IMAGE", "bash:5.2")

    lock_backend: str = os.getenv("DEVFLOW_LOCK_BACKEND", "local")
    redis_url: str = os.getenv("DEVFLOW_REDIS_URL", "redis://localhost:6379/0")
    lock_ttl_seconds: int = int(os.getenv("DEVFLOW_LOCK_TTL_SECONDS", "30"))

    sse_reconnect_limit_per_second: int = int(os.getenv("DEVFLOW_SSE_RECONNECT_LIMIT_PER_SECOND", "2"))
    sse_rate_limit_backend: str = os.getenv("DEVFLOW_SSE_RATE_LIMIT_BACKEND", "redis")
    sse_rate_limit_window_seconds: int = int(os.getenv("DEVFLOW_SSE_RATE_LIMIT_WINDOW_SECONDS", "1"))

    @property
    def database_url(self) -> str:
        return f"sqlite:///{Path(self.db_path).resolve()}"


settings = Settings()
