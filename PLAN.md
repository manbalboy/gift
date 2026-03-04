# PLAN

## 1. Task breakdown with priority
- **P0: 기능 버그 및 보안 취약점 최우선 수정**
  - **CORS 정책 정규식 완화**: `api/app/main.py`의 `allow_origin_regex`를 수정하여 `localhost` 및 `127.0.0.1` 도메인에 걸려있는 엄격한 포트 제한(`31\d{2}`)을 해제하고 SPEC.md 사양에 부합하도록 허용.
  - **Webhook Payload 제한**: `api/app/api/webhooks.py` 내의 엔드포인트에서 `raw_body`를 로드하기 전 Request Body의 크기를 확인하여 최대 5MB를 초과하는 경우 413 Payload Too Large 응답을 반환(DoS 공격 대비).
  - **Boolean 타입 파싱 엣지 케이스 방어**: `workflow_id` 검증 시 `isinstance` 대신 `type(workflow_id_raw) is int` 구문을 사용하여 `true`가 1로 변환되는 현상 방지.
- **P1: 성능 병목 및 에러 전파(Cascading Failure) 방지**
  - **Docker Ping Negative Cache**: `api/app/services/agent_runner.py`의 `_docker_ping()` 로직에 상태 체크 실패 시 3~5초 동안 실패를 기억하는 캐시 로직을 도입하여 연속적인 워커의 타임아웃 병목 현상 제거.
  - **Redis 서킷 브레이커 패턴 도입**: `api/app/services/rate_limiter.py`의 `SSEReconnectRateLimiter`에 장애 상태 유지 로직을 구현하여 반복적인 연결 시도 지연 해소.
- **P2: 테스트 커버리지 강화 및 고도화 추가 기능**
  - **통합 및 스트레스 테스트 작성**: `api/tests/test_main.py`를 통해 CORS 접근 제어 테스트 작성 및 부하 상황에서 Fallback 전환 한계를 검증하는 테스트 커버리지 확보.
  - **[고도화 플랜] 추가 기능 1: IP 기반 Webhook Rate Limiting**: Payload 사이즈 제한과 시너지를 내기 위해 특정 IP의 비정상적인 Webhook 대량 요청 시 일정 시간 차단하는 기능을 구현(보안 및 DoS 방지 시너지).
  - **[고도화 플랜] 추가 기능 2: Health API 응답 정보 세분화**: `/health` 엔드포인트에 Redis Fallback 상태와 Docker 가용성 상태를 추가하여 대시보드에서 플랫폼 상태를 정확하게 관측할 수 있도록 개선(Negative Cache 및 서킷 브레이커 도입과 자연스럽게 연결).

## 2. MVP scope / out-of-scope
**MVP scope**
- `REVIEW.md`에 명시된 모든 결함 사항의 완벽한 보완 및 테스트 코드 통합.
- CORS 허용 도메인 규칙 수정.
- 메모리 고갈 방지를 위한 Webhook 페이로드 용량 제한 방어 로직.
- 데이터 타입 명확화(Boolean 필터링) 버그 수정.
- 장애(Docker, Redis) 연속 대기 병목을 끊기 위한 상태 캐싱 구조 구현.

**Out-of-scope**
- Visual Workflow Builder (React Flow) 등 프론트엔드 환경의 UI/UX 추가 구현.
- Temporal 또는 LangGraph 등 외부 워크플로우 엔진 기반의 코어 로직 리팩토링 및 아키텍처 재설계.
- 본 리뷰와 관련 없는 기타 통합 모듈(CI, Slack 알림 등) 확장.

## 3. Completion criteria
- 모든 TODO 항목이 소스 코드 및 관련 서비스 컴포넌트에 누락 없이 반영되어야 함.
- 포트가 지정되지 않거나 3000번대가 아닌 `localhost`, `manbalboy.com` 환경의 클라이언트 호출 시 CORS 에러가 발생하지 않아야 함.
- 5MB 이상의 악의적 페이로드 수신 시 HTTP 413 상태 코드로 방어되어야 함.
- JSON 페이로드에 `{"workflow_id": true}`가 입력될 시 422 Unprocessable Entity 에러가 반환되어 1번 워크플로우 오작동을 차단해야 함.
- Docker 중단 상태 및 Redis 접속 불량 상태에서도 API 전체 응답 지연(Timeout)이 발생하지 않고 즉시 Fallback/Negative 상태가 반환되어야 함.
- 모든 단위/통합 테스트 코드 실행 시 `pytest` 결과가 100% 통과해야 함.

## 4. Risks and test strategy
**Risks**
- 완화된 CORS 정규식이 예상치 못한 서브도메인 악용이나 변형된 Origin 헤더 공격에 뚫릴 위험 존재.
- Negative Cache의 유효 시간(TTL) 설정이 길 경우, 복구된 Docker나 Redis가 즉각적으로 반영되지 못해 일시적인 서비스 마비처럼 보일 위험.

**Test strategy**
- `test_main.py` 내 `pytest.mark.parametrize`를 활용하여 허용해야 할 정상 도메인 및 거부해야 할 악의적 도메인을 다양하게 삽입하여 정규식 로직의 신뢰성을 철저히 검증.
- 더미 스트리밍 페이로드(예: 4.9MB, 5.1MB)를 API 클라이언트(Mock)로 전송해 메모리 사용량 상승 방지 확인.
- `unittest.mock`을 이용하여 `_docker_ping` 및 Redis Connection 동작을 강제로 Timeout 시킨 후, 두 번째 요청 시 걸리는 시간이 O(1)에 가깝게 줄어드는지 시간 측정 테스트(Performance Test) 병행.

## 5. Design intent and style direction
- **기획 의도**: 플랫폼 인프라적인 취약점(메모리 부족, 연결 타임아웃)을 해결해 대규모 요청이 와도 무너지지 않고 예측 가능하게 동작하는 프로덕션 레벨의 워크플로우 엔진 경험을 제공합니다.
- **디자인 풍**: 견고하고 탄력적인 시스템 (Resilient & Robust System). 프론트엔드/CLI 클라이언트 입장에서 에러 상황을 명확하게 파악할 수 있는 인프라 형태.
- **시각 원칙**: 클라이언트 측에 일관되고 명확한 표준 HTTP 상태 코드(413, 422, 503 등)와 일정한 JSON 에러 스키마를 반환하여 디버깅 직관성을 부여합니다.
- **반응형 원칙**: 워커나 외부 자원이 응답하지 않을 때 기다리지 않고 빠르게 에러를 뱉는 Fail-Fast 메커니즘을 백엔드 로직의 기본 반응성(Responsiveness)으로 삼습니다.

## 6. Technology ruleset
- **플랫폼 분류**: api
- **기술 기반**: FastAPI 환경(Python)으로 철저히 한정하며 Starlette Request 속성과 Pydantic 유효성 검사, `asyncio` 기반의 캐싱 기법을 적극 활용합니다.
