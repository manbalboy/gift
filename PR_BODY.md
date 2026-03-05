## Summary

Self-Improvement Loop 제어/모니터링 안정화를 위한 변경입니다. `REVIEW.md` TODO 기준으로 포트 충돌 대응, 루프 제어 API, 대용량 에러 로그 처리, 관련 테스트 보강을 반영했습니다.

## What Changed

### API / Infra
- `scripts/run-api-31xx.sh`
  - 3100번대 포트 충돌 감지 및 재시도/의미 있는 실패 로그 강화
- `api/app/api/loop_engine.py`
  - `POST /loop/start|pause|resume|stop`, `GET /loop/status`, `POST /loop/inject`, `GET /loop/instruction/{id}` 제공
- `api/app/main.py`
  - loop 엔진 라우터 연결 및 CORS/미들웨어 정책 유지

### Web
- `web/src/components/ErrorLogModal.tsx`
  - 10만 자 이상 로그 렌더링 시 페이지 단위 분할 표시
  - `Intl.Segmenter` 미지원 환경에서 ZWJ/국기/키캡 이모지 fallback 처리
  - 다운로드/복사 동작 안정성 보강

### Tests
- `api/tests/test_loop_simulator.py`
  - `max_loop_count`, `budget_limit` 경계값/음수 값 방어 검증
  - 상태 전이 중 큐잉 레이스 유사 시나리오 검증
- `api/tests/test_run_api_31xx_script.py`
  - 포트 점유/Address in use 재시도 실패 케이스 검증
- `api/tests/test_port_collision_integration_script.py` (신규)
  - `nc -l 3100` 기반 포트 점유 통합 검증 스크립트 연동
- `web/src/components/ErrorLogModal.test.tsx`
  - 10만 자 + ZWJ 이모지 스트레스 렌더링 테스트

## Test Results

- `pytest -q api/tests/test_run_api_31xx_script.py api/tests/test_loop_simulator.py api/tests/test_loop_engine_api.py`
  - `27 passed`
- `npm test -- --runInBand src/components/ErrorLogModal.test.tsx`
  - `1 passed, 7 tests passed`

## Docker 실행 가이드

1. 이미지 빌드
```bash
docker build -t devflow-agent-hub:preview .
```

2. Preview 실행 (외부 노출 포트는 7000-7099만 사용)
```bash
PREVIEW_PORT=7003 API_PORT=7004 ./scripts/run-docker-preview.sh
```

3. 로컬 개발/테스트 포트
- API/Web 테스트 실행 포트는 3100번대 사용

## Preview 배포 정보 양식

- External Port: `7000-7099`
- Domain: `https://manbalboy.com` (허용 Origin 정책 준수)
- Health Check: `http://<host>:<external-port>/health` 또는 앱 루트 경로

## Notes

- PR 자동 머지는 사용하지 않습니다.
