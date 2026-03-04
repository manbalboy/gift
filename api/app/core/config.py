from pathlib import Path
import os


class Settings:
    app_name: str = 'DevFlow Agent Hub API'
    api_prefix: str = '/api'
    db_path: str = os.getenv('DEVFLOW_DB_PATH', './api/devflow.db')
    workspaces_root: str = os.getenv('DEVFLOW_WORKSPACES_ROOT', './api/workspaces')

    @property
    def database_url(self) -> str:
        return f"sqlite:///{Path(self.db_path).resolve()}"


settings = Settings()
