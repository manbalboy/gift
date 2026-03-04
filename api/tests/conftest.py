import os
from pathlib import Path

TEST_DB = Path('./api/test_runtime.db')
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ['DEVFLOW_DB_PATH'] = str(TEST_DB)
os.environ['DEVFLOW_WORKSPACES_ROOT'] = './api/test_workspaces'

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)
