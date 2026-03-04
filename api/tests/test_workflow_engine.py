from .conftest import client
from .test_workflow_api import PAYLOAD


def test_run_status_progression():
    workflow = client.post("/api/workflows", json=PAYLOAD).json()
    run = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert run.status_code == 200

    run_id = run.json()["id"]
    latest = None
    for _ in range(10):
        latest = client.get(f"/api/runs/{run_id}").json()
        if latest["status"] == "done":
            break

    assert latest is not None
    assert latest["status"] == "done"
    assert all(node["status"] == "done" for node in latest["node_runs"])
    assert all(node["artifact_path"] for node in latest["node_runs"])

    constellation = client.get(f"/api/runs/{run_id}/constellation")
    assert constellation.status_code == 200
    assert len(constellation.json()["nodes"]) > 0
