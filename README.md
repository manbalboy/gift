# DevFlow Agent Hub

## 실행

### API (FastAPI, 3101)
```bash
PYTHONPATH=api .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 3101
```

### Web (React, 3100)
```bash
cd web
npm run dev
```

## 테스트

```bash
PYTHONPATH=api .venv/bin/pytest -q api/tests
```
