from pathlib import Path
import os


class Settings:
    app_name: str = 'DevFlow Agent Hub API'
    api_prefix: str = '/api'
    db_path: str = os.getenv('DEVFLOW_DB_PATH', './api/devflow.db')
    workspaces_root: str = os.getenv('DEVFLOW_WORKSPACES_ROOT', './api/workspaces')
    runner_backend: str = os.getenv('DEVFLOW_RUNNER_BACKEND', 'host')
    docker_image: str = os.getenv('DEVFLOW_DOCKER_IMAGE', 'bash:5.2')
    lock_backend: str = os.getenv('DEVFLOW_LOCK_BACKEND', 'local')
    redis_url: str = os.getenv('DEVFLOW_REDIS_URL', 'redis://localhost:6379/0')
    lock_ttl_seconds: int = int(os.getenv('DEVFLOW_LOCK_TTL_SECONDS', '30'))

    @property
    def database_url(self) -> str:
        return f"sqlite:///{Path(self.db_path).resolve()}"


settings = Settings()
