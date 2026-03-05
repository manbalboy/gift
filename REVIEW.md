# REVIEW

## Functional bugs
- **XSS 필터링 로직 오작동 (`web/src/utils/security.ts`)**
  현재 `sanitizeAlertText` 함수 내부를 보면, 문자열에서 꺾쇠괄호(`<`, `>`)를 먼저 `&lt;`, `&gt;`로 이스케이프한 뒤 `DOMPurify.sanitize`를 호출하고 있습니다. 이로 인해 DOMPurify는 입력된 문자열을 단순 텍스트로 인식하게 되어 악의적인 HTML 스크립트 태그나 속성을 전혀 걸러내지 못합니다. 그리고 직후에 `restoreAngleBrackets`를 통해 원래 꺾쇠괄호로 복원해버리므로, 실질적으로 XSS 필터링 기능이 작동하지 않는 심각한 논리적 버그가 존재합니다.

## Security concerns
- **잠재적 XSS 노출 위험**
  현재 프론트엔드에서 React가 문자열을 렌더링할 때 기본적으로 HTML 엔티티로 이스케이프 처리하기 때문에 브라우저에서 스크립트가 당장 실행되지는 않습니다. 하지만, 보안 유틸리티(`security.ts`)가 악성 페이로드를 근본적으로 제거하지 못하고 원본 그대로 반환하는 상태이므로, 향후 해당 유틸리티를 거친 문자열이 `dangerouslySetInnerHTML` 등으로 렌더링되거나 외부로 노출될 경우 치명적인 XSS 공격 취약점으로 직결될 위험이 매우 높습니다.

## Missing tests / weak test coverage
- **`LoopMonitorWidget` 컴포넌트 단위 테스트 누락**
  Plan에 명시된 주요 모니터링 컴포넌트인 `web/src/components/LoopMonitorWidget.tsx`가 정상적으로 마운트되고, `Quality Score`나 잔여 반복 횟수(max_loop_count)가 조건에 맞게 렌더링되는지 검증하는 단위 테스트(`LoopMonitorWidget.test.tsx`) 파일이 완전히 누락되어 있습니다.
- **큐 오버플로우 UI 경고 연동 프론트엔드 검증 부족**
  루프 엔진 큐가 가득 차 지시사항이 `dropped`(`queue_overflow`) 처리될 때 사용자에게 경고 Toast 알림을 띄우는 로직은 구현되어 있으나, 이를 실제로 검증하는 프론트엔드 테스트 케이스(`App.test.tsx` 내부 등)가 존재하지 않습니다.
- 참고: 백엔드 API(포트 3100)의 Redis Lock Fail-fast 오류 전파 및 다중 상태 제어 신호 동시성 스트레스 테스트(E2E)는 백엔드 테스트 코드 내에 정상적으로 확보되어 있습니다.

## Edge cases
- **SSE 이벤트 폭주로 인한 브라우저 렌더링 스파이크**
  다중 제어 명령 스트레스 상황이 발생할 경우 백엔드 엔진 상태가 매우 짧은 간격으로 갱신되면서 프론트엔드로 대량의 SSE 이벤트가 유입될 수 있습니다. 현재 `LoopMonitorWidget` 컴포넌트나 관련 상태 관리 로직에서 이러한 상태 업데이트 폭주를 제어(Throttling/Debouncing)하는 방어 코드가 보이지 않아 렌더링 병목 및 UI 멈춤 현상이 발생할 수 있습니다.
- **초과 루프 카운트 표기 방어 모호성**
  `LoopMonitorWidget` 내에서 `remainingLoopCount`를 계산할 때 `Math.max(0, ...)`를 사용하여 화면에 음수가 나오지 않게만 임시 조치하고 있습니다. 만약 루프 엔진이 오류로 인해 제한을 넘어 초과 실행될 경우, UI에는 계속 '0'만 표시되므로 사용자가 시스템 제어 실패 상황을 직관적으로 인지하기 어렵습니다.

---

## TODO

- [ ] `web/src/utils/security.ts`의 `sanitizeAlertText` 함수 로직 전면 수정: 이스케이프를 먼저 하지 말고, DOMPurify가 악성 태그를 정상적으로 제거하도록 한 뒤 제네릭(`<T>`) 등 정상적인 문법만 화면에 출력할 수 있도록 안전하게 처리.
- [ ] `web/src/components/LoopMonitorWidget.test.tsx` 파일을 생성하여 대시보드 컴포넌트의 렌더링, 색상 톤(`qualityTone`), 수치 변화에 대한 단위 테스트 작성.
- [ ] `web/src/App.test.tsx` 파일 내에 API 응답 지시사항 상태가 `dropped`(`queue_overflow`)로 수신될 경우 화면에 Toast 경고 UI가 노출되는지 검증하는 테스트 케이스 추가.
- [ ] 빈번한 루프 갱신 상황에 대비하여, 프론트엔드 상태 갱신 로직에 디바운스(Debounce) 혹은 쓰로틀링(Throttle)을 적용해 클라이언트 성능 엣지 케이스 개선.
