import hmac
from ipaddress import ip_address

from fastapi import HTTPException, Request

from app.core.config import settings


def _host_and_port(host_header: str) -> tuple[str, int | None]:
    host = host_header.strip().lower()
    if not host:
        return "", None
    if host.startswith("[") and "]" in host:
        end = host.find("]")
        name = host[1:end]
        remainder = host[end + 1 :]
        if remainder.startswith(":") and remainder[1:].isdigit():
            return name, int(remainder[1:])
        return name, None
    if ":" not in host:
        return host, None
    name, port_text = host.rsplit(":", maxsplit=1)
    if port_text.isdigit():
        return name, int(port_text)
    return host, None


def _is_localhost_host(host: str) -> bool:
    return host in {"localhost", "127.0.0.1", "::1"}


def _is_local_client_host(host: str) -> bool:
    return host in {"localhost", "127.0.0.1", "::1", "testclient"}


def _is_local_ip_literal(value: str) -> bool:
    candidate = value.strip()
    if not candidate:
        return False
    try:
        parsed = ip_address(candidate)
    except ValueError:
        return False
    return parsed.is_loopback


def _enforce_localhost_spoof_guard(request: Request) -> None:
    host_name, host_port = _host_and_port(request.headers.get("host", ""))
    guarded_ports = settings.spoof_guard_ports
    if not (_is_localhost_host(host_name) and host_port is not None and host_port in guarded_ports):
        return

    client_host = (request.client.host if request.client else "").strip().lower()
    if client_host and not (_is_local_client_host(client_host) or _is_local_ip_literal(client_host)):
        raise HTTPException(status_code=403, detail="blocked localhost host spoofing attempt")

    forwarded_host = request.headers.get("x-forwarded-host", "").strip()
    if forwarded_host:
        forwarded_name, forwarded_port = _host_and_port(forwarded_host)
        if _is_localhost_host(forwarded_name) and (forwarded_port is None or forwarded_port in guarded_ports):
            raise HTTPException(status_code=403, detail="blocked localhost host spoofing attempt")

    forwarded_for = request.headers.get("x-forwarded-for", "").strip()
    if not forwarded_for:
        return
    for candidate in (item.strip() for item in forwarded_for.split(",")):
        if not candidate:
            continue
        if not _is_local_ip_literal(candidate):
            raise HTTPException(status_code=403, detail="blocked localhost ip spoofing attempt")


def _extract_viewer_token(request: Request) -> str:
    bearer = request.headers.get("Authorization", "").strip()
    if bearer.lower().startswith("bearer "):
        return bearer[7:].strip()
    return request.headers.get("X-Viewer-Token", "").strip()


def require_viewer_token(request: Request) -> None:
    path = request.url.path.rstrip("/")
    if path == f"{settings.api_prefix}/preview/viewer-token":
        return
    if path == "/health":
        return

    _enforce_localhost_spoof_guard(request)

    configured = settings.viewer_token.strip()
    if not configured:
        raise HTTPException(status_code=500, detail="viewer token is not configured")

    provided = _extract_viewer_token(request)
    if not provided:
        raise HTTPException(status_code=401, detail="missing viewer token")
    if not hmac.compare_digest(provided, configured):
        raise HTTPException(status_code=401, detail="invalid viewer token")
