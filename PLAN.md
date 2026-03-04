```markdown
# PLAN

## 1. Task breakdown with priority
- **[P0] Toast 알림 큐 식별자 누수 수정 (Bug Fix)**
  - 대상 파일: `web/src/App.tsx`
  - 작업 내용: `enqueueToast` 함수 내에서 알림 큐를 `slice(-3)`으로 자를 때, 큐에서 제거되어 밀려나는 이전 Toast들의 `dedupeKey`를 `dedupedToastKeysRef`에서 `delete`하여 누수를 막고 동일 알림 무시 현상을 해결.
- **[P1] 모바일 뷰포트 UI 오버플로우 및 상호작용 개선 (UI/UX)**
  - 대상 파일: `web/src/components/Toast.tsx`, `web/src/styles/app.css`
  - 작업 내용:
    - 좁은 화면(모바일 뷰포트)에서 긴 텍스트가 뷰포트를 벗어나지 않도록 `app.css`에 `text-overflow: ellipsis`를 적용하는 모바일 전용 미디어 쿼리 추가.
    - 모바일 뷰포트 감지 시 Toast 내부의 액션 버튼('노드로 이동' 등) 렌더링을 제한하거나 숨겨 `mobile-blocker`와의 상호작용 충돌을 방지.
- **[P1] Toast 알림 큐 관리 단위 테스트 보강 (Testing)**
  - 대상 파일: `web/src/App.test.tsx`
  - 작업 내용: 모의 타이머(Fake Timers)를 활용하여 3개를 초과하는 알림 발생 시 큐 밀어내기가 올바르게 동작하는지, 그리고 제거된 항목의 `dedupeKey`가 정상 해제되는지 검증하는 단위 테스트 추가.
- **[P2] Z-Index 및 렌더링 계층 E2E 테스트 보강 (Testing)**
  - 대상 파일: `web/tests/e2e/toast-layering.spec.ts`
  - 작업 내용: 모바일 뷰포트 크기를 시뮬레이션하여 시스템 알림이 항상 최상단에 노출되는지(Z-Index 검증) 확인하고, UI 요소 간 겹침 문제를 점검하는 Playwright E2E 테스트 보강.
- **[P3] DevFlow 기반 안정적 알림 상태 연동 준비 (고도화 플랜)**
  - 대상 범위: Web 프론트엔드
  - 작업 내용: 향후 서버(FastAPI)에서 전달될 다양한 상태(review_needed, retrying 등) 이벤트를 Toast에서 병목 없이 소화할 수 있도록 현재의 큐 로직을 견고하게 최적화.

## 2. MVP scope / out-of-scope
- **MVP Scope**:
  - `web/src/App.tsx` 내 Toast 알림 큐 관리 로직 안정화 (`dedupeKey` 해제 로직).
  - 모바일 환경에서의 Toast UI 말줄임 처리 및 액션 버튼 숨김.
  - 개선된 로직을 방어하기 위한 프론트엔드 단위 테스트(`App.test.tsx`) 및 E2E 테스트(`toast-layering.spec.ts`) 작성.
- **Out-of-scope**:
  - `SPEC.md`에 명시된 장기 과제(Temporal/LangGraph 엔진 도입, 대규모 워크플로우 백엔드 개편)는 본 MVP 구현 범위에 포함하지 않음.
  - CORS 허용 도메인 정책 정규식은 운영 환경 호환을 위해 당장 수정하지 않으며, 보안 백로그로 이관.

## 3. Completion criteria
- 로컬 개발 서버(예: `http://localhost:3000`) 접속 후, 동일한 경고 알림을 4번 이상 트리거 했을 때 첫 번째로 큐에서 제거된 알림이 재호출 시 무시되지 않고 정상적으로 렌더링되어야 함.
- 브라우저 폭을 모바일 해상도로 조정 시 Toast 텍스트가 말줄임 처리되어 레이아웃을 이탈하지 않아야 함.
- 모바일 해상도에서 Toast 내 액션 버튼이 숨겨져 `mobile-blocker`와의 클릭 겹침 문제가 발생하지 않아야 함.
- `web/src/App.test.tsx` 테스트 실행 시 `dedupeKey` 누수 방지 검증 케이스가 모두 PASS 해야 함.
- `web/tests/e2e/toast-layering.spec.ts` E2E 테스트 실행 시 모바일 해상도 기준 Z-Index가 정상 적용되어 통과해야 함.

## 4. Risks and test strategy
- **Risks**:
  - 기존 `setTimeout` 기반의 타이머 상태 제거 시점과 `slice(-3)`을 통한 배열 강제 정리가 겹치며 레이스 컨디션(Race Condition)이 발생하여 React 상태 업데이트 에러가 발생할 가능성.
  - 특정 태블릿 등 예외적인 뷰포트에서 미디어 쿼리(Breakpoint)가 겹쳐 버튼이 반쯤 가려지는 UI 오작동 발생 위험.
- **Test Strategy**:
  - 단위 테스트(`App.test.tsx`)에서 Fake Timers를 사용해 시간 만료와 새로운 알림 푸시를 동시에 발생시키는 레이스 컨디션 엣지 케이스를 구현하고 방어.
  - E2E 테스트(`toast-layering.spec.ts`)에서 모바일 및 태블릿의 경계 해상도를 명시적으로 주입하여 렌더링 계층(Z-Index)과 요소의 가시성(Visibility)을 단언(Assert).

## 5. Design intent and style direction
- **기획 의도**: DevFlow 플랫폼의 다양한 워크플로우 상태(에러, 워크플로우 진행 등)를 사용자에게 알리는 과정에서, 알림이 누락되거나 메인 작업 화면을 가려 흐름을 방해하지 않는 안정적이고 깔끔한 알림 경험을 제공.
- **디자인 풍**: 모던하고 직관적인 대시보드형 팝업(카드형 알림) 스타일.
- **시각 원칙**: 시스템 상태(성공, 경고, 에러)에 부합하는 명확한 컬러 사용. 좁은 화면에서도 가독성을 잃지 않도록 텍스트 여백을 최적화하고 오버플로우를 정돈된 타이포그래피로 제어.
- **반응형 원칙**: 모바일 우선(Mobile First). 모바일 뷰포트에서는 화면 공간을 차지하는 불필요한 액션 버튼을 생략하고 핵심 메시지에 집중.

## 6. Technology ruleset
- **플랫폼 분류**: web
- **기술 스택**: web 플랫폼 환경이므로 React(Vite 기반) 중심으로 구현.
- **테스트 도구**: 단위 테스트는 Jest, E2E 렌더링 계층 테스트는 Playwright를 기반으로 계획.
```
