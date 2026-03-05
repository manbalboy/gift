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
    docker_ping_cache_ttl_seconds: float = float(os.getenv("DEVFLOW_DOCKER_PING_CACHE_TTL_SECONDS", "15"))
    docker_ping_negative_cache_ttl_seconds: float = float(
        os.getenv("DEVFLOW_DOCKER_PING_NEGATIVE_CACHE_TTL_SECONDS", "4")
    )
    docker_image: str = os.getenv("DEVFLOW_DOCKER_IMAGE", "bash:5.2")
    github_webhook_secret: str = os.getenv("DEVFLOW_GITHUB_WEBHOOK_SECRET", "")
    generic_webhook_secret: str = os.getenv("DEVFLOW_GENERIC_WEBHOOK_SECRET", "")
    human_gate_approver_token: str = os.getenv("DEVFLOW_HUMAN_GATE_APPROVER_TOKEN", "")
    human_gate_session_secret: str = os.getenv("DEVFLOW_HUMAN_GATE_SESSION_SECRET", "")
    human_gate_session_ttl_seconds: int = int(os.getenv("DEVFLOW_HUMAN_GATE_SESSION_TTL_SECONDS", "1800"))
    human_gate_session_secure_cookie: bool = _as_bool(
        os.getenv("DEVFLOW_HUMAN_GATE_SESSION_SECURE_COOKIE"),
        default=False,
    )
    human_gate_approver_roles: str = os.getenv("DEVFLOW_HUMAN_GATE_APPROVER_ROLES", "reviewer,admin")
    human_gate_approver_workspaces: str = os.getenv("DEVFLOW_HUMAN_GATE_APPROVER_WORKSPACES", "main")
    default_workspace_id: str = os.getenv("DEVFLOW_DEFAULT_WORKSPACE_ID", "main")
    webhook_allowed_source_ips: str = os.getenv("DEVFLOW_WEBHOOK_ALLOWED_SOURCE_IPS", "*")

    lock_backend: str = os.getenv("DEVFLOW_LOCK_BACKEND", "local")
    redis_url: str = os.getenv("DEVFLOW_REDIS_URL", "redis://localhost:6379/0")
    lock_ttl_seconds: int = int(os.getenv("DEVFLOW_LOCK_TTL_SECONDS", "30"))

    sse_reconnect_limit_per_second: int = int(os.getenv("DEVFLOW_SSE_RECONNECT_LIMIT_PER_SECOND", "2"))
    sse_rate_limit_backend: str = os.getenv("DEVFLOW_SSE_RATE_LIMIT_BACKEND", "redis")
    sse_rate_limit_window_seconds: int = int(os.getenv("DEVFLOW_SSE_RATE_LIMIT_WINDOW_SECONDS", "1"))
    sse_heartbeat_interval_seconds: float = float(os.getenv("DEVFLOW_SSE_HEARTBEAT_INTERVAL_SECONDS", "15"))
    sse_local_fallback_limit_ratio: float = float(os.getenv("DEVFLOW_SSE_LOCAL_FALLBACK_LIMIT_RATIO", "0.5"))
    sse_redis_fallback_ttl_seconds: float = float(os.getenv("DEVFLOW_SSE_REDIS_FALLBACK_TTL_SECONDS", "4"))
    sse_trusted_proxy_ips: str = os.getenv("DEVFLOW_SSE_TRUSTED_PROXY_IPS", "127.0.0.1,::1")
    webhook_rate_limit_per_window: int = int(os.getenv("DEVFLOW_WEBHOOK_RATE_LIMIT_PER_WINDOW", "10"))
    webhook_rate_limit_window_seconds: float = float(os.getenv("DEVFLOW_WEBHOOK_RATE_LIMIT_WINDOW_SECONDS", "5"))
    webhook_trusted_proxy_ips: str = os.getenv("DEVFLOW_WEBHOOK_TRUSTED_PROXY_IPS", "127.0.0.1,::1")
    workflow_node_max_retries: int = int(os.getenv("DEVFLOW_WORKFLOW_NODE_MAX_RETRIES", "3"))
    workflow_retry_backoff_seconds: float = float(os.getenv("DEVFLOW_WORKFLOW_RETRY_BACKOFF_SECONDS", "0.25"))
    workflow_worker_poll_interval_seconds: float = float(
        os.getenv("DEVFLOW_WORKFLOW_WORKER_POLL_INTERVAL_SECONDS", "0.1")
    )
    workflow_approval_poll_interval_seconds: float = float(
        os.getenv("DEVFLOW_WORKFLOW_APPROVAL_POLL_INTERVAL_SECONDS", "0.2")
    )
    workflow_cancel_join_timeout_seconds: float = float(
        os.getenv("DEVFLOW_WORKFLOW_CANCEL_JOIN_TIMEOUT_SECONDS", "2")
    )
    workflow_human_gate_stale_hours: int = int(os.getenv("DEVFLOW_WORKFLOW_HUMAN_GATE_STALE_HOURS", "24"))
    preview_viewer_token_secret: str = os.getenv("DEVFLOW_PREVIEW_VIEWER_TOKEN_SECRET", "")
    preview_viewer_issue_secret: str = os.getenv("DEVFLOW_PREVIEW_VIEWER_ISSUE_SECRET", "")
    preview_viewer_token_ttl_seconds: int = int(os.getenv("DEVFLOW_PREVIEW_VIEWER_TOKEN_TTL_SECONDS", "180"))
    preview_protected_port_start: int = int(os.getenv("DEVFLOW_PREVIEW_PROTECTED_PORT_START", "7000"))
    preview_protected_port_end: int = int(os.getenv("DEVFLOW_PREVIEW_PROTECTED_PORT_END", "7099"))

    @property
    def database_url(self) -> str:
        return f"sqlite:///{Path(self.db_path).resolve()}"

    @property
    def trusted_webhook_proxy_ips(self) -> set[str]:
        values = [item.strip() for item in self.webhook_trusted_proxy_ips.split(",")]
        return {item for item in values if item}

    @property
    def trusted_sse_proxy_ips(self) -> set[str]:
        values = [item.strip() for item in self.sse_trusted_proxy_ips.split(",")]
        return {item for item in values if item}

    @property
    def allowed_webhook_source_ips(self) -> set[str]:
        values = [item.strip() for item in self.webhook_allowed_source_ips.split(",")]
        return {item for item in values if item}

    @property
    def allowed_human_gate_roles(self) -> set[str]:
        values = [item.strip().lower() for item in self.human_gate_approver_roles.split(",")]
        return {item for item in values if item}

    @property
    def allowed_human_gate_workspaces(self) -> set[str]:
        values = [item.strip().lower() for item in self.human_gate_approver_workspaces.split(",")]
        parsed = {item for item in values if item}
        if not parsed:
            return {self.default_workspace_id.strip().lower() or "main"}
        return parsed


settings = Settings()
