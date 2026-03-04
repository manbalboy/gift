# REVIEW

## Functional bugs
- **UI 렌더링 및 폰트 지연 로딩 문제:** `web/src/components/Toast.tsx` 컴포넌트에서 폰트 로딩 지연으로 인해 텍스트 오버플로우 높이가 잘못 계산되는 버그가 있습니다. `document.fonts.ready` API 완료 시점에 `measureMessageOverflow` 로직을 재평가해야 하며, 해당 API를 지원하지 않는 브라우저를 대비한 폴백(Fallback) 로직이 추가되어야 합니다.
- **모바일 멀티 터치 오작동:** 모바일 환경에서 두 손가락 이상으로 터치할 경우에도 스와이프 이벤트가 처리되는 오작동이 발생합니다. `onTouchStart` 및 `onTouchMove` 이벤트 핸들러에 `event.touches.length > 1` 조건을 추가하여 다중 터치를 무시하는 방어 로직이 누락되어 있습니다.
- **다중 알림 중복 및 UI 가림 현상:** 짧은 시간 내에 동일한 상태나 에러 메시지가 다수 발생할 경우, 알림 창이 화면을 가리는 현상이 있습니다. 중복 메시지 필터링 및 일정 개수 초과 시 대기시키는 큐잉(Queueing) 로직 구현이 필요합니다.

## Security concerns
- **XSS(Cross-Site Scripting) 취약점:** 알림 메시지 렌더링 시 워크플로우 응답 데이터 및 에러 로그 등 외부 입력값에 대한 텍스트 이스케이프 처리가 적용되지 않아, 악의적인 스크립트가 실행될 위험이 존재합니다. 

## Missing tests / weak test coverage
- **E2E 스와이프 검증 부족:** 모바일 환경에서 단일 손가락 스와이프로 임계값(88px) 이상 이동 시 알림이 정상적으로 닫히는지 검증하는 테스트 시나리오가 부족합니다. E2E 테스트는 3100 포트 환경에서 구동되어야 합니다.
- **접근성(a11y) 속성 검증 누락:** `web/tests/e2e/toast-layering.spec.ts` 내에 `role="alert"`, `role="status"`, `aria-live="polite"` 등 필수 ARIA 속성이 올바르게 DOM에 렌더링되는지 확인하는 접근성 검증이 필요합니다.
- **단위 테스트 부재:** 새로 추가될 큐잉 로직, 중복 필터링, 그리고 XSS 이스케이프 처리가 올바르게 동작하는지 확인하는 단위 테스트(`Toast.test.tsx`) 작성이 누락되어 있습니다.

## Edge cases
- **렌더링 엔진 간 터치 이벤트 미세 차이:** Chromium 및 WebKit 등 브라우저 렌더링 엔진의 모바일 터치 이벤트 시뮬레이션 차이로 인해 자동화 테스트 시 스와이프 임계값(88px) 판정이 간헐적으로 실패(Flaky)할 수 있습니다.
- **폰트 다운로드 지연 및 폴백 누락:** 구형 브라우저 또는 네트워크 쓰로틀링(Throttling) 환경에서 폰트 다운로드가 지연될 때 폴백 로직이 누락될 경우, 텍스트 재평가 실패 및 확장(Expand) 버튼 미노출 등 UI가 깨질 가능성이 있습니다.

## TODO
- [ ] `web/src/components/Toast.tsx` 파일 내 외부 입력값 렌더링 시 안전한 텍스트 이스케이프 처리 함수를 적용하여 XSS 취약점 방어.
- [ ] `web/src/components/Toast.tsx` 내에 `document.fonts.ready` 기반 `measureMessageOverflow` 텍스트 재평가 로직 및 `setTimeout` 등을 활용한 폴백(Fallback) 함수 구현.
- [ ] `onTouchStart`, `onTouchMove` 이벤트 핸들러에 `event.touches.length > 1` 조건문을 추가하여 멀티 터치 오작동 방어 로직 구현.
- [ ] Toast Provider 등 전역 상태 관리 로직에 다중 알림 큐잉(Queueing) 및 중복 메시지 필터링 기능 추가.
- [ ] `web/src/components/Toast.test.tsx` 파일에 XSS 이스케이프 처리 및 큐잉 로직을 검증하는 Jest 단위 테스트 작성.
- [ ] `web/tests/e2e/toast-layering.spec.ts` 파일에 88px 임계값 모바일 스와이프 동작 및 ARIA 접근성 유지 여부를 확인하는 E2E 테스트 추가.
- [ ] `PORT=3100 npx playwright test` 명령을 실행하여 브라우저 엔진별 E2E 테스트 케이스가 100% 통과하는지 확인.
- [ ] 크롬 개발자 도구의 네트워크 쓰로틀링(Throttling)을 적용하여 폰트 로딩 지연 시 확장(Expand) 버튼 노출 여부 등 UI 재평가 상태 수동 검수.
