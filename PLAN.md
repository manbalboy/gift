# PLAN

## 1. Task breakdown with priority

| Priority | Task | Target Files | Impact & Rationale |
| :--- | :--- | :--- | :--- |
| **P0** | 모바일 스와이프 제스처 닫기(Swipe to Dismiss) E2E 테스트 추가 | `web/tests/e2e/toast-layering.spec.ts` | **영향 범위:** E2E 테스트 파이프라인.<br>**근거:** REVIEW.md 지적 사항. `Toast.tsx`에 제스처 닫기 로직은 구현되어 있으나 테스트 시나리오가 누락되어 회귀 버그 방지를 위해 필수. E2E 실행 시 대상 포트는 3100을 사용. |
| **P1** | 멀티 터치 방지 로직 보완 | `web/src/components/Toast.tsx` | **영향 범위:** Toast 터치 이벤트 핸들러(`onTouchStart`, `onTouchMove`).<br>**근거:** 두 손가락 이상으로 스와이프하거나 핀치 줌 시 발생하는 좌표 계산 오작동 및 렌더링 충돌을 방지하기 위해 `event.touches.length > 1` 인 경우 제스처 추적을 무시하도록 변경. |
| **P1** | 웹 폰트 로딩 대기 후 텍스트 오버플로우 재측정 로직 추가 | `web/src/components/Toast.tsx` | **영향 범위:** Toast 컴포넌트 렌더링 및 `measureMessageOverflow` 훅.<br>**근거:** 폰트 로드 전 시스템 폰트 기준으로 사이즈가 선계산되어 '확장(Expand)' 버튼 노출 여부가 잘못 결정되는 엣지 케이스 해결. `document.fonts.ready` 완료 시점에 크기를 재평가하도록 보완. |
| **P2** | (고도화) Toast 접근성(A11y) ARIA 속성 E2E 테스트 보강 | `web/tests/e2e/toast-layering.spec.ts` | **영향 범위:** E2E 테스트 파이프라인.<br>**근거:** 시스템 상태 알림의 중요도를 감안하여, 현재 구현된 `role="alert" / "status"` 및 `aria-live="polite"` 속성이 렌더링 트리에서 정상적으로 유지되는지 확인하는 인접 테스트 시나리오 추가. |

## 2. MVP scope / out-of-scope

**MVP scope**
- 단일 터치 스와이프로 Toast 컴포넌트가 임계값(88px) 이상 이동 시 정상 닫힘 처리 및 테스트 통과
- 멀티 터치(다중 손가락 터치) 상황에서 제스처 오작동 방지 방어 코드 적용
- 웹 폰트 로딩 지연 환경에서도 텍스트 높이를 정확하게 재측정하여 확장(Expand) 버튼의 안정적 노출 보장
- 모바일 뷰포트 시뮬레이션 기반 Playwright E2E 테스트 구축 (포트 3100 구동)

**Out-of-scope**
- Framer Motion 등 별도 애니메이션 라이브러리의 전면 도입 (기존 Vanilla CSS Transform 및 Transition 방식 유지)
- Toast를 제외한 대시보드 내 다른 UI 요소에 대한 제스처 상호작용 추가
- DevFlow Agent Hub의 코어 파이프라인이나 백엔드(FastAPI) 로직 수정

## 3. Completion criteria

- `web/tests/e2e/toast-layering.spec.ts` 내 모바일 제스처 테스트가 CI 및 로컬 환경(포트 3100)에서 100% 통과해야 함.
- 개발 환경 브라우저의 네트워크 쓰로틀링(Throttling)을 이용해 의도적으로 폰트 로딩을 지연시켰을 때도, 텍스트 말줄임 및 '확장' 버튼 토글 상태가 정확히 일치해야 함.
- 두 손가락 이상으로 Toast를 터치하거나 드래그해도 콘솔 에러가 발생하지 않고, 비정상적인 X축 이동 현상이 일어나지 않아야 함.

## 4. Risks and test strategy

**Risks**
- Playwright 환경(Chromium vs WebKit) 간 터치 및 제스처 이벤트 시뮬레이션 동작 방식에 미세한 차이가 발생할 가능성.
- `document.fonts.ready` API가 지원되지 않거나 불안정한 구형 브라우저 환경에서 재평가 로직이 동작하지 않을 수 있는 폴백(Fallback) 처리 리스크.

**Test strategy**
- **E2E 테스트:** Playwright의 `page.touchscreen.tap` 및 `page.mouse.move` API를 활용하여 스와이프 드래그 제스처를 시나리오화하고 검증.
- **수동 테스트:** 디바이스 터치 모드 에뮬레이터를 활성화하여, 1) 짧은 스와이프 후 복귀 2) 임계값 이상 스와이프 시 알림 닫힘 3) 멀티 터치 시 무시됨의 3가지 케이스를 검수.
- 격리된 테스트 환경 보장을 위해 테스트 실행 포트를 3100으로 고정하여 다른 서비스 포트와의 충돌 방지.

## 5. Design intent and style direction

- **기획 의도:** DevFlow Agent Hub 내 비동기 작업 결과(예: 워크플로우 성공/실패)를 사용자에게 즉각적이고 명확하게 전달하며, 모바일 기기 사용자가 화면 상단의 알림을 스와이프로 직관적이고 끊김 없이 닫을 수 있는 마이크로 인터랙션 경험 제공.
- **디자인 풍:** 복잡한 개발 데이터를 다루는 '대시보드형' 뷰에 적합하도록 시각적 노이즈를 덜어낸 모던하고 미니멀한 UI.
- **시각 원칙:**
  - **컬러:** 알림 레벨(warning, error)을 명확히 인지할 수 있는 시맨틱 컬러 사용.
  - **패딩/마진:** 터치 조작 오입력을 막기 위해 최소 44px 이상의 넉넉한 터치 타겟 여백 확보.
  - **타이포:** 시스템 폰트와 웹 폰트를 적절히 혼합하여 가독성을 극대화하고, 다국어 텍스트 오버플로우 발생 시 우아하게 말줄임 처리.
- **반응형 원칙:** 모바일 우선(Mobile-First) 규칙 적용. 모바일에서는 스와이프 닫기와 텍스트 확장 토글을 제공하며, 화면이 넓어지는 데스크탑 환경에서는 별도의 명시적인 액션 버튼을 노출하도록 레이아웃을 분기 처리.

## 6. Technology ruleset

- **플랫폼 분류:** web
- **프론트엔드 프레임워크:** React (Vite, TypeScript 환경)
- **테스트 프레임워크:** Playwright (E2E), Jest (Unit)
