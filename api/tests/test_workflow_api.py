import itertools
import pytest

from app.api import workflows as workflows_api

from .conftest import client


PAYLOAD = {
    "name": "Level1 SDLC",
    "description": "아이디어부터 PR까지",
    "graph": {
        "nodes": [
            {"id": "idea", "type": "task", "label": "Idea"},
            {"id": "plan", "type": "task", "label": "Plan"},
            {"id": "code", "type": "task", "label": "Code"},
            {"id": "test", "type": "task", "label": "Test"},
            {"id": "pr", "type": "task", "label": "PR"},
        ],
        "edges": [
            {"id": "e1", "source": "idea", "target": "plan"},
            {"id": "e2", "source": "plan", "target": "code"},
            {"id": "e3", "source": "code", "target": "test"},
            {"id": "e4", "source": "test", "target": "pr"},
        ],
    },
}


@pytest.fixture(autouse=True)
def reset_stream_rate_limiter():
    workflows_api.reconnect_rate_limiter.reset_for_tests()
    yield
    workflows_api.reconnect_rate_limiter.reset_for_tests()


def test_workflow_create_and_get():
    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200

    workflow_id = created.json()["id"]
    fetched = client.get(f"/api/workflows/{workflow_id}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == PAYLOAD["name"]


def test_cors_allows_manbalboy_subdomain_with_31xx_port():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://ssh.manbalboy.com:3106",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://ssh.manbalboy.com:3106"


def test_cors_allows_manbalboy_outside_31xx_port():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://ssh.manbalboy.com:3200",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://ssh.manbalboy.com:3200"


def test_cors_blocks_non_manbalboy_domain():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://evil-example.com:3100",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400


def test_cors_blocks_similar_lookalike_domain():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://amanbalboy.com:3101",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400


def test_cors_allows_manbalboy_without_31xx_port():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "https://manbalboy.com",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "https://manbalboy.com"


def test_cors_allows_localhost_31xx():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://localhost:3108",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3108"


def test_workflow_create_rejects_empty_graph():
    payload = {"name": "Empty", "description": "", "graph": {"nodes": [], "edges": []}}
    response = client.post("/api/workflows", json=payload)
    assert response.status_code == 422


def test_workflow_create_rejects_cycle_graph():
    payload = {
        "name": "Cycle",
        "description": "",
        "graph": {
            "nodes": [
                {"id": "a", "type": "task", "label": "A"},
                {"id": "b", "type": "task", "label": "B"},
            ],
            "edges": [
                {"id": "e1", "source": "a", "target": "b"},
                {"id": "e2", "source": "b", "target": "a"},
            ],
        },
    }
    response = client.post("/api/workflows", json=payload)
    assert response.status_code == 422


def test_workflow_run_rejects_unsafe_node_id_with_400():
    payload = {
        "name": "Unsafe Node",
        "description": "",
        "graph": {
            "nodes": [{"id": "../../etc/passwd", "type": "task", "label": "Bad"}],
            "edges": [],
        },
    }
    created = client.post("/api/workflows", json=payload)
    assert created.status_code == 200

    workflow_id = created.json()["id"]
    run = client.post(f"/api/workflows/{workflow_id}/runs")
    assert run.status_code == 400


def test_workflow_runs_stream_endpoint_returns_sse(monkeypatch):
    monkeypatch.setattr(workflows_api.time, "sleep", lambda _seconds: None)
    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    response = client.get(f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert f'"workflow_id": {workflow_id}' in response.text


def test_workflow_runs_stream_disconnect_releases_connection(monkeypatch):
    monkeypatch.setattr(workflows_api.time, "sleep", lambda _seconds: None)
    workflows_api.active_stream_connections = 0

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    with client.stream("GET", f"/api/workflows/{workflow_id}/runs/stream?max_ticks=5") as response:
        assert response.status_code == 200
        iterator = response.iter_lines()
        first_line = next(itertools.islice(iterator, 1))
        if isinstance(first_line, bytes):
            first_line = first_line.decode("utf-8")
        assert "event: run_status" in first_line

    assert workflows_api.active_stream_connections == 0


def test_workflow_runs_stream_rate_limit_returns_429(monkeypatch):
    monkeypatch.setattr(workflows_api.time, "sleep", lambda _seconds: None)
    monkeypatch.setattr(workflows_api.settings, "sse_reconnect_limit_per_second", 1)

    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200
    workflow_id = created.json()["id"]

    first = client.get(f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1")
    assert first.status_code == 200

    second = client.get(f"/api/workflows/{workflow_id}/runs/stream?max_ticks=1")
    assert second.status_code == 429
