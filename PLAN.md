# PLAN

## 1. Task breakdown with priority

- **[P0] Toast 큐 상태 관리 및 식별자(dedupeKey) 누수 해결**
  - **대상 파일**: `web/src/App.tsx`
  - **작업 내용**: `enqueueToast` 호출 시 배열을 `.slice(-3)`으로 자르면서 큐에서 밀려난 이전 Toast들의 `dedupeKey`를 `dedupedToastKeysRef`에서 삭제하는 로직 추가.
- **[P0] 모바일 상호작용 충돌 개선 및 오버플로우 방어**
  - **대상 파일**: `web/src/components/Toast.tsx`, `web/src/styles/app.css`
  - **작업 내용**: 모바일 뷰포트에서 `mobile-blocker`와 충돌하는 '노드로 이동' 액션 버튼 렌더링을 제한하고, 텍스트가 뷰포트를 벗어나지 않도록 말줄임 처리 클래스(`text-overflow: ellipsis`) 추가.
- **[P1] 전역 상태 통합 단위 테스트 추가**
  - **대상 파일**: `web/src/App.test.tsx` (신규)
  - **작업 내용**: Toast 최대 3개 유지 검증, 밀려난 항목의 `dedupeKey` 해제 확인용 단위 테스트 작성.
- **[P1] Z-Index E2E 테스트 보강**
  - **대상 파일**: `web/tests/e2e/toast-layering.spec.ts`
  - **작업 내용**: 시스템 알림 요소 렌더링 시 발생 상태를 실제로 트리거하여 `z-index` 속성을 정확히 검증.

## 2. MVP scope / out-of-scope

- **MVP scope**:
  - `web/src/App.tsx` 내 Toast 큐 밀어내기 시 메모리 릭(`dedupeKey` 누수) 방지 처리.
  - 좁은 화면(모바일)에서 Toast 액션 버튼 제한 및 텍스트 넘침 현상 해결(CSS 기반).
  - 해당 결함을 커버하기 위한 `App.test.tsx` 테스트 추가 및 기존 E2E 테스트 보강.
- **Out-of-scope**:
  - 상태 관리 라이브러리(Zustand, Redux 등)로의 전면적인 구조 변경. (기존 React 상태 및 `useRef` 구조 유지)
  - CORS 관련 정규표현식 변경. (현재 SPEC 요구사항을 충족하므로 MVP 작업에서 제외)

## 3. Completion criteria

- Toast 알림이 4번 연속 호출될 때, 큐에서 제거된 첫 번째 Toast의 `dedupeKey`가 정상적으로 해제되어 동일한 알림이 다시 표시될 수 있음.
- `web/src/App.test.tsx` 내 단위 테스트 및 `web/tests/e2e/toast-layering.spec.ts` E2E 테스트가 모두 통과함.
- 브라우저를 모바일 크기로 줄였을 때, 긴 Toast 메시지가 UI를 이탈하지 않고 `...` 처리되며 액션 버튼이 비활성화되거나 숨겨짐.

## 4. Risks and test strategy

- **Risks**:
  - `slice(-3)` 과정에서의 큐 정리와 기존 `setTimeout` 기반의 `closeToast` 타이머 동작이 겹칠 경우 발생할 수 있는 잠재적 Race Condition.
  - 모바일 CSS 분기점(Breakpoint)이 기존 캔버스 `mobile-blocker`와 일치하지 않아 예외 해상도에서 액션 버튼이 오작동할 위험.
- **Test strategy**:
  - `App.test.tsx`에서 모의 타이머(Fake Timers)와 큐 조작을 혼합해 `dedupeKey` 누수 발생 조건을 재현 및 검증.
  - E2E 테스트에서 뷰포트 크기를 모바일 수준으로 조정하고 강제로 오류 알림을 발생시켜 UI 가시성과 버튼 노출 여부 점검.
  - 로컬 테스트 구동 시 포트 충돌 방지를 위해 `3000`번대 포트를 사용해 프리뷰 환경 검증.

## 5. Design intent and style direction

- **기획 의도**: DevFlow Agent Hub 내 Workflow 실행 중 발생하는 각종 상태나 Fallback을 사용자에게 즉각적이고 안정적으로 전달. 특히 모바일 환경 등 제약이 많은 뷰포트에서 불필요한 오류 경험 방지.
- **디자인 풍**: 대시보드형의 미니멀 및 모던 스타일.
- **시각 원칙**: 잦은 알림에도 가독성을 해치지 않게 말줄임표로 길이를 제약하며, Z-index를 통해 겹침 오류 없이 항상 최상단에 정보가 렌더링되도록 구성.
- **반응형 원칙**: 모바일 우선 규칙. 화면 너비가 좁을 시 복잡한 캔버스 이동 액션 등을 원천 제한하여 인지 부조화를 방지.

## 6. Technology ruleset

- **플랫폼 분류**: web
- **기술 스택**: web 기능 고도화이므로 React(Vite 기반) 프레임워크 유지 및 활용.

## 7. 고도화 플랜 단계 (REVIEW 반영)

1. **Toast 큐 및 식별자(dedupeKey) 누수 오류 해결**
   - **근거**: REVIEW.md의 버그 리포트. 큐에서 3개 초과로 탈락한 이전 Toast의 식별자가 제거되지 않아 신규 알림이 무시되는 치명적 버그 발생.
   - **구현 경계**: `web/src/App.tsx`의 `enqueueToast` 상태 업데이트 로직 안에서, 새로 구성된 배열에 포함되지 못한 이전 상태들의 `dedupeKey`를 식별하고 `dedupedToastKeysRef`에서 `delete` 하는 코드만 최소한으로 추가.
2. **Toast 모바일 상호작용 예외 처리 및 오버플로우 방어**
   - **근거**: REVIEW.md에서 모바일 화면의 시야 차단(mobile-blocker) 중 액션 클릭 오류와 Fallback 메시지 초과 문제를 지적함.
   - **구현 경계**: `web/src/components/Toast.tsx`에 전달되는 옵션에 따라 혹은 `web/src/styles/app.css` 내 미디어 쿼리를 사용하여 텍스트 길이를 잘라내는 CSS(`text-overflow: ellipsis`)를 적용하고 모바일 환경에서는 액션 요소 렌더링을 제한함.
