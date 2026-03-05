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
os.environ['DEVFLOW_VIEWER_TOKEN'] = 'test-viewer-token'

from fastapi.testclient import TestClient

from app.api import workflows as workflows_api
from app.api.webhooks import reset_webhook_limiter_for_tests
from app.main import app
from app.services.system_alerts import reset_system_alerts_for_tests


client = TestClient(app, headers={"X-Viewer-Token": "test-viewer-token"})


@pytest.fixture(autouse=True)
def reset_limiters():
    workflows_api.reconnect_rate_limiter.reset_for_tests()
    reset_webhook_limiter_for_tests()
    reset_system_alerts_for_tests()
