# REVIEW

현재 저장소 상태(SPEC.md 및 PLAN.md)를 기준으로 구현된 코드를 분석한 리뷰 결과입니다. 전반적으로 PLAN.md에서 요구한 MVP 스코프와 방어 로직들이 API 및 프론트엔드 코드에 잘 반영되어 있으며, 66개의 API 테스트가 성공적으로 통과하고 있습니다. 아래는 상세 리뷰 및 보완이 필요한 항목들입니다.

## Functional bugs
- **웹 대시보드 UI 오타**: `web/src/components/WorkflowBuilder.tsx` 파일 내 모바일 뷰 예외 처리 안내 문구에 "모 니터링을"이라는 불필요한 공백 오타가 존재합니다.
- **다중 워커 환경에서의 Rate Limiter 오작동**: `LocalSlidingWindowRateLimiter`는 메모리 기반으로 동작하므로, `uvicorn`이 멀티 프로세스(워커)로 실행될 경우 각각 독립적인 상태를 가지게 되어 Rate Limit가 의도한 제한 값보다 초과 허용될 수 있는 잠재적 논리 버그가 있습니다.

## Security concerns
- **X-Forwarded-For 헤더 변조(Spoofing) 위험**: `api/app/api/webhooks.py`의 `_extract_client_key` 함수는 클라이언트 IP를 식별할 때 `x-forwarded-for` 헤더를 우선적으로 참조합니다. 리버스 프록시 단에서 해당 헤더를 신뢰할 수 있도록 강제하거나 FastAPI의 `TrustedHostsMiddleware`를 사용하지 않으면, 악의적인 공격자가 해당 헤더를 임의로 조작하여 IP 기반 Rate Limiting을 우회할 위험이 있습니다.
- **CORS 설정 및 포트 매핑**: `api/app/main.py`에 적용된 `allow_origin_regex` 정규식은 악의적 서브도메인 우회를 훌륭하게 방어하고 있습니다. 지정된 로컬 포트들(예: `http://localhost:3100`)만 접근이 허용되도록 올바르게 구성되었습니다.

## Missing tests / weak test coverage
- **프론트엔드 컴포넌트 단위 테스트 실행 부족**: API 계층의 `pytest`는 완벽하게 작성되어 통과하지만, PLAN.md에 언급된 Visual Builder 화면 및 `web/` 디렉터리에 대한 UI 단위 테스트(`jest` 등)의 자동화 실행 결과가 확인되지 않습니다.
- **Rate Limiting 동시성(Concurrency) 및 부하 테스트 부족**: `RedisSlidingWindowRateLimiter`의 작동 및 로컬 메모리 Fallback 전환 과정에서 다중 요청 시 발생할 수 있는 Race Condition 우회 가능성에 대한 강력한 통합 부하 테스트가 없습니다.

## Edge cases
- **Webhook Payload 내 `workflow_id`의 비정상 타입 파싱**: `api/app/api/webhooks.py`에서 `{"workflow_id": [1, 2]}`와 같이 배열이나 객체가 전송되었을 때, `.isdigit()` 캐스팅 검사를 통해 서버 크래시(HTTP 500)는 방어되지만, 어떠한 에러 로그도 남기지 않고 즉시 무시(None 처리)됩니다. 이는 연동 클라이언트 입장에서 원인을 파악하기 힘든 디버깅 엣지 케이스를 만듭니다.
- **Docker 핑 토글(Flapping) 현상**: Docker 데몬이 매우 짧은 간격으로 켜짐과 꺼짐을 반복하는 경우, 적용된 Fail-Fast의 Negative Cache TTL로 인하여 데몬이 실제 복구된 순간에도 즉각적인 작업이 실행되지 못하고 인위적 지연이 발생할 수 있습니다.

## TODO
- [ ] `web/src/components/WorkflowBuilder.tsx`의 "모 니터링을" 오타를 "모니터링을"로 수정하기.
- [ ] API 서버에서 `X-Forwarded-For` 헤더를 안전하게 파싱하기 위한 방어 로직 검토 및 수정하기.
- [ ] 프론트엔드(`web/` 폴더) 영역의 테스트 스크립트 실행 환경 보완 및 점검하기.
- [ ] `webhooks.py` 내 `workflow_id`의 비정상 타입 파싱이 실패하여 무시되는 지점에 디버깅용 Logger 추가하기.
- [ ] 향후 다중 워커 환경 도입을 고려하여, 로컬 환경의 Rate Limiter 상태 경합 문제를 방지할 구조적 대안(주석/문서화 등) 마련하기.
