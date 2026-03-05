import pytest
import time

from app.core.config import _as_float, _as_int, settings
from app.services.agent_runner import DockerRunner
from .conftest import client


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost",
        "https://localhost",
        "http://localhost:3109",
        "http://127.0.0.1",
        "https://127.0.0.1:3101",
        "https://127.0.0.1:3199",
        "https://manbalboy.com",
        "http://manbalboy.com:3102",
        "http://ssh.manbalboy.com:3105",
    ],
)
def test_cors_allows_expected_origins(origin: str):
    response = client.options(
        "/api/workflows",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin


@pytest.mark.parametrize(
    "origin",
    [
        "http://evil-example.com:3100",
        "http://manbalboy.com.evil.com:3100",
        "http://amanbalboy.com:3101",
        "http://localhost:2999",
        "http://127.0.0.1:7100",
        "http://ssh.manbalboy.com:3200",
    ],
)
def test_cors_blocks_untrusted_origins(origin: str):
    response = client.options(
        "/api/workflows",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 400


def test_cors_blocks_untrusted_origin_on_non_preflight_request():
    response = client.get(
        "/api/workflows",
        headers={"Origin": "http://evil-example.com:3100"},
    )
    assert response.status_code == 403


def test_webhook_rejects_payload_larger_than_5mb(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json={
            "provider": "jenkins",
            "event_type": "ci.completed",
            "blob": "a" * (5 * 1024 * 1024 + 1),
        },
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "payload too large"


def test_webhook_rejects_boolean_workflow_id(monkeypatch):
    monkeypatch.setattr(settings, "generic_webhook_secret", "test-generic-secret")

    response = client.post(
        "/api/webhooks/dev-integration",
        headers={"X-API-Secret": "test-generic-secret"},
        json={"provider": "jenkins", "event_type": "ci.completed", "workflow_id": True},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "workflow_id must be an integer"


def test_docker_ping_negative_cache_fail_fast(monkeypatch, tmp_path):
    calls = {"count": 0}

    class RunResult:
        returncode = 1
        stdout = ""
        stderr = "daemon down"

    def fake_run(*_args, **_kwargs):
        calls["count"] += 1
        time.sleep(0.05)
        return RunResult()

    monkeypatch.setattr("subprocess.run", fake_run)
    runner = DockerRunner(timeout_seconds=1, image="bash:5.2", workspaces_root=str(tmp_path))
    runner._docker_ping_negative_ttl = 4
    runner._docker_ping_negative_cache_until = 0

    first_started = time.monotonic()
    with pytest.raises(RuntimeError):
        runner._docker_ping()
    first_elapsed = time.monotonic() - first_started

    second_started = time.monotonic()
    with pytest.raises(RuntimeError):
        runner._docker_ping()
    second_elapsed = time.monotonic() - second_started

    assert calls["count"] == 1
    assert first_elapsed >= 0.05
    assert second_elapsed < 0.02


def test_preview_port_requires_one_time_viewer_token(monkeypatch):
    monkeypatch.setattr(settings, "preview_viewer_issue_secret", "issue-secret")
    monkeypatch.setattr(settings, "preview_protected_port_start", 3100)
    monkeypatch.setattr(settings, "preview_protected_port_end", 3199)

    denied = client.post("/api/preview/viewer-token")
    assert denied.status_code == 403

    issued = client.post("/api/preview/viewer-token", headers={"X-Preview-Issue-Secret": "issue-secret"})
    assert issued.status_code == 200
    token = issued.json()["token"]
    assert isinstance(token, str) and token

    missing_token = client.get("/api/workflows", headers={"Host": "localhost:3108"})
    assert missing_token.status_code == 403
    assert missing_token.json()["detail"] == "preview viewer token is required"

    first = client.get(
        "/api/workflows",
        headers={"Host": "localhost:3108", "X-Preview-Viewer-Token": token},
    )
    assert first.status_code == 200

    reused = client.get(
        "/api/workflows",
        headers={"Host": "localhost:3108", "X-Preview-Viewer-Token": token},
    )
    assert reused.status_code == 403
    assert reused.json()["detail"] == "invalid or expired preview viewer token"


def test_viewer_token_issue_endpoint_is_exempt_from_viewer_token_check(monkeypatch):
    monkeypatch.setattr(settings, "preview_viewer_issue_secret", "issue-secret")
    monkeypatch.setattr(settings, "preview_protected_port_start", 3100)
    monkeypatch.setattr(settings, "preview_protected_port_end", 3199)

    response = client.post(
        "/api/preview/viewer-token",
        headers={"Host": "localhost:3108", "X-Preview-Issue-Secret": "issue-secret"},
    )
    assert response.status_code == 200
    assert response.json().get("token")


def test_global_viewer_token_blocks_direct_api_access_without_token(monkeypatch):
    monkeypatch.setattr(settings, "viewer_token", "viewer-secret")

    missing = client.get("/api/workflows", headers={"X-Viewer-Token": ""})
    assert missing.status_code == 401
    assert missing.json()["detail"] == "missing viewer token"

    invalid = client.get("/api/workflows", headers={"X-Viewer-Token": "wrong"})
    assert invalid.status_code == 401
    assert invalid.json()["detail"] == "invalid viewer token"


def test_global_viewer_token_allows_request_with_valid_token(monkeypatch):
    monkeypatch.setattr(settings, "viewer_token", "viewer-secret")

    response = client.get("/api/workflows", headers={"Authorization": "Bearer viewer-secret"})
    assert response.status_code == 200


def test_viewer_token_fail_closed_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "viewer_token", "")

    response = client.get("/api/workflows")
    assert response.status_code == 500
    assert response.json()["detail"] == "viewer token is not configured"


def test_localhost_31xx_spoofed_forwarded_for_is_blocked(monkeypatch):
    monkeypatch.setattr(settings, "viewer_token", "viewer-secret")
    monkeypatch.setattr(settings, "preview_viewer_issue_secret", "issue-secret")
    monkeypatch.setattr(settings, "preview_protected_port_start", 3100)
    monkeypatch.setattr(settings, "preview_protected_port_end", 3199)

    issued = client.post("/api/preview/viewer-token", headers={"X-Preview-Issue-Secret": "issue-secret"})
    assert issued.status_code == 200
    token = issued.json()["token"]

    spoofed = client.get(
        "/api/workflows",
        headers={
            "Host": "localhost:3108",
            "X-Preview-Viewer-Token": token,
            "X-Viewer-Token": "viewer-secret",
            "X-Forwarded-For": "203.0.113.10",
        },
    )
    assert spoofed.status_code == 403
    assert spoofed.json()["detail"] == "blocked localhost ip spoofing attempt"


def test_localhost_spoof_guard_ports_are_configurable(monkeypatch):
    monkeypatch.setattr(settings, "viewer_token", "viewer-secret")
    monkeypatch.setattr(settings, "preview_viewer_issue_secret", "issue-secret")
    monkeypatch.setattr(settings, "preview_protected_port_start", 4100)
    monkeypatch.setattr(settings, "preview_protected_port_end", 4100)
    monkeypatch.setattr(settings, "localhost_spoof_guard_ports", "4100,4200-4201")

    issued = client.post("/api/preview/viewer-token", headers={"X-Preview-Issue-Secret": "issue-secret"})
    assert issued.status_code == 200
    token = issued.json()["token"]

    blocked = client.get(
        "/api/workflows",
        headers={
            "Host": "localhost:4100",
            "X-Preview-Viewer-Token": token,
            "X-Viewer-Token": "viewer-secret",
            "X-Forwarded-For": "203.0.113.10",
        },
    )
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "blocked localhost ip spoofing attempt"

    allowed = client.get(
        "/api/workflows",
        headers={
            "Host": "localhost:3108",
            "X-Viewer-Token": "viewer-secret",
            "X-Forwarded-For": "203.0.113.10",
        },
    )
    assert allowed.status_code == 200


def test_localhost_spoof_guard_ports_fallback_to_preview_range_when_invalid(monkeypatch):
    monkeypatch.setattr(settings, "localhost_spoof_guard_ports", "invalid,abc-def")
    monkeypatch.setattr(settings, "preview_protected_port_start", 3104)
    monkeypatch.setattr(settings, "preview_protected_port_end", 3106)

    assert settings.spoof_guard_ports == {3104, 3105, 3106}


def test_localhost_spoof_guard_ports_parser_handles_special_and_boundary_input(monkeypatch):
    monkeypatch.setattr(settings, "localhost_spoof_guard_ports", " ,@@@,65535,65536,-1,3200-3198,3100-3101,abc-123")
    parsed = settings.spoof_guard_ports
    assert 65535 in parsed
    assert 65536 not in parsed
    assert parsed.issuperset({3100, 3101, 3198, 3199, 3200})


def test_localhost_spoof_guard_ports_parser_handles_none_input(monkeypatch):
    monkeypatch.setattr(settings, "localhost_spoof_guard_ports", None)
    monkeypatch.setattr(settings, "preview_protected_port_start", 3110)
    monkeypatch.setattr(settings, "preview_protected_port_end", 3111)
    assert settings.spoof_guard_ports == {3110, 3111}


def test_localhost_spoof_guard_ports_parser_handles_empty_string(monkeypatch):
    monkeypatch.setattr(settings, "localhost_spoof_guard_ports", "   ")
    monkeypatch.setattr(settings, "preview_protected_port_start", 3120)
    monkeypatch.setattr(settings, "preview_protected_port_end", 3122)
    assert settings.spoof_guard_ports == {3120, 3121, 3122}


def test_localhost_spoof_guard_ports_parser_ignores_overflow_ranges(monkeypatch):
    monkeypatch.setattr(settings, "localhost_spoof_guard_ports", "9999999999-10000000000,3100")
    parsed = settings.spoof_guard_ports
    assert parsed == {3100}


def test_config_safe_int_parser_falls_back_on_invalid_values():
    assert _as_int(None, 7) == 7
    assert _as_int("", 7) == 7
    assert _as_int("  ", 7) == 7
    assert _as_int("@@@", 7) == 7
    assert _as_int("10", 7) == 10


def test_config_safe_float_parser_falls_back_on_invalid_values():
    assert _as_float(None, 0.5) == 0.5
    assert _as_float("", 0.5) == 0.5
    assert _as_float("NaNNaN", 0.5) == 0.5
    assert _as_float("1.25", 0.5) == 1.25
