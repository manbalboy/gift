from app.services.system_alerts import record_system_alert
from app.db.session import engine
from app.db.system_alert_model import SystemAlertLog

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
    assert len(body) == 2
    assert body[0]["code"] == "test-2"
    assert body[1]["code"] == "test-1"
    assert body[0]["source"] == "test"


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
    payload = response.json()[0]

    assert payload["message"].count("***[MASKED]***") >= 2
    assert "Bearer" not in payload["message"]
    assert "/home/docker/" not in payload["message"]
    assert payload["context"]["path"] == "***[MASKED]***"
    assert payload["context"]["details"][0] == "***[MASKED]***"

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
