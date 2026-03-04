# REVIEW

## Functional bugs
- **터치 및 스와이프 중 자동 닫힘 타이머 미정지**: `Toast.tsx`에 마우스 Hover(`isHovered`) 및 키보드 Focus(`isFocusWithin`) 시 타이머를 일시 정지하는 로직은 구현되어 있으나, 모바일 터치 및 스와이프 제스처(`onTouchStart`, `onTouchMove`) 중에는 타이머가 일시 정지되지 않습니다. 이로 인해 사용자가 긴 알림 텍스트를 읽기 위해 화면을 누르고 있거나 스와이프를 천천히 하는 도중에도 자동 닫힘 타이머가 만료되면 알림이 예기치 않게 강제로 닫혀버리는 현상이 발생합니다.
- **E2E 테스트 실패 (잘못된 단언 및 API 모킹)**: 로컬 웹 서버(예: `http://localhost:3100`) 환경에서 `npm run test:e2e`를 실행해 보면 3개의 테스트 케이스가 실패합니다.
  - Test 1, 2의 `await expect(page.getByLabel('시스템 알림')).toBeVisible()` 실패: `.toast-stack`은 자식 요소(알림)가 없을 때 높이가 0이므로 Playwright에서 `hidden`으로 간주됩니다. 알림이 렌더링된 이후에 가시성을 체크하도록 테스트 코드의 순서를 수정해야 합니다.
  - Test 6의 `alert` role 검증 실패: `**/api/webhooks/dev-integration` 라우트에 대해 너무 포괄적인 모킹을 적용하여, '파싱 오류 시뮬레이션' 버튼 클릭 시 의도했던 422 에러 응답 대신 200 성공 응답을 받게 됩니다. 이로 인해 `error` 대신 `warning` 알림이 발생하여 단언 구문이 실패합니다. 모킹 대상을 세분화해야 합니다.

## Security concerns
- **복잡한 객체 렌더링 시 정보 노출 가능성**: `String(item.message)`를 통해 렌더링을 수행하여 스크립트 인젝션 등의 XSS 취약점은 훌륭하게 방어하고 있습니다. 하지만 `item.message`로 구체적인 에러 객체(`Error`)나 비표준 객체(`{}`)가 그대로 넘어올 경우, 내부 스택 트레이스나 구조화된 데이터 정보가 의도치 않게 사용자 UI에 노출되거나 `[object Object]`로 파싱되어 보안 로그 추적에 혼선을 줄 수 있는 잠재적 위험 요소(Low Risk)가 존재합니다.

## Missing tests / weak test coverage
- **Hover/Focus 타이머 일시 정지 E2E 테스트 누락**: `Toast.test.tsx`를 통한 Unit Test에서는 모킹된 가짜 타이머(`jest.useFakeTimers()`)를 사용하여 Hover 및 Focus 동작을 꼼꼼하게 검증하고 있습니다. 그러나 실제 브라우저 렌더링 및 이벤트 루프 환경에서 마우스 오버 및 키보드 탭을 수행했을 때 타이머가 의도대로 정지되는지 확인하는 Playwright 기반의 E2E 테스트가 누락되어 있어, 통합 동작 관점에서의 방어가 다소 부족합니다.
- **다양한 메시지 타입에 대한 안전성 검증 부족**: `number`와 `null`, `undefined`에 대한 `String()` 캐스팅 방어 테스트는 존재하지만, 복잡한 중첩 구조의 `Array` 및 `Object` 형태의 데이터가 넘어왔을 때 컴포넌트가 어떻게 렌더링을 시도하고 방어하는지를 다루는 Edge Case 단위 테스트가 추가되어야 합니다.

## Edge cases
- **객체 타입 메시지의 UX 저하**: `item.message` 파라미터로 `{ "id": 1, "status": "failed" }`와 같은 객체가 전달될 경우, 알림 내용이 화면에 단순히 `[object Object]`로 표시되어 사용자에게 아무런 정보도 전달하지 못하는 엣지 케이스가 존재합니다.
- **영구 노출 알림 구성의 한계**: `durationMs`가 `0`으로 주입될 경우, 현재 로직에서는 `Math.max(0, remainingMsRef.current)` 연산에 의해 지연 시간이 0이 되어 알림이 렌더링 직후 즉시 닫혀버립니다. 아주 중요한 시스템 장애 상황 등에서 수동으로만 닫을 수 있도록 자동 만료 타이머를 비활성화(예: `durationMs=0` 시 무한 대기)하는 요구사항이 발생할 경우 대응할 수 없는 구조적 한계가 있습니다.

## TODO
- [ ] 모바일 기기에서의 안정적인 알림 확인을 위해 `onTouchStart`, `onTouchMove` 제스처 도중에도 자동 닫힘 타이머를 일시 정지(Pause)하도록 로직 보완
- [ ] E2E 테스트 실패 항목 3건의 원인 수정 (가시성 체크 시점 변경 및 API 라우트 모킹 대상 세분화)
- [ ] `item.message`에 객체(`Object`)나 배열(`Array`) 타입이 전달되었을 때 화면에 `[object Object]`로 출력되지 않고, `JSON.stringify()` 등을 활용해 내부 내용을 명확히 보여주도록 메시지 문자열 파싱 규칙 강화
- [ ] 알림 렌더링 시 `durationMs`가 `0`일 경우, 알림이 즉시 사라지지 않고 사용자가 닫기 버튼을 누를 때까지 영구히 유지되도록 예외 처리 로직 추가
- [ ] Hover/Focus 이벤트에 의한 타이머 일시 정지 및 재개 기능이 브라우저 환경에서 정상 작동하는지 검증하는 E2E 테스트 케이스(`toast-layering.spec.ts`) 작성
