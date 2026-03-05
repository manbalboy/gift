# REVIEW

## Functional bugs
- API 서버 로컬 실행 시 3100번대 포트(예: 3100) 점유로 인한 충돌 방지 및 우아한 예외 처리 로직이 `api/app/main.py` 내부에 명시적으로 존재하지 않습니다. 포트 경합 시 서버가 비정상 종료(Crash)되지 않도록 재시도 혹은 우아한 종료 처리가 보완되어야 합니다.
- `web/src/components/ErrorLogModal.tsx`의 다운로드 기능(`downloadLog`)은 브라우저 메모리에 `Blob`을 한 번에 올리는 방식을 사용하고 있어, 극한의 대용량 에러 로그(10만 자 이상) 처리 시 클라이언트 메모리 부족 현상이나 프리징이 발생할 수 있는 잠재적 결함이 있습니다.

## Security concerns
- `web/src/utils/security.ts`에서 DOMPurify와 Branded Type(`PlainText`)을 활용한 XSS 방어는 준수하게 구현되어 있으나, 허용되지 않은 HTML 태그나 속성 페이로드가 정규표현식을 우회하여 `@@ALERT_GENERIC_...@@` 치환 로직을 타게 될 경우의 교차 공격(Mutation XSS) 가능성에 대한 방어가 완벽한지 추가 검증이 필요합니다.
- `api/app/main.py`의 CORS 정규표현식(`_CORS_ALLOWED_HOST_PATTERN`)이 `(?:[A-Za-z0-9-]+\.)*manbalboy\.com`으로 구성되어 있습니다. `localhost`와 `manbalboy.com` 도메인 제어는 안전해 보이나, HTTP로 들어오는 오리진 공격을 방어하기 위해 운영 환경에서는 HTTPS 강제 변환 또는 엄격한 스킴(Scheme) 제한이 올바르게 동작하는지 확인해야 합니다.

## Missing tests / weak test coverage
- `api/tests/test_loop_simulator.py`에 `max_loop_count` 및 `budget_limit`이 초과하여 `stopped` 상태로 전이되는 핵심 방어 로직과 0 이하의 음수 파라미터가 주입되었을 때 조기 종료(Early exit)되는 상황에 대한 단위 테스트가 누락되어 있거나 커버리지가 부족합니다.
- `web/src/components/ErrorLogModal.test.tsx` 파일 내에 10만 자 이상의 텍스트와 이모지(ZWJ 결합)가 혼합된 대용량 데이터를 렌더링할 때 `Intl.Segmenter` 기반 텍스트 분할이 정상 동작하는지 확인하는 스트레스 렌더링 벤치마크 테스트가 필요합니다.
- 3100번대 포트가 이미 점유 중일 경우 서버가 안전하게 종료 코드를 반환하는지 확인하는 인프라 레벨의 통합 테스트 혹은 셸 스크립트 테스트가 누락되어 있습니다.

## Edge cases
- 루프 엔진 상태가 `stopped`로 강제 전이될 때, 동시성 락(`_lock`) 범위 밖에서 비동기적으로 들어온 `pending_instructions`가 큐에 적재되었다가 곧바로 버려질 수 있는 타이밍 이슈(Race condition)가 발생할 수 있습니다.
- 브라우저 환경에서 `Intl.Segmenter`를 지원하지 않아 `GRAPHEME_FALLBACK_PATTERN`이 실행될 때, 복잡한 유니코드 이모지 조합이 정확한 문자 단위로 잘리지 않아 UI 텍스트 일부가 깨지거나 생략되는 엣지 케이스가 존재합니다.

---

# TODO
- [ ] `api/app/main.py` 또는 구동 스크립트에 3100 포트 충돌 방지 로직(Address already in use 예외 처리 및 재시도) 추가 구현.
- [ ] `api/tests/test_loop_simulator.py`에 `max_loop_count` 및 `budget_limit` 초과/예외 상황에 대한 단위 테스트 케이스 보강.
- [ ] `web/src/components/ErrorLogModal.test.tsx`에 10만 자 이상 텍스트 및 ZWJ 결합 이모지가 포함된 대용량 렌더링 스트레스 테스트 작성.
- [ ] `web/src/components/ErrorLogModal.tsx`의 구형 브라우저 렌더링 시 Grapheme Cluster 정규식 Fallback 정확성 점검 및 엣지 케이스 보완.
- [ ] 포트 3100 점유 상태를 시뮬레이션하여 통합 테스트(로컬 포트 바인딩 우아한 실패 검증) 시나리오 반영.
