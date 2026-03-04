# PLAN

## 1. Task breakdown with priority

### [P0] 버그 픽스 및 보안 강화 (REVIEW.md 반영)
- **상태 동기화 및 메모리 누수 해결**: `web/src/App.tsx` 내 Toast의 렌더링 사이클과 Ref 데이터 불일치 해결. `web/src/components/Toast.tsx`의 리사이즈 이벤트 클린업 보완.
- **XSS 취약점 검증 및 제거**: 앱 전반에 걸쳐 외부 데이터 렌더링 무결성을 확보하고 `dangerouslySetInnerHTML` 사용 원천 배제 확인.

### [P1] 사용성 및 UI/UX 개선 (REVIEW.md 반영)
- **리사이즈 이벤트 최적화**: `web/src/components/Toast.tsx`에 리사이즈 디바운스/쓰로틀 로직을 적용하여 연속적인 크기 조절 시 과도한 리렌더링 및 UI 멈춤 현상 방지.
- **모바일 애니메이션 및 레이아웃 개선**: `web/src/styles/app.css` (또는 토큰 CSS) 수정. 모바일 뷰포트에서 텍스트 확장(Expand) 탭 조작 시 부드러운 전환을 위해 `max-height` 및 `transition` 애니메이션 적용, 레이아웃 깨짐(Jumping) 해결.

### [P2] 테스트 커버리지 확보 (REVIEW.md 반영)
- **상태 경합 단위 테스트**: `web/src/App.test.tsx` 보강. `jest.useFakeTimers()`를 활용하여 동시성 이벤트 및 `dedupeKey`를 통한 상태 경합(Race Condition) 방어 로직 검증.
- **모바일 뷰포트 단위 테스트**: `web/src/components/Toast.test.tsx` 보강. 뷰포트 크기 모킹을 통해 텍스트 말줄임 조건 및 렌더링 무결성 관련 분기 테스트 추가.
- **E2E 테스트 구현**: 포트 3100 타겟팅. Playwright를 활용하여 동적 브라우저 리사이징 및 모바일 화면의 시각적 반응성 결함을 교차 검증하는 `web/tests/e2e/toast-layering.spec.ts` 시나리오 보강.

### [P3] 고도화 플랜 (인접 기능 추가)
- **Toast 알림 일괄 닫기(Clear All) 기능 추가**: 현재 개별 알림 닫기만 가능하나, 여러 알림이 쌓였을 때 사용자 경험을 개선하는 일괄 닫기 로직 및 UI 요소 추가 (`web/src/App.tsx`, `web/src/components/Toast.tsx`).
- **근거 및 경계**: 기존 Toast 알림의 상태(Queue) 관리 로직을 리팩토링하는 과정에서 상태 동기화 개선과 직접적으로 연결되는 기능입니다. 별도의 도메인 확장이 아니며, 최소한의 렌더링 사이클로 UI 편의성을 높일 수 있습니다.

## 2. MVP scope / out-of-scope

### MVP Scope
- `REVIEW.md`에 나열된 Functional bugs, Security concerns, Edge cases의 근본적 해결.
- `web/src/App.tsx`, `web/src/components/Toast.tsx`, `web/src/styles/app.css`를 중심으로 한 프론트엔드 상태 및 스타일 리팩토링.
- Jest 기반 단위 테스트 및 Playwright 기반 E2E 테스트(포트 3100) 보완.
- Toast 알림 일괄 닫기 액션 기능 추가.

### Out-of-scope
- 백엔드 API (FastAPI) 로직, 워크플로우 엔진, 에이전트 마켓플레이스 영역 수정.
- Toast 알림 시스템 이외의 대시보드 UI/UX 전면 개편.
- 경고(Warning) 및 오류(Error) 외 새로운 알림 레벨(Info, Success 등) 추가 도입.

## 3. Completion criteria
- `web/src/App.tsx`에서 Toast 상태와 `dedupedToastKeysRef` 간의 데이터 불일치가 발생하지 않으며, 알림 최대 개수(3개) 초과 시 큐 로직이 안정적으로 동작함.
- 창 크기 연속 조절 시 디바운스 처리로 렌더링 지연이 발생하지 않고 메모리 누수가 없음.
- 모바일 뷰포트에서 확장 탭 터치 시 부자연스러운 점핑 없이 부드러운 애니메이션(Transition)이 정상 적용됨.
- 소스 코드 전체에서 `dangerouslySetInnerHTML` 사용 내역이 발견되지 않음.
- 추가/보강된 Jest 단위 테스트와 Playwright E2E 테스트가 포트 3100 로컬 환경에서 모두 통과함.

## 4. Risks and test strategy

### Risks
- 다수의 웹훅 이벤트가 밀리초 단위로 동시에 유입될 경우, 렌더링 사이클에 묶여 기존 상태 경합(Race Condition) 문제가 재발할 가능성.
- E2E 테스트 시 렌더링 지연이나 모바일 뷰포트 전환 중 플래키(Flaky) 테스트 발생 우려.

### Test Strategy
- **상태 모킹 로직 검증**: Jest의 `useFakeTimers`와 `act`를 적극 활용, 극한의 알림 발생 시나리오에서도 상태 큐(Queue)가 꼬이지 않는지 단언(Assert) 중심 테스트 수행.
- **이벤트 라이프사이클 검증**: 컴포넌트 마운트 및 언마운트 과정을 반복하여 이벤트 리스너(resize)의 완벽한 해제 여부 검증.
- **E2E 시각적 회귀 방어**: 포트 3100을 지정한 개발 서버 환경(`npm run dev -- --port 3100`)을 타겟으로, 데스크톱/모바일 뷰포트를 오가며 상태 동기화 및 애니메이션 변화를 검증.

## 5. Design intent and style direction
- **기획 의도**: 워크플로우 과정에서 발생하는 알림을 사용자에게 안정적이고 직관적으로 전달하여 상황 인지와 문제 해결을 돕는 핵심 경험 제공.
- **디자인 풍**: 모던 대시보드형의 미니멀한 레이어드 카드형(Layered Card) 스타일.
- **시각 원칙**:
  - 컬러: Error는 명확한 붉은색 계열, Warning은 주황/노랑 계열을 통해 즉각적인 주의 환기.
  - 패딩/마진: 과도한 텍스트 뭉침을 피하기 위해 카드 내부 요소 간 일관된 여백 적용.
  - 타이포: 시스템 메시지에 부합하는 가독성 높은 산세리프(Sans-serif) 폰트 유지 및 헤더 볼드 처리.
- **반응형 원칙**: 모바일 우선(Mobile-first) 규칙 적용. 767px 이하 화면에서는 너비에 맞게 배치되고 긴 텍스트는 말줄임 처리되며, 터치 시 부드럽게 세로로 확장되는 인터랙션 제공.

## 6. Technology ruleset
- **플랫폼 분류**: web
- **기반 기술**: React (TypeScript 적용, Vite 환경)
- **상태 관리 및 로직**: React Hooks (`useState`, `useEffect`, `useRef` 등) 및 함수형 컴포넌트 구조 유지.
- **스타일링**: 순수 CSS 기반 토큰 방식 (`web/src/styles/app.css` 등) 사용.
- **실행 및 테스트 가이드**: 
  - 개발 서버 및 E2E 테스트 타겟 포트는 `3100` 고정 (`npm run dev -- --port 3100`).
  - 테스트 프레임워크: Jest (Unit/Integration), Playwright (E2E).
