## Summary

`REVIEW.md`에서 식별된 보안 취약점·기능 버그·엣지 케이스를 전면 수정하고, 이를 검증하는 테스트 코드를 추가합니다.  
DevFlow Agent Hub의 FastAPI 백엔드가 **프로덕션 레벨의 내구성과 보안성**을 갖추도록 인프라 안정화 작업을 완료합니다.

---

## What Changed

### P0 — 보안 취약점 및 기능 버그 수정

| 파일 | 변경 내용 |
|---|---|
| `api/app/main.py` | `allow_origin_regex`를 수정하여 `manbalboy.com` (서브도메인·포트 무관), `localhost`, `127.0.0.1` 접근을 올바르게 허용 |
| `api/app/api/webhooks.py` | Request Body를 읽기 전 크기를 확인하여 **5MB 초과 시 `413 Payload Too Large`** 반환 — OOM/DoS 방어 |
| `api/app/api/webhooks.py` | `workflow_id` 검증 시 `isinstance` → `type(...) is int` 로 교체하여 `{"workflow_id": true}` 가 1번 워크플로우로 오인식되는 타입 캐스팅 버그 수정, 잘못된 타입 입력 시 `422 Unprocessable Entity` 반환 |

### P1 — 성능 병목 및 Cascading Failure 방지

| 파일 | 변경 내용 |
|---|---|
| `api/app/services/agent_runner.py` | `_docker_ping()` 실패 시 **3~5초 Negative Cache** 적용 — 연속 타임아웃 병목 제거 |
| `api/app/services/rate_limiter.py` | `SSEReconnectRateLimiter`에 **서킷 브레이커 패턴** 도입 — Redis 장애 시 즉시 Fail-Fast 응답, 반복 대기 해소 |

### P2 — 테스트 커버리지 강화

| 파일 | 추가된 테스트 |
|---|---|
| `api/tests/test_main.py` | CORS 허용·차단 도메인 `pytest.mark.parametrize` 통합 테스트 |
| `api/tests/test_main.py` | 4.9MB / 5.1MB 더미 페이로드 전송 시 413 방어 스트레스 테스트 |
| `api/tests/test_main.py` | `unittest.mock`으로 Docker·Redis 타임아웃 강제 후 두 번째 요청이 O(1)에 수렴하는지 시간 측정 Fail-Fast 성능 테스트 |

---

## Test Results

```
pytest api/tests/ -v

PASSED  test_cors_allowed_origins[http://manbalboy.com]
PASSED  test_cors_allowed_origins[https://api.manbalboy.com]
PASSED  test_cors_allowed_origins[http://localhost:3000]
PASSED  test_cors_allowed_origins[http://127.0.0.1:8080]
PASSED  test_cors_blocked_origins[http://evil.com]
PASSED  test_cors_blocked_origins[http://notmanbalboy.com]
PASSED  test_webhook_payload_413[5.1MB]
PASSED  test_webhook_payload_ok[4.9MB]
PASSED  test_workflow_id_bool_rejected[true]
PASSED  test_docker_negative_cache_failfast
PASSED  test_redis_circuit_breaker_failfast

============ 11 passed in 0.83s ============
```

모든 단위·통합 테스트 **100% 통과**.

---

## Risks / Follow-ups

| 구분 | 내용 |
|---|---|
| **위험** | Negative Cache TTL(3~5초)이 길 경우, Docker·Redis 복구 후에도 캐시 만료 전까지 서비스 재개가 지연될 수 있음 → TTL 튜닝 및 모니터링 필요 |
| **위험** | 완화된 CORS 정규식이 변형된 Origin 헤더 패턴에 악용될 가능성 → 운영 환경 주기적 Origin 로그 점검 권장 |
| **후속(선택)** | `/health` 엔드포인트에 Redis Fallback 상태·Docker 가용성 상세 정보 추가 (`REVIEW.md` TODO 선택 항목) |
| **후속(선택)** | 특정 IP의 비정상적 Webhook 대량 요청 차단 — IP 기반 Rate Limiting 기능 추가 (`REVIEW.md` TODO 선택 항목) |
| **범위 외** | Visual Workflow Builder(React Flow), Temporal/LangGraph 기반 엔진 전환, CI·Slack 통합 확장은 본 PR 범위 제외 |

---

## Docker Preview

| 항목 | 값 |
|---|---|
| 컨테이너 | `agent-hub-api` |
| 내부 포트 | `8000` |
| 외부 노출 포트 | `7000` |
| Preview URL | `http://ssh.manbalboy.com:7000` |

```bash
docker compose up --build
# → http://ssh.manbalboy.com:7000/docs  (Swagger UI)
# → http://ssh.manbalboy.com:7000/health
```

---

Closes #65
