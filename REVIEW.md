# REVIEW

## Functional bugs
- `api/app/services/loop_simulator.py`에 명세된 무한 루프 방지용 제어 로직(`max_loop_count` 및 `budget_limit`)이 불완전하거나 누락되어, 엔진이 자원을 고갈시키며 무한히 실행될 위험이 존재합니다.
- 프론트엔드의 `web/src/components/ErrorLogModal.tsx`에서 기존 배열 분할(`Array.from`) 방식을 사용할 경우, 대용량 텍스트나 복합 이모지(ZWJ 결합 문구 등) 렌더링 시 글자 깨짐(Grapheme Cluster Break) 현상과 브라우저 프리징이 발생할 수 있습니다.
- 엔진이 임계값 도달로 인해 `stopped` 상태로 전환될 때, 현재 진행 중인 상태의 하위 작업(Task)들에 대한 처리(대기열 유지 또는 즉각 취소)가 불명확하여 시스템 리소스 누수가 발생할 가능성이 있습니다.

## Security concerns
- `web/src/utils/security.ts`의 `sanitizeAlertText` 함수 반환값이 타입 시스템 차원에서 안전성이 보장되지 않습니다. React의 `dangerouslySetInnerHTML` 등에 해당 값이 오용될 경우 XSS(크로스 사이트 스크립팅) 공격에 노출될 수 있습니다.
- SPEC 문서에 명시된 CORS 허용 도메인 정책(`manbalboy.com` 및 `localhost` 계열 한정)이 API 서버에 엄격하게 적용되어 있는지 점검이 필요합니다. 와일드카드(`*`)가 허용되어 있다면 심각한 보안 위협이 될 수 있습니다.
- 백엔드 시뮬레이터에서 사용되는 `budget_limit` 파라미터가 외부 입력에 의해 음수나 비정상적인 값으로 조작될 수 있는 입력값 검증(Validation) 부재 우려가 있습니다.

## Missing tests / weak test coverage
- `api/tests/test_loop_simulator.py` 파일 내에 `max_loop_count` 및 `budget_limit` 제한 조건을 초과했을 때 엔진 루프가 정확히 중단(`stopped` 상태 전이)되는지 확인하는 엣지 케이스 단위 테스트가 누락되어 있습니다.
- `web/src/components/ErrorLogModal.test.tsx` 혹은 관련 테스트에서 10만 자 이상의 다국어 및 이모지가 혼합된 대용량 텍스트를 주입하여 렌더링 지연 및 글자 깨짐 현상을 검증하는 스트레스 테스트가 부족합니다.
- 로컬 환경 실행 시 포트 충돌 상황을 검증하는 테스트가 부족합니다. 예를 들어, `http://localhost:3100` 포트가 이미 점유된 상황에서 엔진이 어떻게 예외를 처리하는지에 대한 통합 테스트가 필요합니다.

## Edge cases
- 루프 제어 엔진이 초기 구동될 때 `max_loop_count`가 0 이하로 주어지거나 `budget_limit`이 이미 소진된 상태일 때의 조기 종료(Early exit) 예외 처리가 필요합니다.
- 프론트엔드에서 `Intl.Segmenter` API를 지원하지 않는 구형 브라우저로 접근할 경우, 텍스트 렌더링 로직에서 스크립트 에러가 발생하여 화면이 완전히 정지될 수 있습니다. 이에 대한 Fallback 방어 로직이 요구됩니다.
- 로컬 개발 시 3100번대 포트(예: 3100, 3101)를 바인딩할 때, 네트워크 어댑터 지연으로 인한 간헐적 바인딩 실패 시 재시도 로직이 필요할 수 있습니다.

---

## TODO
- [ ] `api/app/services/loop_simulator.py`에 `max_loop_count` 및 `budget_limit` 도달 시 엔진을 `stopped` 상태로 안전하게 멈추는 루프 제어 로직 구현.
- [ ] `api/tests/test_loop_simulator.py`에 예산 및 최대 사이클 초과 시 조기 종료를 검증하는 단위 테스트 추가 작성.
- [ ] `web/src/components/ErrorLogModal.tsx`의 텍스트 분할 로직을 `Intl.Segmenter` 기반으로 개선 및 구형 브라우저를 위한 Fallback 로직 적용.
- [ ] `web/src/components/ErrorLogModal.test.tsx` (또는 신규 파일)에 10만 자 이상의 복합 텍스트 및 이모지 렌더링 무결성을 확인하는 테스트 추가.
- [ ] `web/src/utils/security.ts`의 `sanitizeAlertText` 함수 반환값에 TypeScript Branded Type 적용 및 JSDoc 문서화를 통해 타입 안정성 확보.
- [ ] `main.py` 또는 앱 구동 스크립트에서 로컬 실행 시 3100번대(예: 3100) 포트 충돌 방지 및 우아한 예외 처리 로직 점검.
- [ ] 서버 CORS 설정이 `manbalboy.com` 및 `localhost` 기반 오리진으로 정확하게 제한되도록 검토 및 수정.
