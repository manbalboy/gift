# REVIEW

## Functional bugs
- **CORS 정규식 정책 불일치**:
  `api/app/main.py`의 `allow_origin_regex`에서 `localhost` 및 `127.0.0.1`에 대해 `31\d{2}` 패턴을 강제하고 있어, 지정된 특정 포트(예: 3100, 3101 등)로만 접근이 제한됩니다. SPEC.md에서는 `https://localhost`, `http://localhost` 등 포트에 제약받지 않는 도메인 정책을 명시하고 있으므로, 정규식을 완화하여 요구사항에 맞는 유연한 접근을 허용해야 합니다.

## Security concerns
- **Webhook Payload Memory Exhaustion (DoS)**:
  `api/app/api/webhooks.py` 내의 `receive_dev_integration_webhook` 엔드포인트에서 서명을 검증하기 위해 `raw_body = await request.body()`를 호출하여 외부 요청 전체를 메모리에 로드하고 있습니다. 악의적인 공격자가 기가바이트 단위의 거대한 페이로드를 전송할 경우 메모리 고갈(OOM)로 인한 서비스 거부(DoS) 상태가 유발될 수 있습니다. 애플리케이션 레벨에서 허용 가능한 최대 Payload 크기를 사전에 검증하는 방어 로직이 필요합니다.

## Missing tests / weak test coverage
- **CORS 및 Middleware 정책 검증 단위 테스트 부재**:
  `test_webhooks_api.py`와 `test_rate_limit.py` 등 보안 인증과 관련된 테스트는 구현되었으나, `main.py`에 적용된 복잡한 `allow_origin_regex` 및 `allow_origins` 설정이 정상적으로 인바운드 트래픽을 필터링하는지 확인하는 통합 테스트 파일(예: `test_main.py`)이 누락되어 있습니다.
- **Rate Limiter의 Fallback 전환에 대한 부하/스트레스 테스트 한계**:
  Redis 장애 발생 시 로컬 시스템으로 대체(Fallback)되는 로직의 기능 테스트는 존재하나, 장애가 지속되는 상황에서 다량의 동시 요청이 발생할 경우 성능 저하 및 소켓 타임아웃 오버헤드가 적절히 통제되는지를 검증하는 스트레스 테스트 커버리지가 부족합니다.

## Edge cases
- **Boolean 타입의 workflow_id 파싱**:
  웹훅 페이로드 파싱 시 `isinstance(workflow_id_raw, int)`를 통해 정수 여부를 판별하고 있습니다. 파이썬에서 `bool` 타입은 `int`를 상속받기 때문에, JSON 페이로드로 `{"workflow_id": true}`가 수신될 경우 값이 `1`로 잘못 캐스팅되어 의도치 않게 1번 워크플로우가 트리거될 위험이 존재합니다.
- **Docker Ping 실패 시의 연속 지연(Negative Cache 부재)**:
  `AgentRunner`의 `_docker_ping()`은 상태 검증에 성공했을 때만 `_docker_ping_cache_until`을 갱신합니다. 만약 Docker 데몬 프로세스가 다운된 상태라면 캐시가 갱신되지 않으므로 워커가 할당받은 매 태스크마다 3초(timeout)의 대기를 거치게 되며, 이는 전체 워커 시스템의 쓰레드 고갈 및 장기적인 병목을 초래합니다.
- **Redis 장애 시 반복적인 타임아웃 누적**:
  `SSEReconnectRateLimiter`는 Redis 연결 실패 시 Local Fallback을 반환하지만, 에러 상태를 유지하지 않아 이어지는 다음 요청에서도 다시 0.2초의 Redis 소켓 연결 타임아웃을 겪게 됩니다. 짧은 시간에 트래픽이 몰리는 상황일 경우 서킷 브레이커(Circuit Breaker) 구조가 없어 심각한 응답 지연을 야기할 수 있습니다.

## TODO
- [ ] `api/app/main.py`의 CORS `allow_origin_regex`를 수정하여 `localhost` 및 `127.0.0.1`에 대한 포트 제한을 완화(예: 3100, 3101 등 특정 포트에 국한되지 않게 수정)하고 SPEC.md 사양에 맞게 반영.
- [ ] Webhook 수신 엔드포인트(`api/app/api/webhooks.py`)에 `raw_body`를 로드하기 전이나 도중 최대 사이즈(예: 5MB)를 초과하지 않도록 검사하는 안전 장치 추가.
- [ ] `workflow_id` 파싱 로직에서 `type(workflow_id_raw) is int` 구문 등을 사용하여 Boolean 타입 데이터가 입력되는 Edge Case 방어.
- [ ] `AgentRunner._docker_ping()` 로직에서 Docker 상태 체크 실패 시 짧은 시간(예: 3~5초) 동안의 Negative Cache를 두어 연속된 타임아웃 병목을 회피하도록 개선.
- [ ] `SSEReconnectRateLimiter` 내부에 서킷 브레이커 패턴이나 일정 기간 Fallback 상태를 유지하는 로직을 추가하여 반복적인 Redis 호출 지연 방지.
- [ ] CORS 규칙과 도메인 허용 설정의 유효성을 꼼꼼하게 검증할 수 있도록 `api/tests/test_main.py` 통합 테스트 작성.
