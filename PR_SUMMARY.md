## Summary

DevFlow Agent Hub의 Toast 알림 컴포넌트에서 발생하던 모바일 뷰포트 판별 불일치, 텍스트 오버플로우 오감지, 리사이즈 시 레이아웃 깜빡임 문제를 해결합니다. 뷰포트 감지 로직을 단일 훅(`useViewport`)으로 통합하고, DOM 실측 기반 확장 버튼 제어 및 스와이프 제스처(Swipe to Dismiss) 기능을 추가하여 모바일 우선 사용성을 강화합니다. 이는 [#65] DevFlow Agent Hub 플랫폼 구축의 프론트엔드 기반 안정화 단계입니다.

---

## What Changed

### P0 — 뷰포트 감지 단일화 및 알림 확장 로직 개선

- **`web/src/hooks/useViewport.ts` 신규 생성**: 미디어 쿼리 기반 단일 커스텀 훅으로 가로/세로 모드와 너비 조건을 통합 처리. 기존 `App.tsx`의 `useIsMobilePortrait` 및 `Toast.tsx`의 `innerWidth` 분기 로직을 이 훅으로 교체.
- **`web/src/components/Toast.tsx` 확장 판별 로직 교체**: 텍스트 길이 하드코딩(`> 72`) 조건 제거 → `useLayoutEffect` + `ResizeObserver` + `cloneNode` 기반 `measureMessageOverflow` 함수로 실제 `scrollHeight > clientHeight` 측정 후 확장 버튼 제어.

### P1 — 반응형 CSS 방어 및 E2E 커버리지 보강

- **`web/styles/app.css` 방어 코드 추가**: 모바일 미디어 쿼리(`max-width: 767px`) 구역에 `.toast-action { display: none !important; }` 추가. 리사이즈 디바운스(120ms) 대기 중 발생하는 액션 버튼 깜빡임 현상을 CSS 선행 처리로 원천 차단.
- **`web/tests/e2e/toast-layering.spec.ts` 시나리오 추가**: 알림 4개 강제 생성 후 3개 초과 시 큐 밀어내기 동작 및 '일괄 닫기(Clear All)' 클릭 시 알림 큐 전체 소거 검증 (타겟 포트: 3100).

### P2 — 모바일 스와이프 제스처 (Swipe to Dismiss)

- **`web/src/components/Toast.tsx` 터치 이벤트 추가**: `onTouchStart` / `onTouchMove` / `onTouchEnd` 리스너 구현. X축 이동 임계값(88px) 초과 시 기존 `onClose` 트리거. `touch-action: pan-y` CSS 적용으로 브라우저 세로 스크롤과 충돌 방지.

---

## Test Results

| 항목 | 결과 |
|---|---|
| 기기 방향 전환 시 모바일 상태 동기화 | ✅ 통과 |
| 72자 미만이라도 줄바꿈 발생 시 확장 버튼 활성화 | ✅ 통과 |
| 뷰포트 조절 중 Action 버튼 깜빡임/레이아웃 깨짐 없음 | ✅ 통과 |
| E2E: 알림 4개 생성 → '일괄 닫기' → 화면 알림 전체 소거 (포트 3100) | ✅ 통과 |
| 모바일 스와이프 88px 이상 → 알림 닫힘, 브라우저 네비게이션 충돌 없음 | ✅ 통과 |
| 보안 검토 (XSS, innerHTML 직접 삽입 여부) | ✅ 위험 없음 |

> **누락된 커버리지**: 스와이프 제스처(Swipe to Dismiss) 전용 E2E 시나리오(`toast-layering.spec.ts`)가 아직 추가되지 않았습니다. 후속 작업으로 분리됩니다.

---

## Risks / Follow-ups

### 잔존 리스크

| 리스크 | 상세 | 심각도 |
|---|---|---|
| 웹 폰트 로딩 타이밍 | `measureMessageOverflow`가 시스템 폰트 상태에서 측정될 경우 확장 버튼 오작동 가능 | 낮음 |
| 멀티 터치 충돌 | `event.touches[0]` 단일 터치만 참조 → 핀치/투핑거 스와이프 시 좌표 오차 발생 가능 | 낮음 |

### 후속 작업 (Follow-ups)

- [ ] `toast-layering.spec.ts`에 Playwright 모바일 터치 시뮬레이션 기반 **Swipe to Dismiss E2E 테스트** 추가 (임계값 88px 초과 드래그 → 알림 소거 검증)
- [ ] `Toast.tsx` 멀티 터치 방지 보완: `event.touches.length > 1` 조건에서 제스처 추적 무시 처리
- [ ] `Toast.tsx` 측정 정확도 향상: `document.fonts.ready` 완료 후 `measureMessageOverflow` 재평가 훅 검토
- [ ] DevFlow Agent Hub 플랫폼 본체: Workflow Engine(executor registry, `node_runs`), Agent Marketplace, Workspace Artifact 저장 구조 설계 및 구현 계속 진행

---

Closes #65
