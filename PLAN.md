```markdown
# PLAN

## 1. Task breakdown with priority

**P0 (Critical: 기능 결함 및 UI 불일치 해결)**
- 뷰포트 감지 유틸리티 통합
  - `web/src/hooks/useViewport.ts` 신규 커스텀 훅 생성.
  - 가로(Landscape) 및 세로(Portrait) 모드 조건이 뷰포트 너비 판별과 충돌하지 않도록 미디어 쿼리 기반의 단일화된 뷰포트 상태 감지 로직 구현.
  - `web/src/App.tsx`의 `useIsMobilePortrait` 및 `web/src/components/Toast.tsx`의 `innerWidth` 기반 분기 로직을 신규 훅으로 교체.
- 알림 확장 판별 로직 개선
  - `web/src/components/Toast.tsx` 내부의 텍스트 길이 하드코딩(`item.message.length > 72`) 조건 제거.
  - `useLayoutEffect`와 텍스트 컨테이너(ref)를 활용하여 실제 DOM 사이즈(`scrollHeight > clientHeight`)를 측정하고, 줄바꿈 발생 시 확장(Expand) 버튼 활성화 제어.

**P1 (Important: 사용성 안정성 및 엣지 케이스 방어)**
- 반응형 CSS 방어 로직 추가
  - `web/styles/app.css` 파일의 모바일 미디어 쿼리(`max-width: 767px`) 구역에 `.toast-action { display: none !important; }` 등의 방어 코드 추가.
  - 자바스크립트의 리사이즈 이벤트 디바운스(120ms) 대기 중 발생하는 액션 버튼 깜빡임 현상 원천 차단.
- E2E 테스트 시나리오 보강
  - `web/tests/e2e/toast-layering.spec.ts` 내에 알림 큐 일괄 닫기 검증 시나리오 추가.
  - 4개 이상의 알림을 강제로 트리거하여 3개 초과 시 초과분이 밀어내기로 큐에서 제거되는지 확인.
  - 노출된 다중 알림 상태에서 '일괄 닫기(Clear All)' 버튼을 클릭해 알림 큐가 정상적으로 비워지는지 동작 검증 (타겟 포트: 3100).

**P2 (고도화 플랜: REVIEW 반영 확장 기능)**
- 모바일 스와이프 제스처 기능 (Swipe to Dismiss) 추가
  - `web/src/components/Toast.tsx`에 `onTouchStart`, `onTouchMove`, `onTouchEnd` 이벤트 리스너 추가.
  - 모바일 뷰포트 상태에서 좌우 방향 스와이프를 감지하고 지정된 거리 임계값(Threshold)을 초과할 경우 알림을 닫는 UX 기능 구현.
  - **구현 경계**: x축 이동 거리에 따른 컴포넌트 변형(transform) 효과 부여 및 일정 픽셀 이상 스와이프 시 기존 `onClose` 로직 트리거. 브라우저 스크롤 충돌을 막기 위한 CSS 속성(`touch-action: pan-y`) 적용 병행.
  - **근거**: 터치 디바이스의 좁은 화면 환경에서 닫기 버튼([x])을 정밀하게 탭하기 어려운 문제를 해소하고 쾌적한 상호작용을 보장하기 위함.

## 2. MVP scope / out-of-scope

**MVP Scope**
- `App.tsx`와 `Toast.tsx` 등 프론트엔드 전반에 걸친 모바일 뷰포트 판별 로직의 단일화.
- 실제 화면 크기와 렌더링 폰트에 독립적으로 동작하는 DOM 측정 방식의 알림 확장 기준 변경.
- 창 크기 변경 시 레이아웃 시프트를 막기 위한 CSS 우선 방어 코드 작성.
- 로컬 개발 환경(포트 3100번) 기반 E2E 알림 일괄 닫기 플로우 커버리지 달성.
- 모바일 터치 스와이프 닫기(Swipe to Dismiss) 기본 제스처 상호작용 적용.

**Out-of-scope**
- 전역 상태 관리 라이브러리(Zustand, Redux 등)를 도입하여 Toast 상태 구조를 변경하는 작업 (React 상태 기반 유지).
- 복잡한 컴포넌트 애니메이션 도구(Framer Motion 등)를 활용한 화려한 시각 전환 로직 추가.
- Workflow API, Webhooks 등 FastAPI 백엔드 관련 코드 수정.

## 3. Completion criteria
- 기기 방향(가로/세로) 전환 및 브라우저 창 조절 시 어플리케이션 내 모바일 상태 판별이 오차 없이 동기화될 것.
- Toast 텍스트가 72자를 넘지 않더라도, 작은 화면으로 인해 물리적인 줄바꿈이 발생해 컨텐츠가 가려지면 확장(Expand) 버튼이 활성화될 것.
- 뷰포트 너비를 조절하는 동안 Action 버튼이 일시적으로 깜빡이거나 레이아웃을 깨뜨리지 않을 것.
- 3100번 포트로 구동되는 로컬 테스트 환경에서 4개의 알림을 생성하고, '일괄 닫기'를 실행했을 때 화면의 알림이 완전히 사라지는 E2E 테스트가 통과할 것.
- 모바일 뷰포트에서 Toast 컴포넌트를 좌우로 일정 픽셀 이상 스와이프할 경우 브라우저 네비게이션과 충돌하지 않고 정상적으로 알림이 닫힐 것.

## 4. Risks and test strategy
- **Risks**: 
  - 텍스트 길이 측정을 위해 `scrollHeight`를 읽어올 때 React의 초기 렌더링 페인트 타이밍과 엇갈리면 초기 높이 측정이 실패하여 버튼이 나타나지 않을 수 있음.
  - 모바일 스와이프 제스처가 디바이스 기본 터치(뒤로 가기 등) 동작과 충돌할 위험 존재.
- **Test Strategy**:
  - `useLayoutEffect` 내부와 더불어 텍스트 컨테이너 사이즈 변화를 지속 감지하는 `ResizeObserver`를 활용해 측정 정확도를 보장함.
  - CSS에 `touch-action: pan-y`를 적용하여 브라우저의 기본 가로 제스처 캡처를 막고 이벤트 리스너 내 `cancelable` 상태를 검증함.
  - Playwright E2E 테스트 실행 시 로컬 실행 포트를 `3100`으로 고정하여 검증 스크립트(`toast-layering.spec.ts`)를 가동함.

## 5. Design intent and style direction
- **기획 의도**: 워크플로우 실행 시 발생하는 다량의 피드백을 사용자에게 안정적으로 전달하고 피로도를 낮추는 것이 핵심 메시지임. 이를 위해 알림 큐를 안정적으로 관리하고, 오류 상황이나 상태 변경 시 즉각적이고 일관된 제어 기능을 제공함.
- **디자인 풍**: 모던 대시보드형 
  - 플로팅 레이어 중심, 직관적이고 간결한 텍스트, 투명도와 그림자 블러(Drop Shadow)를 통한 레이어 분리 효과 활용.
- **시각 원칙**:
  - 컬러: 알림 성격(Warning-Yellow/Error-Red)에 맞춘 좌측 포인트 컬러 바를 활용하고, 정보의 가독성을 최우선으로 하는 고대비 텍스트 색상 채택.
  - 패딩/마진: 모바일 환경의 터치 정확도를 고려하여 상호작용 요소 간 충분한 터치 영역(Target Size, 권장 최소 44px) 확보.
  - 타이포: 다양한 환경에서도 균일하게 렌더링되는 웹 폰트(Sans-Serif 기반)와 시스템 폰트 활용.
- **반응형 원칙**: 모바일 우선 (Mobile-First) 
  - 모바일 화면에서는 스와이프 제스처 및 탭 확장(Expand) 중심의 상호작용 구조를 제공하고, 데스크톱 등 더 넓은 화면에서는 즉시 사용할 수 있는 보조 Action 버튼을 렌더링하도록 차등 설계함.

## 6. Technology ruleset
- **플랫폼 분류**: web
- **기술 기반**: React (Vite, TypeScript 환경) 프레임워크 기반 설계.
- 모든 신규 컴포넌트 훅 및 뷰 로직은 React 함수형 컴포넌트와 내장 훅(`useState`, `useRef`, `useLayoutEffect`, `useEffect` 등)을 이용해 구현하며 DOM 조작 및 사이드 이펙트를 최소화함.
```
