# REVIEW

## Functional bugs
- 시스템 전반의 핵심 기능(Loop 엔진 상태 제어, 포트 충돌 방지 스크립트, React 가상화 렌더링 등)은 PLAN.md 및 SPEC.md의 요구사항에 맞게 정상적으로 구현되어 있습니다. 
- 단, `useLoopStatus` 훅을 사용해 클라이언트에서 폴링 최적화를 진행했으나, 사용자가 브라우저 탭을 백그라운드로 이동시켰을 때 불필요한 API 폴링을 중단하거나 주기를 대폭 늘리는 최적화(Page Visibility API 연동)가 누락되어 서버 및 클라이언트 자원 낭비를 유발할 수 있습니다.

## Security concerns
- 루프 엔진 제어 권한을 검증하는 `require_loop_control_permission`에서 `hmac.compare_digest`를 사용해 타이밍 공격을 방어한 점은 훌륭합니다.
- `api/app/main.py`의 CORS 설정에서 허용된 도메인(`manbalboy.com` 및 `localhost:3100` 대역) 외의 악의적인 서브도메인 스푸핑(예: `fakemanbalboy.com`)을 방지하기 위해, 내부 정규식 패턴(`_CORS_ALLOWED_HOST_PATTERN`)이 엄격하게 호스트의 끝맺음 매칭(`$`)을 강제하고 있는지 재점검이 필요합니다.
- `scripts/run-api-31xx.sh`에서 환경변수로 `START_PORT`와 포트 범위를 받을 때 기본적으로 숫자형 정규식 검증을 수행하므로 안전하지만, 이외의 변수에 대해서도 셸 인젝션 방어 처리가 완벽한지 한 번 더 확인이 필요합니다.

## Missing tests / weak test coverage
- `ErrorLogModal.test.tsx`의 테스트 실행 시간이 약 22초 이상 소요되어 전체 테스트 스위트의 속도를 저하시키고 있습니다. 대규모 가상화 렌더링 성능 검증 시 실제 무거운 DOM 연산을 무작정 기다리기보다는, 렌더링 결과물의 길이나 스크롤 위치 모킹(Mocking)을 통해 검증하도록 타임아웃 벤치마크 테스트를 최적화해야 합니다.
- 3100번대 포트 충돌 상황에 대한 통합 테스트 스크립트(`test_port_collision_integration_script.py`)가 존재하나, 3100번부터 3199번까지 모든 포트가 완전히 고갈된 최악의 상황에서 스크립트가 무한 루프에 빠지지 않고 정해진 재시도 횟수 후 종료 코드를 반환하는지에 대한 명시적 엣지 케이스 단위 테스트가 보강되어야 합니다.
- 백엔드 `LoopSimulator` 엔진이 런타임 예외로 인하여 `crashed` 상태가 되었을 때, 이벤트 루프가 정상적으로 `safe_mode` 또는 안전 정지(`stopped`)로 복구되는지 검증하는 에러 주입 테스트의 커버리지 확장이 필요합니다.

## Edge cases
- `scripts/run-api-31xx.sh` 스크립트는 3100번대 포트의 점유 상태를 확인하기 위해 외부 명령어인 `ss`와 `lsof`에 강하게 의존합니다. 최소화된 도커(Alpine, Slim 등) 환경에서는 해당 유틸리티가 설치되어 있지 않을 수 있으므로, Python의 내장 `socket` 모듈이나 bash의 `/dev/tcp`를 이용한 Fallback 검사 로직이 필요합니다.
- `ErrorLogModal.tsx`에 구현된 `Intl.Segmenter` 미지원 구형 브라우저 대상의 정규식 Fallback(`GRAPHEME_FALLBACK_PATTERN`)이 복잡하여, ZWJ(Zero Width Joiner) 문자가 수천 개 연속된 특수하고 악의적인 페이로드가 주입될 경우 브라우저 렌더링 스레드가 블로킹(ReDoS 위험)될 소지가 있습니다.
- `LoopSimulator`가 `budget_limit`나 `max_loop_count` 한도에 도달해 강제 정지(Stopped)된 후 사용자가 다시 `Start` API를 호출하면 내부의 소비 예산(`_consumed_budget = 0`)이 0으로 완전 초기화됩니다. 이 때 SPEC.md에서 요구하는 '장기 실행 및 지속 발전' 관점에서 기존의 메모리 컨텍스트를 이어서 실행할지 여부를 명확히 결정하고, 관련 주석 및 예외 처리 정책을 확립해야 합니다.

## TODO
- [ ] `useLoopStatus` 훅에 Page Visibility API를 활용하여 탭이 백그라운드로 전환 시 폴링을 중단하거나 늦추는 최적화 적용
- [ ] `ErrorLogModal.test.tsx`의 테스트 구조를 개선하여 CI 실행 속도(성능) 단축
- [ ] 스크립트(`run-api-31xx.sh`) 내 포트 3100번대 점유 확인 시 `ss`, `lsof` 명령어가 없을 경우를 대비한 Python 스크립트 기반 Fallback 추가
- [ ] Grapheme Split 정규식 Fallback 로직에서 극단적인 ZWJ 반복 페이로드를 방어하기 위해 입력 문자열 길이를 제한하거나 사전 정제(Sanitization) 처리
- [ ] 루프 제한(Budget/Loop Count)에 도달해 중지된 엔진을 다시 Start 할 때의 메모리 상태 관리 정책 확립 및 코드화
