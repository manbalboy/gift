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


def test_workflow_create_and_get():
    created = client.post("/api/workflows", json=PAYLOAD)
    assert created.status_code == 200

    workflow_id = created.json()["id"]
    fetched = client.get(f"/api/workflows/{workflow_id}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == PAYLOAD["name"]


def test_cors_allows_manbalboy_subdomain_with_port():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://ssh.manbalboy.com:7000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://ssh.manbalboy.com:7000"


def test_cors_blocks_non_manbalboy_domain():
    response = client.options(
        "/api/workflows",
        headers={
            "Origin": "http://evil-example.com:7000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400


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
