from .conftest import client


def _payload(slug: str):
    return {
        "name": "Code Reviewer",
        "slug": slug,
        "description": "PR quality gate",
        "version": "1.2.0",
        "status": "active",
        "input_schema": {"type": "object", "required": ["diff"]},
        "output_schema": {"type": "object", "required": ["summary"]},
        "tools": ["git", "pytest"],
        "prompt_policy": {"tone": "strict", "language": "ko"},
        "template_package": "agent/reviewer@1.2.0",
    }


def test_agents_crud_roundtrip():
    created = client.post("/api/agents", json=_payload("code-reviewer"))
    assert created.status_code == 200
    agent_id = created.json()["id"]

    listed = client.get("/api/agents")
    assert listed.status_code == 200
    assert any(item["id"] == agent_id for item in listed.json())

    fetched = client.get(f"/api/agents/{agent_id}")
    assert fetched.status_code == 200
    assert fetched.json()["slug"] == "code-reviewer"

    updated = client.put(
        f"/api/agents/{agent_id}",
        json={
            **_payload("code-reviewer"),
            "version": "1.3.0",
            "tools": ["git", "pytest", "ruff"],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["version"] == "1.3.0"
    assert updated.json()["tools"] == ["git", "pytest", "ruff"]

    deleted = client.delete(f"/api/agents/{agent_id}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

    missing = client.get(f"/api/agents/{agent_id}")
    assert missing.status_code == 404


def test_agents_slug_must_be_unique():
    first = client.post("/api/agents", json=_payload("planner"))
    assert first.status_code == 200

    second = client.post("/api/agents", json=_payload("planner"))
    assert second.status_code == 409
