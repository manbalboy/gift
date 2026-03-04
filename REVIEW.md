# REVIEW

본 리뷰는 `SPEC.md`와 `PLAN.md`에 정의된 요구사항을 바탕으로 현재 구현된 상태를 평가한 문서입니다.

## Functional bugs
- **`dangerouslySetInnerHTML` 사용의 모순**: `web/src/components/Toast.tsx`에서 메시지를 출력할 때 `dangerouslySetInnerHTML={{ __html: safeMessage }}`를 사용하고 있습니다. 하지만 `web/src/utils/escapeHtml.ts`의 `sanitizeToastText` 함수는 `<`와 `>`를 포함한 모든 HTML 기호를 이스케이프 처리합니다. 결과적으로 React의 기본 텍스트 렌더링(`{item.message}`)과 완벽하게 동일한 렌더링 결과를 얻으면서도, 불필요하게 XSS 취약점의 원인이 될 수 있는 DOM API를 직접 호출하는 안티패턴이 적용되어 있습니다.
- **스와이프 중 뷰포트 전환 시 상태 잔류**: 모바일 뷰포트에서 스와이프 제스처를 진행하던 도중 화면 회전이나 브라우저 창 크기 조절로 데스크톱 뷰포트로 전환될 경우, `swipeOffsetX` 값이 초기화되지 않습니다. 이로 인해 데스크톱 환경에서도 알림 카드가 옆으로 이동된 상태로 렌더링될 수 있는 논리적 버그가 존재합니다.

## Security concerns
- **XSS 방어 로직의 적합성 검토**: 현재 제어 문자(Control Character)를 제거하고 `&, <, >, ", '` 문자를 이스케이프하는 커스텀 로직은 기본적인 스크립트 삽입 공격을 방어합니다. 그러나 HTML 렌더링을 허용할 의도가 없다면 `dangerouslySetInnerHTML`과 커스텀 이스케이프 로직을 모두 제거하고 React 내장 렌더링 방식을 활용하는 것이 근본적인 보안 해결책입니다. 만약 메시지 내 부분적인 HTML(예: `<b>`, `<br>`) 허용이 기획 의도였다면, 정규식 기반의 치환 대신 `DOMPurify` 등 검증된 XSS Sanitizer 라이브러리를 사용해야 우회 공격을 안전하게 차단할 수 있습니다.

## Missing tests / weak test coverage
- **큐잉 및 중복 처리 로직에 대한 단위 테스트 누락**: `PLAN.md`의 Task 2.1에서는 "중복 필터링 및 큐잉 로직 검증을 위한 `Toast.test.tsx` 단위 테스트 작성"을 요구하고 있습니다. 그러나 작성된 `Toast.test.tsx` 파일에는 UI 컴포넌트의 노출 및 제스처 동작에 대한 검증만 존재하며, 전역 상태 수준에서 3개를 초과하는 알림이 발생했을 때의 대기열(Queue) 처리 및 중복 병합 로직에 대한 격리된 단위 테스트가 누락되어 있습니다.
- **E2E 스와이프 테스트의 한계**: `web/tests/e2e/toast-layering.spec.ts`의 제스처 테스트는 Playwright 환경 제약으로 인해 `dispatchEvent`를 사용하여 합성된 터치 이벤트를 주입하고 있습니다. 이는 DOM 이벤트 핸들러의 논리는 검증하지만, 실제 모바일 브라우저 엔진에서 발생할 수 있는 스크롤 개입이나 멀티 터치 등의 엣지 케이스를 완벽하게 모사하지 못하는 한계가 있습니다. (Playwright를 통한 E2E 테스트 재현 시 `PORT=3100 npx playwright test` 명령과 같이 3100번대 포트를 사용해야 합니다.)

## Edge cases
- **Message 값이 비어있을 때의 렌더링 결함**: 알림 데이터의 `item.message` 속성이 `null`이나 `undefined`로 전달될 경우, `sanitizeToastText` 내부의 `String(raw)` 캐스팅으로 인해 화면에 `"undefined"` 또는 `"null"`이라는 문자열이 텍스트로 그대로 노출됩니다.
- **클론 노드 오버플로우 측정 오류**: `measureMessageOverflow` 함수에서 `cloneNode`를 사용하여 텍스트 넘침을 측정할 때, 모바일 브라우저의 화면 렌더링 지연 등으로 인해 원본 `node.clientWidth`가 0에 가깝게 잡히면(`Math.max(node.clientWidth, 1)` 적용), 실제로는 넘치지 않는 텍스트임에도 측정 높이가 비정상적으로 산출되어 불필요한 '펼치기' 버튼이 렌더링될 수 있습니다.

---

## TODO

- [ ] `Toast.tsx`에서 `dangerouslySetInnerHTML` 사용을 제거하고, React의 안전한 기본 텍스트 바인딩(`{item.message}`) 방식으로 수정 (만약 부분적 HTML 렌더링이 필수라면 커스텀 이스케이프 로직 대신 `DOMPurify` 도입).
- [ ] `item.message`가 유효하지 않은 값(`null`, `undefined`)으로 전달되었을 때 화면에 노출되지 않도록 빈 문자열로 안전하게 처리하는 방어 코드 추가.
- [ ] 뷰포트 상태(`isMobile`)가 `true`에서 `false`로 변경되는 시점에 맞춰 `swipeOffsetX`와 스와이프 진행 상태(`isSwipingRef` 등)를 초기화하는 클린업 로직 보완.
- [ ] 알림 최대 노출 개수 제한, 큐(Queue) 대기열 처리 및 중복 알림 필터링 동작을 검증할 수 있도록 상태 관리자 측 단위 테스트 스펙 추가 작성.
- [ ] 텍스트 오버플로우 측정 로직 실행 전, 대상 노드의 너비가 유효한지(예: `clientWidth > 10`) 검사하여 보이지 않는 상태에서 잘못된 측정 결과가 도출되는 엣지 케이스 방지.
