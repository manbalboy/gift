# REVIEW

본 문서는 `SPEC.md`와 `PLAN.md`를 기반으로 현재 저장소의 아키텍처 및 구현 상태를 리뷰한 결과입니다. 플랫폼 인프라의 안정성, 보안, 그리고 의도된 기획(DevFlow Agent Hub) 사양을 달성하기 위한 개선점을 정리했습니다.

## Functional bugs

- **CORS 정책 정규식 오류**
  - **설명**: 현재 API 서버(`api/app/main.py`)의 CORS 허용 도메인(`allow_origin_regex`)이 스펙과 다르게 과도하게 제한적입니다. `SPEC.md`에 따르면 `manbalboy.com`의 모든 서브도메인 및 포트를 허용해야 하며, `localhost`와 `127.0.0.1`에 대해서도 제한 없이 허용해야 합니다. 현재는 비정상적인 포트 제한을 강제하고 있어 정상적인 클라이언트 접근이 차단될 수 있습니다.
  - **재현 예시**: 로컬 개발 환경에서 프론트엔드를 띄우고 `http://localhost:3100` 또는 `http://test.manbalboy.com:3101`에서 API를 호출할 때 CORS 에러 발생.

- **Boolean 타입 파싱 엣지 케이스 (타입 캐스팅 버그)**
  - **설명**: 워크플로우를 트리거할 때 검증 로직에서 `workflow_id`가 Boolean 값인 `true`로 들어올 경우, Python의 특성상 `isinstance(true, int)`가 참으로 평가되어 `workflow_id = 1`로 오인식되는 버그가 있습니다.
  - **재현 예시**: Webhook JSON 페이로드에 `{"workflow_id": true}`를 전송하면 파싱 에러 없이 1번 워크플로우가 잘못 실행됨.

## Security concerns

- **Webhook Payload 제한 부재 (DoS 취약점)**
  - **설명**: `api/app/api/webhooks.py` 내의 엔드포인트에서 Request Body 크기를 제한하지 않고 로드하고 있습니다. 악의적인 클라이언트가 매우 큰 용량의 페이로드를 전송할 경우 메모리 고갈(OOM) 및 서버 크래시를 유발할 수 있는 서비스 거부(DoS) 공격에 취약합니다.
  - **해결 방안**: 요청 바디를 읽기 전 크기를 확인하여 최대 5MB를 초과할 경우 `413 Payload Too Large` 응답을 반환하도록 방어 로직을 추가해야 합니다.

## Missing tests / weak test coverage

- **CORS 정책 접근 제어 테스트 누락**
  - **설명**: 정상 도메인(`manbalboy.com` 서브도메인, 다양한 포트 환경)과 악의적 도메인에 대한 CORS 허용/차단 여부를 철저하게 검증하는 단위 및 통합 테스트 코드가 부족합니다.
- **대용량 페이로드 방어 스트레스 테스트 누락**
  - **설명**: 5MB 이상의 더미 스트리밍 페이로드를 API에 전송했을 때 서버가 메모리를 소진하지 않고 안전하게 HTTP 413 상태 코드로 방어해내는지 확인하는 검증 테스트가 없습니다.
- **의존성 자원(Docker, Redis) 장애 Fallback 테스트 누락**
  - **설명**: Docker 데몬이나 Redis 서버가 응답하지 않는 상황을 모킹(Mocking)하여, 서비스가 지속적인 타임아웃 병목에 빠지지 않고 Fail-Fast(Negative Cache)를 통해 즉시 에러 응답을 반환하는지 확인하는 시간 측정 기반의 성능 테스트가 필요합니다.

## Edge cases

- **외부 자원(Docker, Redis) 장애 시 연속적인 타임아웃 병목**
  - **설명**: 워커나 스케줄러가 상태 체크를 위해 지속적으로 Docker 데몬(`_docker_ping`)이나 Redis에 연결을 시도할 때, 장애 상황임에도 매번 긴 타임아웃 시간만큼 대기하게 되면 플랫폼 전체의 에러 전파(Cascading Failure)로 이어집니다.
  - **해결 방안**: 연결 실패 시 일정 시간(예: 3~5초) 동안 실패 상태를 기억하는 Negative Cache 및 서킷 브레이커 패턴을 도입하여 시스템 무응답 대기를 끊어내야 합니다.
- **장애 부분 복구 시 지연 반영 현상**
  - **설명**: Negative Cache의 유지 시간(TTL)이 너무 길게 설정될 경우, 인프라 장애가 복구되었음에도 불구하고 캐시로 인해 서비스 마비가 지속되는 것처럼 보일 수 있으므로 섬세한 TTL 튜닝이 요구됩니다.

---

## TODO

- [ ] `api/app/main.py`의 CORS `allow_origin_regex`를 수정하여 `manbalboy.com` (서브도메인, 포트 무관), `localhost`, `127.0.0.1` 에 대한 원활한 접근을 허용하도록 로직 개선.
- [ ] `api/app/api/webhooks.py` 웹훅 엔드포인트에 Request Payload 크기를 5MB로 제한하고, 초과 시 `413 Payload Too Large`를 반환하는 방어 로직 구현.
- [ ] `workflow_id` 검증 로직에서 `type(workflow_id_raw) is int` 등을 사용하여 `true`가 1로 변환되는 현상을 차단하고, 잘못된 타입 입력 시 `422 Unprocessable Entity` 에러 반환.
- [ ] `api/app/services/agent_runner.py`의 `_docker_ping()` 기능에 타임아웃 실패를 3~5초간 단기 보관하는 Negative Cache 메커니즘 추가.
- [ ] `api/app/services/rate_limiter.py`의 Redis 기반 처리 로직에 장애 상태 지속성을 인지하여 타임아웃 지연을 해소하는 서킷 브레이커 패턴 도입.
- [ ] `api/tests/test_main.py`에 변경된 CORS 정규식 검증, 페이로드 5MB 초과 시 413 방어 검증, 의존성 자원 타임아웃 시 O(1) 시간에 수렴하는 Fail-Fast 시간 측정 테스트 작성.
- [ ] (선택) `/health` API 응답 스키마에 Redis Fallback 상태와 Docker 가용성 상태 상세 정보 추가 반영.
- [ ] (선택) 특정 IP의 비정상적인 Webhook 대량 요청 시 일정 시간 차단하는 IP 기반 Rate Limiting 기능 추가.
