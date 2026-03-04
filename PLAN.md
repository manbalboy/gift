# PLAN

## 1. Task breakdown with priority

**[P0] Webhook 보안 및 인증 강화**
- **목표:** GitHub Webhook 및 Generic Webhook 호출 시 발생할 수 있는 보안 취약점(RCE, DoS) 해결.
- **작업 상세:**
  - `api/app/api/webhooks.py`: GitHub `X-Hub-Signature-256` HMAC 서명 검증 로직 추가.
  - `api/app/api/webhooks.py`: 범용 Webhook(`generic`, `ci` 등) 엔드포인트에 API Secret 토큰 검증 단계 추가.
  - `api/app/core/config.py`: 웹훅 검증에 필요한 Secret 키 환경 변수 로드 로직 추가 (인접 고도화 반영).
  - `api/tests/test_webhooks_api.py`: 서명 불일치, 토큰 누락 시 401/403 에러 반환을 검증하는 실패 단위 테스트 작성.

**[P0] CORS 정책 수정**
- **목표:** SPEC 명세에 맞는 올바른 프론트엔드 도메인 접근 허용.
- **작업 상세:**
  - `api/app/main.py`: `allow_origin_regex` 수정. `manbalboy.com` 도메인(서브도메인 포함)일 경우 특정 포트에 얽매이지 않고 모든 포트를 허용하도록 정규 표현식 개선 (현행 3100번대 제한 제거).

**[P1] 시스템 리소스 및 I/O 병목 최적화**
- **목표:** 빈번한 Docker 데몬 상태 확인으로 인한 프로세스 성능 저하 개선.
- **작업 상세:**
  - `api/app/services/agent_runner.py`: 매 태스크마다 실행되는 `_docker_ping()`에 인메모리 캐싱(예: TTL 10초~30초)을 적용하여 불필요한 I/O 오버헤드 완화.
  - `api/tests/test_docker_runner_integration.py`: Docker Ping 실패(행 걸림 등) 및 타임아웃 발생 시 워커가 좀비 상태가 되지 않고 안전하게 실패(Exception)를 기록하는 Mock 기반 예외 테스트 추가.

**[P2] Rate Limiter Fallback 안전성 확보**
- **목표:** Redis 장애 시 발생하는 로컬 인메모리 Fallback의 동시성 제어 및 허용량 초과 문제 방어.
- **작업 상세:**
  - `api/app/services/rate_limiter.py`: Redis 장애로 인해 `LocalSlidingWindowRateLimiter` 동작 시 상세 경고 로깅을 추가하고, 다중 워커 환경을 고려해 Rate Limit 허용 범위를 보수적으로(예: 기존의 50% 등) 제한하도록 개선.
  - `api/tests/test_rate_limit.py`: 다수의 요청이 동시에 몰릴 때 Redis가 다운된 상황을 모사하여 로컬 Fallback이 한도 내에서 정확히 제어하는지 검증하는 스트레스성 동시성 테스트 코드 작성 (인접 고도화 반영).

## 2. MVP scope / out-of-scope

**MVP scope**
- `manbalboy.com` 계열 도메인의 API 통신을 위한 CORS 정규식 완화.
- 외부 이벤트(GitHub 이슈/PR, Generic 웹훅) 트리거 시 인증/인가(HMAC, API Secret) 로직 구현 및 검증 테스트.
- 워커 실행 시 Docker 데몬 ping 부하를 줄이기 위한 결과 캐싱 적용.
- Redis Rate Limit 장애 시 Fallback 안전성 강화 및 상세 로깅.

**Out-of-scope**
- Visual Workflow Builder(React Flow) 등 신규 UI 구현 (현재는 보안 패치 및 엔진 최적화에 집중).
- Postgres DB 마이그레이션 (기존 SQLite/JSON 기반 데이터 저장소 유지).
- Temporal, LangGraph 등 신규 워크플로우 엔진 인프라 전면 도입.
- 본 REVIEW 취약점과 무관한 추가 API 엔드포인트 설계 및 확장.

## 3. Completion criteria

- `api/app/main.py`의 CORS 정규식이 `*.manbalboy.com` 도메인에 대해 포트 제한 없이 접근을 허용해야 한다.
- GitHub Webhook 수신 API가 올바른 HMAC 서명이 없을 경우 HTTP 401/403 응답을 반환해야 한다.
- Generic Webhook 수신 API가 환경 변수로 설정된 API 토큰과 일치하지 않을 경우 HTTP 401/403 응답을 반환해야 한다.
- `api/tests/test_webhooks_api.py`를 포함한 새롭게 작성된 모든 보안 및 인증 관련 단위/통합 테스트가 정상 통과해야 한다.
- `_docker_ping()` 캐싱 로직이 적용되어 동일 워크플로우 내 짧은 간격의 연속 실행 시 서브프로세스 생성이 줄어듦을 로그로 확인할 수 있어야 한다.
- 로컬 테스트 시 실행 가이드에 따라 3000번대 포트(예: API 서버 3001)에서 구동 가능하도록 설정 및 구성되어야 한다.

## 4. Risks and test strategy

**Risks**
- 웹훅 서명 검증 도입으로 인해 기존 연동된 GitHub 레포지토리 환경에서 Secret이 미설정될 경우 모든 Job 트리거가 실패할 수 있음.
- `_docker_ping` 캐싱 TTL을 길게 설정할 경우, 캐시된 시간 동안 Docker 데몬이 다운되면 작업을 시도하다 예기치 않은 에러가 발생할 수 있음.
- Redis Fallback 허용량을 줄일 경우, 장애 상황에서 정상적인 트래픽까지 Rate Limit에 걸려 서비스 지연이 발생할 확률이 있음.

**Test strategy**
- **웹훅 보안 단위 테스트:** Pytest를 사용하여 가상의 Payload와 올바른/틀린 HMAC 서명, 누락된 헤더를 전송하여 접근 차단 로직(401/403)을 철저히 검증.
- **Docker 상태 Mocking 테스트:** Docker 프로세스 실행을 Mocking하여 타임아웃을 강제로 발생시키고 에러 처리 및 상태 기록 흐름이 멈춤 없이 정상 수행되는지 테스트.
- **Rate Limit 스트레스 테스트:** Redis 연결 예외를 Mocking한 상태에서 ThreadPool 등을 활용해 동시다발적인 요청을 보내, 로컬 Fallback이 설정된 횟수 내에서 요청을 안전하게 차단하는지 검증.

## 5. Design intent and style direction

- **기획 의도:** 기존에 동작하던 워크플로우 자동화 기능의 핵심 보안 취약점을 막고 성능 병목을 해결하여, 신뢰할 수 있는 개발 워크플로우 플랫폼(DevFlow)으로서의 기본기를 다지는 경험을 제공.
- **디자인 풍:** (API 및 백엔드 로직 중심이므로 별도의 시각적 UI 변경은 없으나) 로그 및 에러 메시지 반환 시 개발자가 즉시 원인을 파악할 수 있는 직관적이고 구조화된 포맷 지향.
- **시각 원칙:** 백엔드 관점에서는 RESTful API 원칙을 엄격히 준수하며 명확한 HTTP Status Code 사용(401, 403, 429 등)과 일관된 에러 JSON 응답 포맷(예: `{"detail": "..."}`)을 유지.
- **반응형 원칙:** 프론트엔드 연동성을 위해 API 응답 지연을 최소화하고, 상태 코드를 명확히 분리하여 웹 대시보드에서 예외 처리가 용이하도록 구성.

## 6. Technology ruleset

- **플랫폼 분류:** api 및 web
- **API 구성:** FastAPI를 기반으로 파이썬 로직을 구현하며, 의존성 주입과 미들웨어를 활용해 인증 로직을 추가.
- **Web 구성:** (UI 변경이 필요할 경우) React 기반 프레임워크 유지.
- **실행 가이드:** 로컬 개발 및 실행 환경에서 포트가 필요한 경우 프론트엔드 및 API 서버 모두 3000번대 포트(예: Web 3000, API 3001)를 기본으로 할당하여 충돌을 방지.
