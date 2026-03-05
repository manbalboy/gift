# DevFlow Agent Hub

## 실행

### API (FastAPI, 3101)
```bash
./scripts/run-api-31xx.sh
```

기본값은 `3101`부터 시작하며, 충돌 시 `3100~3199` 범위에서 가용 포트를 자동 탐색하고 재시도합니다.

### Web (React, 3100)
```bash
cd web
npm run dev
```

## 테스트

```bash
PYTHONPATH=api .venv/bin/pytest -q api/tests
```

포트 충돌(3100 점유) 통합 검증:

```bash
./scripts/test-port-collision.sh
```
