from concurrent.futures import ThreadPoolExecutor
import time

from app.api import loop_engine as loop_engine_api

from .conftest import client


def _wait_until(predicate, timeout: float = 2.5) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


def _loop_control_headers(token: str | None = None, role: str | None = None) -> dict[str, str]:
    headers: dict[str, str] = {}
    if token is not None:
        headers['X-Workflow-Control-Token'] = token
    if role is not None:
        headers['X-Workflow-Control-Role'] = role
    return headers


def test_loop_engine_lifecycle_and_status():
    start_response = client.post('/api/loop/start')
    assert start_response.status_code == 200
    started = start_response.json()
    assert started['mode'] == 'running'

    assert _wait_until(lambda: client.get('/api/loop/status').json().get('emitted_alert_count', 0) >= 2)

    pause_response = client.post('/api/loop/pause')
    assert pause_response.status_code == 200
    paused = pause_response.json()
    assert paused['mode'] == 'paused'

    stop_response = client.post('/api/loop/stop')
    assert stop_response.status_code == 200
    stopped = stop_response.json()
    assert stopped['mode'] in {'idle', 'stopped'}


def test_loop_engine_control_requires_workflow_token_when_configured(monkeypatch):
    monkeypatch.setattr(loop_engine_api.settings, 'workflow_control_token', 'loop-control-secret')

    missing = client.post('/api/loop/start')
    assert missing.status_code == 401
    assert missing.json()['detail'] == 'missing workflow control token'

    invalid = client.post('/api/loop/start', headers=_loop_control_headers(token='wrong-token'))
    assert invalid.status_code == 403
    assert invalid.json()['detail'] == 'invalid workflow control token'

    allowed = client.post('/api/loop/start', headers=_loop_control_headers(token='loop-control-secret'))
    assert allowed.status_code == 200
    assert allowed.json()['mode'] == 'running'
    client.post('/api/loop/stop', headers=_loop_control_headers(token='loop-control-secret'))


def test_loop_engine_control_requires_allowed_role_when_configured(monkeypatch):
    monkeypatch.setattr(loop_engine_api.settings, 'workflow_control_roles', 'operator,admin')

    missing = client.post('/api/loop/start')
    assert missing.status_code == 403
    assert missing.json()['detail'] == 'missing workflow control role'

    invalid = client.post('/api/loop/start', headers=_loop_control_headers(role='guest'))
    assert invalid.status_code == 403
    assert invalid.json()['detail'] == 'insufficient workflow control role'

    allowed = client.post('/api/loop/start', headers=_loop_control_headers(role='operator'))
    assert allowed.status_code == 200
    assert allowed.json()['mode'] == 'running'
    client.post('/api/loop/stop', headers=_loop_control_headers(role='operator'))


def test_loop_engine_concurrent_start_requests_do_not_duplicate_start_alerts():
    def issue_start() -> int:
        return client.post('/api/loop/start').status_code

    with ThreadPoolExecutor(max_workers=6) as executor:
        statuses = list(executor.map(lambda _: issue_start(), range(6)))

    assert statuses
    assert all(status == 200 for status in statuses)

    assert _wait_until(lambda: client.get('/api/loop/status').json().get('emitted_alert_count', 0) >= 1)

    alerts = client.get('/api/logs/system-alerts?limit=50').json().get('items', [])
    loop_start_count = sum(1 for item in alerts if item.get('code') == 'LOOP_START')
    assert loop_start_count == 1

    client.post('/api/loop/stop')


def test_loop_engine_generates_system_alerts_with_quality_context():
    client.post('/api/loop/start')

    assert _wait_until(
        lambda: any(
            item['code'].startswith('LOOP_') and item.get('context', {}).get('loop')
            for item in client.get('/api/logs/system-alerts?limit=20').json().get('items', [])
        ),
        timeout=3.5,
    )

    alerts_response = client.get('/api/logs/system-alerts?limit=20')
    assert alerts_response.status_code == 200
    items = alerts_response.json()['items']
    loop_items = [item for item in items if item['source'] == 'loop-engine']
    assert loop_items
    assert any(item.get('risk_score') is not None for item in loop_items)

    client.post('/api/loop/stop')
