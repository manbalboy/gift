# REVIEW

## Functional bugs
- **API CORS 정규식 범위 오류**: `api/app/main.py` 파일의 CORS 설정 중 `allow_origin_regex`가 `31\d{2}`와 같이 3100번대 포트를 강제하고 있습니다. SPEC 문서에서는 `manbalboy.com` 도메인(서브도메인 포함)일 경우 포트가 달라도 허용해야 한다고 명시되어 있습니다. 현재 구현상으로는 기본 프로덕션 포트(80, 443 등)를 사용하는 정상적인 프론트엔드 호스트 접근이 CORS 오류로 차단되는 기능적 결함이 발생합니다.

## Security concerns
- **GitHub Webhook 서명 검증 누락**: `api/app/api/webhooks.py`의 `receive_dev_integration_webhook` 엔드포인트에 `X-Hub-Signature-256` 기반의 HMAC 검증 로직이 없습니다. 기존 SPEC에서 GitHub Issues 웹훅 기반으로 트리거 시 HMAC 서명을 검증하던 철학이 누락되었습니다. 누구나 임의의 페이로드로 웹훅 API를 호출하여 컨테이너 환경에서 워크플로우 엔진을 트리거할 수 있는 중대한 RCE/보안 취약점이 존재합니다.
- **Generic 웹훅 엔드포인트 인증 부재**: GitHub 이벤트가 아닌 커스텀 CI/CD 등 범용적인 이벤트의 경우에도 아무런 인증(API 토큰 등) 절차 없이 `workflow_id`만 전달하면 파이프라인이 실행됩니다. 이는 악의적인 공격자에 의한 시스템 리소스 고갈(DoS) 공격에 매우 취약합니다.

## Missing tests / weak test coverage
- **웹훅 보안 및 무결성 검증 테스트 누락**: `api/tests/test_webhooks_api.py` 등에 유효하지 않은 HMAC 서명을 전달하거나 서명이 아예 없는 악의적 요청을 보냈을 때 접근이 차단(401/403 등)되는지 확인하는 보안 중심의 단위 테스트가 부족합니다.
- **Docker Ping 실패 시나리오 테스트 미흡**: Docker 데몬에 문제가 발생해 `docker info` 명령이 행(Hang)에 걸릴 경우를 대비해 3초 타임아웃을 주었으나, 실제 타임아웃 예외가 발생했을 때 프로세스가 좀비 상태가 되지 않고 워커가 안전하게 실패를 기록하는지에 대한 Mocking 기반 예외 테스트 코드가 부족합니다.
- **Redis Rate Limiter 동시성 Fallback 테스트**: Redis가 다운되었을 때 예외를 잡고 로컬 인메모리 처리로 넘어가는 로직에 대해, 다수의 요청이 동시에 몰릴 경우 제대로 제어가 이루어지는지 검증하는 스트레스성 테스트 커버리지가 취약합니다.

## Edge cases
- **Redis 장애 시 로컬 Fallback으로 인한 글로벌 Rate Limit 무력화**: `api/app/services/rate_limiter.py`에서 Redis 통신 장애 시 즉시 `LocalSlidingWindowRateLimiter`로 우회하도록 구성한 점은 훌륭합니다. 그러나 다중 워커(Scale-out)로 운영되는 프로덕션 환경에서 Redis 장애가 발생하면, 모든 워커가 각각 독립적인 로컬 인메모리 카운터를 유지하므로 전체 Rate Limit 허용량이 워커 대수(N배)만큼 일시적으로 늘어나 클라이언트 폭주를 완전히 방어하지 못하는 엣지 케이스가 존재합니다.
- **매 작업마다 실행되는 Docker Ping 부하**: `agent_runner.py`의 `_docker_ping()`이 태스크 단위(run)로 매번 3초 타임아웃 서브프로세스를 생성하며 데몬 상태를 점검합니다. 1개의 워크플로우 내에서 초 단위로 노드가 짧게 여러 개 실행될 경우 불필요한 시스템 I/O 오버헤드를 유발하여 전체 워크플로우 처리 속도와 효율을 떨어뜨릴 수 있습니다.

## TODO
- [ ] `api/app/main.py`의 `allow_origin_regex`를 수정하여 `manbalboy.com` 도메인 그룹에 대해서는 3100번대 포트 제한 없이 허용하도록 정규 표현식 개선.
- [ ] `api/app/api/webhooks.py`에 GitHub 웹훅을 위한 `X-Hub-Signature-256` HMAC 헤더 검증 로직(미들웨어 또는 의존성 기반) 필수 추가.
- [ ] 범용 Webhook(`generic`, `ci` 등) 이벤트 수신 시 인증을 보장할 수 있는 최소한의 API Secret 토큰 검증 단계 추가 구현.
- [ ] 웹훅 검증 실패 사례(서명 불일치, 토큰 누락 등)에 대한 실패 단위 테스트(401/403 반환 검증) 추가 작성.
- [ ] 매 태스크마다 실행되는 Docker Ping의 빈도를 조정하거나 일정 시간 내에 결과를 캐싱(Cache)하여 프로세스 I/O 병목 완화 로직 검토 및 반영.
- [ ] 워커 인스턴스 Scale-out 환경을 감안하여 Redis 오류로 인한 Local Fallback이 동작할 때 경고 로깅을 보다 상세화하고 Rate Limit 허용 범위를 보수적으로 가져가도록 보완.
