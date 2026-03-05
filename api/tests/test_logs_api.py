from app.services.system_alerts import record_system_alert
from app.db.session import engine
from app.db.system_alert_model import SystemAlertLog

from datetime import datetime, timezone
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

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
    items = body["items"]
    assert len(items) == 2
    assert items[0]["code"] == "test-2"
    assert items[1]["code"] == "test-1"
    assert items[0]["source"] == "test"


def test_system_alerts_table_has_created_at_index():
    indexes = inspect(engine).get_indexes("system_alert_logs")
    assert any("created_at" in idx.get("column_names", []) for idx in indexes)


def test_system_alerts_query_plan_uses_desc_index():
    with engine.connect() as connection:
        rows = connection.execute(
            text(
                """
                EXPLAIN QUERY PLAN
                SELECT id, created_at
                FROM system_alert_logs
                ORDER BY created_at DESC, id DESC
                LIMIT 50
                """
            )
        ).fetchall()

    plan = " ".join(" ".join(str(cell) for cell in row) for row in rows)
    assert "ix_system_alert_logs_created_at_desc" in plan


def test_system_alerts_endpoint_masks_sensitive_tokens_and_paths():
    record_system_alert(
        level="error",
        code="sensitive-test",
        message="실패: Bearer abcdEFG.123_/+=token path=/home/docker/secret/token.txt",
        source="security-test",
        context={
            "path": "/root/private/key.pem",
            "details": ["Bearer anotherToken123", "ok"],
        },
    )

    response = client.get("/api/logs/system-alerts?limit=1")
    assert response.status_code == 200
    payload = response.json()["items"][0]

    assert payload["message"].count("***[MASKED]***") >= 2
    assert "Bearer" not in payload["message"]
    assert "/home/docker/" not in payload["message"]
    assert payload["context"]["path"] == "***[MASKED]***"
    assert payload["context"]["details"][0] == "***[MASKED]***"
    assert payload["risk_score"] is None

    with Session(engine) as session:
        stored = (
            session.query(SystemAlertLog)
            .filter(SystemAlertLog.code == "sensitive-test")
            .order_by(SystemAlertLog.created_at.desc(), SystemAlertLog.id.desc())
            .first()
        )
        assert stored is not None
        assert "***[MASKED]***" in stored.message
        assert "Bearer" not in stored.message
        assert "/home/docker/" not in stored.message
        assert stored.context.get("path") == "***[MASKED]***"


def test_system_alerts_exposes_risk_score_when_present():
    record_system_alert(
        level="error",
        code="risk-score-test",
        message="node repeated failure",
        source="workflow-engine",
        context={"risk_score": 91, "node_id": "code"},
    )
    response = client.get("/api/logs/system-alerts?limit=1")
    assert response.status_code == 200
    payload = response.json()["items"][0]
    assert payload["code"] == "risk-score-test"
    assert payload["risk_score"] == 91


def test_system_alerts_truncates_extreme_payload_before_masking():
    very_long = "Bearer token " + ("x" * 20000) + " /root/private/secret.txt"
    record_system_alert(
        level="error",
        code="long-payload-test",
        message=very_long,
        source="security-test",
        context={},
    )
    response = client.get("/api/logs/system-alerts?limit=1")
    assert response.status_code == 200
    payload = response.json()["items"][0]
    assert payload["code"] == "long-payload-test"
    assert len(payload["message"]) <= 10000
    assert "Bearer " not in payload["message"]


def test_system_alerts_cursor_pagination_handles_same_timestamp_without_duplicate_or_loss():
    fixed = datetime(2026, 3, 5, 0, 0, 0, tzinfo=timezone.utc)
    with Session(engine) as session:
        for idx in range(15):
            session.add(
                SystemAlertLog(
                    id=f"alert-fixed-{idx:02d}",
                    created_at=fixed,
                    level="warning",
                    code=f"fixed-{idx:02d}",
                    message=f"msg-{idx:02d}",
                    source="cursor-test",
                    context={"idx": idx},
                )
            )
        session.commit()

    first = client.get("/api/logs/system-alerts?limit=5")
    assert first.status_code == 200
    first_body = first.json()
    first_items = first_body["items"]
    assert len(first_items) == 5
    assert first_body["next_cursor"] is not None

    second = client.get(f"/api/logs/system-alerts?limit=5&cursor={first_body['next_cursor']}")
    assert second.status_code == 200
    second_body = second.json()
    second_items = second_body["items"]
    assert len(second_items) == 5
    assert second_body["next_cursor"] is not None

    third = client.get(f"/api/logs/system-alerts?limit=5&cursor={second_body['next_cursor']}")
    assert third.status_code == 200
    third_items = third.json()["items"]
    assert len(third_items) == 5

    merged_ids = [*map(lambda x: x["id"], first_items), *map(lambda x: x["id"], second_items), *map(lambda x: x["id"], third_items)]
    assert len(set(merged_ids)) == 15
    assert sorted(merged_ids) == [f"alert-fixed-{idx:02d}" for idx in range(15)]


def test_system_alerts_clear_all_endpoint_removes_current_items():
    for idx in range(3):
        record_system_alert(
            level="warning",
            code=f"clear-{idx}",
            message=f"clear-message-{idx}",
            source="clear-test",
            context={"idx": idx},
        )
    before = client.get("/api/logs/system-alerts?limit=50")
    assert before.status_code == 200
    assert len(before.json()["items"]) == 3

    cleared = client.delete("/api/logs/system-alerts")
    assert cleared.status_code == 200
    assert cleared.json()["cleared_count"] >= 3

    after = client.get("/api/logs/system-alerts?limit=50")
    assert after.status_code == 200
    assert after.json()["items"] == []
