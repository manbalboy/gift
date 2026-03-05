from pathlib import Path
import logging
import os

from app.services.system_alerts import record_system_alert


logger = logging.getLogger(__name__)


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_int(value: str | None, default: int, field_name: str | None = None) -> int:
    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    try:
        return int(text)
    except (TypeError, ValueError, OverflowError):
        if field_name:
            logger.warning(
                "env_int_parse_fallback",
                extra={
                    "field": field_name,
                    "raw_value": str(value),
                    "fallback": default,
                },
            )
            record_system_alert(
                level="warning",
                code="env_int_parse_fallback",
                message=f"{field_name} 파싱 실패로 기본값({default})을 사용합니다.",
                source="config",
                context={"field": field_name, "raw_value": str(value), "fallback": default},
            )
        return default


def _as_float(value: str | None, default: float, field_name: str | None = None) -> float:
    if value is None:
        return default
    text = str(value).strip()
    if not text:
        return default
    try:
        return float(text)
    except (TypeError, ValueError, OverflowError):
        if field_name:
            logger.warning(
                "env_float_parse_fallback",
                extra={
                    "field": field_name,
                    "raw_value": str(value),
                    "fallback": default,
                },
            )
            record_system_alert(
                level="warning",
                code="env_float_parse_fallback",
                message=f"{field_name} 파싱 실패로 기본값({default})을 사용합니다.",
                source="config",
                context={"field": field_name, "raw_value": str(value), "fallback": default},
            )
        return default


def _as_csv_set(value: str | None, *, lower: bool = False) -> set[str]:
    if not isinstance(value, str):
        return set()
    chunks = [item.strip() for item in value.split(",")]
    if lower:
        return {item.lower() for item in chunks if item}
    return {item for item in chunks if item}


def _parse_ports_csv(value: str | None) -> set[int]:
    if not isinstance(value, str):
        return set()

    parsed: set[int] = set()
    try:
        tokens = value.split(",")
    except Exception:
        return set()

    for token in tokens:
        chunk = token.strip()
        if not chunk:
            continue
        if "-" in chunk:
            start_text, end_text = chunk.split("-", maxsplit=1)
            if not (start_text.strip().isdigit() and end_text.strip().isdigit()):
                continue
            try:
                start = int(start_text.strip())
                end = int(end_text.strip())
            except (TypeError, ValueError, OverflowError):
                continue
            if start > end:
                start, end = end, start
            for port in range(start, end + 1):
                if 1 <= port <= 65535:
                    parsed.add(port)
            continue
        if chunk.isdigit():
            try:
                port = int(chunk)
            except (TypeError, ValueError, OverflowError):
                continue
            if 1 <= port <= 65535:
                parsed.add(port)
    return parsed


def _port_range(start: int, end: int) -> set[int]:
    if start > end:
        start, end = end, start
    return {port for port in range(start, end + 1) if 1 <= port <= 65535}


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
    docker_ping_cache_ttl_seconds: float = _as_float(
        os.getenv("DEVFLOW_DOCKER_PING_CACHE_TTL_SECONDS"),
        15.0,
        "DEVFLOW_DOCKER_PING_CACHE_TTL_SECONDS",
    )
    docker_ping_negative_cache_ttl_seconds: float = _as_float(
        os.getenv("DEVFLOW_DOCKER_PING_NEGATIVE_CACHE_TTL_SECONDS"),
        4.0,
        "DEVFLOW_DOCKER_PING_NEGATIVE_CACHE_TTL_SECONDS",
    )
    docker_image: str = os.getenv("DEVFLOW_DOCKER_IMAGE", "bash:5.2")
    github_webhook_secret: str = os.getenv("DEVFLOW_GITHUB_WEBHOOK_SECRET", "")
    generic_webhook_secret: str = os.getenv("DEVFLOW_GENERIC_WEBHOOK_SECRET", "")
    viewer_token: str = os.getenv("DEVFLOW_VIEWER_TOKEN", "")
    human_gate_approver_token: str = os.getenv("DEVFLOW_HUMAN_GATE_APPROVER_TOKEN", "")
    human_gate_session_secret: str = os.getenv("DEVFLOW_HUMAN_GATE_SESSION_SECRET", "")
    human_gate_session_ttl_seconds: int = _as_int(
        os.getenv("DEVFLOW_HUMAN_GATE_SESSION_TTL_SECONDS"),
        1800,
        "DEVFLOW_HUMAN_GATE_SESSION_TTL_SECONDS",
    )
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
    lock_ttl_seconds: int = _as_int(os.getenv("DEVFLOW_LOCK_TTL_SECONDS"), 30, "DEVFLOW_LOCK_TTL_SECONDS")

    sse_reconnect_limit_per_second: int = _as_int(
        os.getenv("DEVFLOW_SSE_RECONNECT_LIMIT_PER_SECOND"),
        2,
        "DEVFLOW_SSE_RECONNECT_LIMIT_PER_SECOND",
    )
    sse_rate_limit_backend: str = os.getenv("DEVFLOW_SSE_RATE_LIMIT_BACKEND", "redis")
    sse_rate_limit_window_seconds: int = _as_int(
        os.getenv("DEVFLOW_SSE_RATE_LIMIT_WINDOW_SECONDS"),
        1,
        "DEVFLOW_SSE_RATE_LIMIT_WINDOW_SECONDS",
    )
    sse_heartbeat_interval_seconds: float = _as_float(
        os.getenv("DEVFLOW_SSE_HEARTBEAT_INTERVAL_SECONDS"),
        15.0,
        "DEVFLOW_SSE_HEARTBEAT_INTERVAL_SECONDS",
    )
    sse_local_fallback_limit_ratio: float = _as_float(
        os.getenv("DEVFLOW_SSE_LOCAL_FALLBACK_LIMIT_RATIO"),
        0.5,
        "DEVFLOW_SSE_LOCAL_FALLBACK_LIMIT_RATIO",
    )
    sse_redis_fallback_ttl_seconds: float = _as_float(
        os.getenv("DEVFLOW_SSE_REDIS_FALLBACK_TTL_SECONDS"),
        4.0,
        "DEVFLOW_SSE_REDIS_FALLBACK_TTL_SECONDS",
    )
    sse_trusted_proxy_ips: str = os.getenv("DEVFLOW_SSE_TRUSTED_PROXY_IPS", "127.0.0.1,::1")
    webhook_rate_limit_per_window: int = _as_int(
        os.getenv("DEVFLOW_WEBHOOK_RATE_LIMIT_PER_WINDOW"),
        10,
        "DEVFLOW_WEBHOOK_RATE_LIMIT_PER_WINDOW",
    )
    webhook_rate_limit_window_seconds: float = _as_float(
        os.getenv("DEVFLOW_WEBHOOK_RATE_LIMIT_WINDOW_SECONDS"),
        5.0,
        "DEVFLOW_WEBHOOK_RATE_LIMIT_WINDOW_SECONDS",
    )
    webhook_trusted_proxy_ips: str = os.getenv("DEVFLOW_WEBHOOK_TRUSTED_PROXY_IPS", "127.0.0.1,::1")
    workflow_node_max_retries: int = _as_int(
        os.getenv("DEVFLOW_WORKFLOW_NODE_MAX_RETRIES"),
        3,
        "DEVFLOW_WORKFLOW_NODE_MAX_RETRIES",
    )
    workflow_control_token: str = os.getenv("DEVFLOW_WORKFLOW_CONTROL_TOKEN", "")
    workflow_control_roles: str = os.getenv("DEVFLOW_WORKFLOW_CONTROL_ROLES", "")
    workflow_node_iteration_budget: int = _as_int(
        os.getenv("DEVFLOW_WORKFLOW_NODE_ITERATION_BUDGET"),
        8,
        "DEVFLOW_WORKFLOW_NODE_ITERATION_BUDGET",
    )
    workflow_node_timeout_seconds: float = _as_float(
        os.getenv("DEVFLOW_WORKFLOW_NODE_TIMEOUT_SECONDS"),
        1800.0,
        "DEVFLOW_WORKFLOW_NODE_TIMEOUT_SECONDS",
    )
    workflow_retry_backoff_seconds: float = _as_float(
        os.getenv("DEVFLOW_WORKFLOW_RETRY_BACKOFF_SECONDS"),
        0.25,
        "DEVFLOW_WORKFLOW_RETRY_BACKOFF_SECONDS",
    )
    workflow_worker_poll_interval_seconds: float = _as_float(
        os.getenv("DEVFLOW_WORKFLOW_WORKER_POLL_INTERVAL_SECONDS"),
        0.1,
        "DEVFLOW_WORKFLOW_WORKER_POLL_INTERVAL_SECONDS",
    )
    workflow_approval_poll_interval_seconds: float = _as_float(
        os.getenv("DEVFLOW_WORKFLOW_APPROVAL_POLL_INTERVAL_SECONDS"),
        0.2,
        "DEVFLOW_WORKFLOW_APPROVAL_POLL_INTERVAL_SECONDS",
    )
    workflow_cancel_join_timeout_seconds: float = _as_float(
        os.getenv("DEVFLOW_WORKFLOW_CANCEL_JOIN_TIMEOUT_SECONDS"),
        2.0,
        "DEVFLOW_WORKFLOW_CANCEL_JOIN_TIMEOUT_SECONDS",
    )
    workflow_human_gate_stale_hours: int = _as_int(
        os.getenv("DEVFLOW_WORKFLOW_HUMAN_GATE_STALE_HOURS"),
        24,
        "DEVFLOW_WORKFLOW_HUMAN_GATE_STALE_HOURS",
    )
    preview_viewer_token_secret: str = os.getenv("DEVFLOW_PREVIEW_VIEWER_TOKEN_SECRET", "")
    preview_viewer_issue_secret: str = os.getenv("DEVFLOW_PREVIEW_VIEWER_ISSUE_SECRET", "")
    preview_viewer_token_ttl_seconds: int = _as_int(
        os.getenv("DEVFLOW_PREVIEW_VIEWER_TOKEN_TTL_SECONDS"),
        180,
        "DEVFLOW_PREVIEW_VIEWER_TOKEN_TTL_SECONDS",
    )
    preview_protected_port_start: int = _as_int(
        os.getenv("DEVFLOW_PREVIEW_PROTECTED_PORT_START"),
        3100,
        "DEVFLOW_PREVIEW_PROTECTED_PORT_START",
    )
    preview_protected_port_end: int = _as_int(
        os.getenv("DEVFLOW_PREVIEW_PROTECTED_PORT_END"),
        3199,
        "DEVFLOW_PREVIEW_PROTECTED_PORT_END",
    )
    localhost_spoof_guard_ports: str = os.getenv("DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS", "3100-3199")

    @property
    def database_url(self) -> str:
        return f"sqlite:///{Path(self.db_path).resolve()}"

    @property
    def trusted_webhook_proxy_ips(self) -> set[str]:
        return _as_csv_set(self.webhook_trusted_proxy_ips)

    @property
    def trusted_sse_proxy_ips(self) -> set[str]:
        return _as_csv_set(self.sse_trusted_proxy_ips)

    @property
    def allowed_webhook_source_ips(self) -> set[str]:
        return _as_csv_set(self.webhook_allowed_source_ips)

    @property
    def allowed_human_gate_roles(self) -> set[str]:
        return _as_csv_set(self.human_gate_approver_roles, lower=True)

    @property
    def allowed_human_gate_workspaces(self) -> set[str]:
        parsed = _as_csv_set(self.human_gate_approver_workspaces, lower=True)
        if not parsed:
            return {self.default_workspace_id.strip().lower() or "main"}
        return parsed

    @property
    def allowed_workflow_control_roles(self) -> set[str]:
        return _as_csv_set(self.workflow_control_roles, lower=True)

    @property
    def spoof_guard_ports(self) -> set[int]:
        parsed = _parse_ports_csv(self.localhost_spoof_guard_ports)
        if parsed:
            return parsed
        fallback = _port_range(self.preview_protected_port_start, self.preview_protected_port_end)
        if fallback:
            return fallback
        return _port_range(3100, 3199)


settings = Settings()
