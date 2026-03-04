import os
from pathlib import Path
import pytest

TEST_DB = Path('./api/test_runtime.db')
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ['DEVFLOW_DB_PATH'] = str(TEST_DB)
os.environ['DEVFLOW_WORKSPACES_ROOT'] = './api/test_workspaces'
os.environ['DEVFLOW_RUNNER_BACKEND'] = 'host'
os.environ['DEVFLOW_ENABLE_HOST_RUNNER'] = 'true'
os.environ['DEVFLOW_REQUIRE_DOCKER_PING_ON_STARTUP'] = 'false'

from fastapi.testclient import TestClient

from app.api import workflows as workflows_api
from app.api.webhooks import reset_webhook_limiter_for_tests
from app.main import app


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_limiters():
    workflows_api.reconnect_rate_limiter.reset_for_tests()
    reset_webhook_limiter_for_tests()
