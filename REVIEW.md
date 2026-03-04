# REVIEW

## Functional bugs
- **Mobile Viewport 감지 기준 불일치**: `App.tsx`의 `useIsMobilePortrait` 훅은 `(max-width: 767px) and (orientation: portrait)` 쿼리를 사용하는 반면, `Toast.tsx` 내부에서는 단순히 `window.innerWidth <= 767`을 기준으로 판단하고 있습니다. 기기를 가로(Landscape) 모드로 회전할 경우, 뷰포트 너비와 방향 조건이 충돌하여 Action 버튼 노출 및 알림 확장(Expand) 로직 간의 UI 불일치가 발생할 수 있습니다.
- **텍스트 길이 기반 확장 판별 로직의 한계**: `Toast.tsx`에서 `item.message.length > 72` 조건으로 메시지 말줄임 및 확장 가능 여부를 판별하고 있습니다. 실제 렌더링되는 폰트, 화면 폭, 단어 길이에 따라 72자 미만의 텍스트도 줄바꿈이 발생하여 가려질 수 있으며, 반대로 띄어쓰기 없는 영문 72자는 레이아웃을 깨뜨릴 수 있습니다. DOM의 실제 사이즈(`scrollHeight` 등)를 확인하는 방식이 더 견고합니다.

## Security concerns
- **XSS 위험 배제 확인**: 소스코드 전체를 검증한 결과 `dangerouslySetInnerHTML` 사용이 완전히 배제되어 있음을 확인했습니다. React의 기본 이스케이프 메커니즘을 통해 로그나 웹훅 메시지 등 사용자/시스템 입력값이 안전하게 렌더링되고 있어 추가적인 텍스트 주입 공격 우려는 없습니다.
- **보안 특이사항 없음**: 현재 노드 실행 결과 및 웹훅 검증 과정에 존재하는 데이터를 DOM에 렌더링하는 과정에서 안전성이 확보되어 있습니다.

## Missing tests / weak test coverage
- **일괄 닫기(Clear All) E2E 테스트 부재**: `App.test.tsx` 단위 테스트에서는 '일괄 닫기'를 검증하고 있으나, 실제 로컬 포트 3100번 환경을 타겟으로 하는 Playwright 기반 시각적 테스트(`toast-layering.spec.ts`)에는 다수의 알림이 누적되었을 때 일괄 삭제되는 플로우가 검증되지 않았습니다.
- **하위 컴포넌트 통합 테스트 누락**: `App.test.tsx`에서 `Dashboard`, `LiveRunConstellation`, `WorkflowBuilder`를 모두 `jest.mock`으로 단순하게 덮어쓰고 있어, 메인 쉘(App)과 하위 컴포넌트 간 실제 상태(props) 전달 및 에러 바운더리에 대한 통합 검증 커버리지가 다소 약합니다.
- **API 실패 시나리오 커버리지 부족**: `handleStartRun`, `handleSaveWorkflow` 등 API 요청에서 에러(500 상태 코드 등)가 발생했을 때 Toast 컴포넌트로 적절하게 `error` 메시지가 전파되는지에 대한 네트워크 레벨 모킹 테스트가 보강되어야 합니다.

## Edge cases
- **다량의 이벤트 큐 밀어내기 및 언마운트 대응(우수)**: 3개를 초과하는 다중 알림이 밀리초 단위로 유입될 경우, `commitToasts` 내에서 초과분을 즉시 제거하며 컴포넌트가 언마운트될 때 `Toast` 내부의 타이머 클린업 로직이 완벽하게 동작합니다. 이는 메모리 누수 및 중복된 `onClose` 이벤트를 훌륭하게 방어한 결과입니다.
- **연속적인 화면 리사이징(Resize) 시 레이아웃 시프트**: 창 크기를 조절하는 동안 디바운스(120ms)가 동작하는 찰나의 순간에 Action 버튼이 일시적으로 보였다가 숨겨지는 깜빡임 현상이 발생할 수 있습니다. JS 레벨의 상태 관리와 함께 CSS 미디어 쿼리를 병행하면 이 현상을 더 확실히 방어할 수 있습니다.
- **동일 DedupeKey 재생성 경합**: 자동 만료 시점과 사용자가 수동으로 버튼을 닫는 시점, 그리고 동일 알림이 다시 추가되는 시점이 겹쳤을 때 Set 자료구조(`dedupedToastKeysRef`)의 삽입/삭제가 안정적으로 동기화되는 로직이 설계되어 있습니다.

---

## TODO (For Coder)
- [ ] **뷰포트 감지 유틸리티 통합**: `App.tsx`의 미디어 쿼리 기반 조건과 `Toast.tsx`의 단순 `innerWidth` 판별 조건을 통일된 커스텀 훅(`useViewport` 등)으로 추출하여 가로/세로 모드 불일치를 해결하세요.
- [ ] **알림 확장 판별 로직 개선**: Toast 메시지의 `length > 72` 하드코딩 조건을 제거하고, `useLayoutEffect` 또는 `ResizeObserver`를 활용하여 텍스트 컨테이너의 실제 `scrollHeight`가 `clientHeight`보다 큰지 여부를 기준으로 확장(Expand) 버튼 활성화를 제어하세요.
- [ ] **E2E 테스트 시나리오 보강**: `toast-layering.spec.ts` 파일(3100번 포트 타겟)에 최소 4개 이상의 알림을 강제로 발생시킨 후, '일괄 닫기(Clear All)' 버튼을 클릭해 알림 큐가 정상적으로 비워지는지 확인하는 시나리오를 추가하세요.
- [ ] **반응형 CSS 방어 로직 추가**: `app.css` 파일에서 `max-width: 767px` 구간 내 `.toast-action { display: none !important; }` 등의 미디어 쿼리를 추가하여 리사이즈 이벤트 디바운스 대기 시간 동안 레이아웃이 깨지는 엣지 케이스를 방어하세요.
- [ ] **(고도화 제안)** 모바일 환경 사용성을 위해 좌우 스와이프 이벤트를 감지하여 개별 알림을 닫는 'Swipe to dismiss' 기초 제스처 이벤트 리스너를 `Toast` 컴포넌트에 구현하세요.
