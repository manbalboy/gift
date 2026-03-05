# REVIEW

## Functional bugs
- `LoopSimulator`에 `max_loop_count` 및 `budget_limit`을 설정하고, 한도 도달 시 엔진 루프를 중지(`stopped` 또는 `idle`)하는 로직이 구현되지 않았습니다. 메인 틱 루프(`_run_forever`) 내에 관련 제어 조건이 누락되어 있어, 시스템이 강제로 종료될 때까지 무한 반복되는 결함이 존재합니다.

## Security concerns
- `web/src/utils/security.ts` 내 `sanitizeAlertText`는 `DOMPurify` 정제 후 정규식을 통해 모든 HTML 태그를 제거하여 순수 텍스트를 반환합니다. 현재 이 반환값을 React의 Text Node로 사용하여 XSS 위협을 차단하고 있으나, 향후 이 함수의 결과를 안전한 마크업(HTML)으로 오인하여 컴포넌트의 `dangerouslySetInnerHTML` 등에 주입할 경우 잠재적인 보안 위험 및 렌더링 오류를 야기할 수 있습니다. 

## Missing tests / weak test coverage
- **API 테스트 누락**: `PLAN.md`에 명시된 "예산(Budget) 초과 정지, 최대 루프 도달 시 상태 전이"를 검증하는 백엔드 모듈 단위 테스트(pytest)가 작성되지 않았습니다. 런타임 크래시에 대한 복구 모의 테스트만 존재합니다.
- **Web UI 테스트 부족**: `web/src/components/ErrorLogModal.test.tsx`에서 대용량 로그 가상화/페이지네이션 검증 시 25,000자의 단순 영문('A') 문자열만 사용하여 테스트하고 있습니다. `PLAN.md`에 요구된 "10만 자 이상의 더미 텍스트(한글/이모지 포함)" 처리 및 "멀티바이트 깨짐 여부 검증" 테스트 케이스가 누락되었습니다.

## Edge cases
- **문자열 경계 잘림 (Grapheme Cluster Break)**: `ErrorLogModal`의 로그 페이지네이션 로직에서 `Array.from()`을 사용해 Code Point 단위로 배열 슬라이싱을 수행합니다. 이는 기본 이모지와 같은 Surrogate Pair 형태는 방어하지만, Zero Width Joiner(ZWJ)로 묶인 조합형 이모지(예: 👨‍👩‍👧‍👦)나 복합 한글 텍스트의 경우 특정 페이지 단위 분할 지점(Boundary)에서 잘리면 글자가 깨져 보일 수 있는 엣지 케이스가 존재합니다.

---

## TODO (for coder)

- [ ] API: `LoopSimulator`에 `max_loop_count` 및 `budget_limit` 한도 설정 로직을 추가하고, 조건 만족 시 엔진을 안전하게 중지하는 기능 구현.
- [ ] API: 루프 엔진이 예산 초과 및 최대 사이클에 도달했을 때 정상적으로 상태 전이(`stopped`)가 일어나는지 검증하는 `pytest` 추가.
- [ ] Web: 10만 자 이상의 한글 및 조합형 이모지가 포함된 더미 텍스트를 주입하여 렌더링 프리징과 글자 깨짐 여부를 검증하는 프론트엔드 테스트 보강.
- [ ] Web: `ErrorLogModal`에서 대용량 문자열을 청크 단위로 분할할 때 문자가 깨지는 것을 방지하도록, 줄바꿈 기준 분할 방식이나 `Intl.Segmenter` 기반의 안전한 텍스트 자르기 로직 적용.
- [ ] Web: `sanitizeAlertText` 함수의 반환값이 HTML이 아닌 '순수 평문 텍스트'임을 명확히 안내하는 JSDoc 주석 또는 TypeScript Branded Type을 추가해 오남용을 방지.
