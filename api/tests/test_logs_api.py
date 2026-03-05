from app.services.system_alerts import record_system_alert

from .conftest import client


def test_system_alerts_endpoint_returns_latest_first_and_applies_limit():
    for idx in range(3):
        record_system_alert(
            level="warning",
            code=f"test-{idx}",
            message=f"message-{idx}",
            source="test",
            context={"idx": idx},
        )

    response = client.get("/api/logs/system-alerts?limit=2")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert body[0]["code"] == "test-2"
    assert body[1]["code"] == "test-1"
    assert body[0]["source"] == "test"
