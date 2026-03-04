import pytest

from .conftest import client


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost",
        "https://localhost",
        "http://localhost:9999",
        "http://127.0.0.1",
        "https://127.0.0.1:6553",
        "https://manbalboy.com",
        "http://manbalboy.com:8080",
        "http://ssh.manbalboy.com:3200",
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
    ],
)
def test_cors_blocks_untrusted_origins(origin: str):
    response = client.options(
        "/api/workflows",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 400
