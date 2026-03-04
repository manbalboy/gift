# REVIEW

## Functional bugs
- 멀티 터치 오작동: 현재 `Toast.tsx` 컴포넌트에서 두 손가락 이상으로 터치(스와이프 또는 핀치 줌)할 경우, 좌표 계산이 잘못되어 렌더링 충돌이나 비정상적인 X축 이동 현상이 발생할 수 있는 버그가 존재합니다.
- 폰트 지연 로딩으로 인한 UI 오류: 웹 폰트가 완전히 로드되기 전 시스템 폰트 기준으로 텍스트 사이즈가 선계산되어, 실제 웹 폰트 적용 후 텍스트 오버플로우에 따른 '확장(Expand)' 버튼 노출 여부가 잘못 판별되는 렌더링 버그가 있습니다.

## Security concerns
- XSS(교차 사이트 스크립팅) 잠재 위험: 시스템 상태 및 비동기 작업 결과를 표시하는 Toast 컴포넌트 특성상, 외부 워크플로우 응답 데이터나 에러 로그가 그대로 화면에 출력될 수 있습니다. 스크립트 태그가 포함된 악의적인 입력값이 이스케이프 처리 없이 렌더링될 경우 XSS 취약점이 발생할 수 있으므로 안전한 텍스트 렌더링 처리가 보장되어야 합니다.

## Missing tests / weak test coverage
- 모바일 스와이프 제스처(Swipe to Dismiss) E2E 테스트 누락: `Toast.tsx` 내에 스와이프를 통한 닫기 로직은 존재하나, 이를 실제로 검증하는 테스트 시나리오가 없어 코드를 리팩토링할 때 회귀 버그 발생 위험이 높습니다.
- 접근성(A11y) 검증 커버리지 부족: 시스템 알림의 중요도를 고려했을 때, `role="alert"` 또는 `role="status"` 및 `aria-live="polite"`와 같은 필수 ARIA 속성들이 DOM 상에 올바르게 적용 및 유지되는지를 검증하는 E2E 테스트가 부재합니다.
- 재현 예시: 로컬에서 E2E 테스트를 실행할 때 포트 충돌을 피하고 독립적인 환경을 구축하기 위해 3100번 포트를 사용해야 합니다. (예: `PORT=3100 npx playwright test`)

## Edge cases
- 구형 브라우저 `document.fonts.ready` 미지원 환경: 일부 구형 브라우저에서는 해당 API가 지원되지 않거나 불안정하게 동작하여, 텍스트 사이즈 재평가 로직이 아예 실행되지 않고 UI가 깨질 수 있는 엣지 케이스가 존재합니다.
- 브라우저/엔진 간 터치 이벤트 동작 차이: Playwright의 Chromium과 WebKit 렌더링 엔진 간 모바일 터치스크린 시뮬레이션 방식에 미세한 차이가 있어, 특정 디바이스 환경에서 스와이프 종료 임계값(88px) 판정이 예상과 다르게 작동할 가능성이 있습니다.

## TODO
- [ ] `web/src/components/Toast.tsx` 내 `onTouchStart`, `onTouchMove` 이벤트 핸들러에 `event.touches.length > 1` 조건을 추가하여 멀티 터치를 무시하는 방어 로직 보완.
- [ ] `web/src/components/Toast.tsx`에 `document.fonts.ready` 완료 시점 이후 텍스트 오버플로우 높이를 재평가하는 `measureMessageOverflow` 훅 로직 적용.
- [ ] `document.fonts.ready` API를 지원하지 않는 브라우저를 대비한 폴백(Fallback) 로직 추가 구현.
- [ ] `web/tests/e2e/toast-layering.spec.ts` 파일에 단일 손가락 스와이프로 임계값(88px) 이상 이동 시 Toast가 정상적으로 닫히는지 검증하는 모바일 E2E 테스트 시나리오 작성 (테스트 포트 3100 지정).
- [ ] `web/tests/e2e/toast-layering.spec.ts` 파일에 Toast 컴포넌트의 접근성 ARIA 속성이 올바르게 렌더링되는지 확인하는 테스트 시나리오 보강.
- [ ] 네트워크 쓰로틀링(Throttling)을 통해 폰트 로딩을 인위적으로 지연시키는 상태(포트 3100 서버 기준)에서 확장 버튼 토글과 말줄임 UI를 수동 검수.
