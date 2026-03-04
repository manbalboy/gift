# REVIEW

## Functional bugs
- 현재 구현상 두드러지는 기능적 결함은 보이지 않습니다. 모바일 뷰포트 감지 단일화(`useViewport`), DOM 크기 기반 텍스트 오버플로우 측정, 제스처 기반 Toast 스와이프 로직이 PLAN대로 정상 구현되어 있습니다.

## Security concerns
- DOM을 직접 다루는 `measureMessageOverflow` 함수에서 `cloneNode`를 사용하고 인라인 스타일을 조작하고 있으나, 사용자 입력 텍스트를 `innerHTML` 등으로 직접 삽입하는 구문이 없으므로 XSS(Cross-Site Scripting) 등의 직접적인 보안 위험은 발견되지 않았습니다.

## Missing tests / weak test coverage
- **스와이프 제스처(Swipe to Dismiss) 테스트 부재**: `Toast.tsx`에 `onTouchStart`, `onTouchMove`, `onTouchEnd` 이벤트 기반의 스와이프 닫기 로직이 P2 고도화 플랜에 따라 구현되었으나, 정작 `web/tests/e2e/toast-layering.spec.ts` 에는 해당 동작을 검증하는 E2E 시나리오가 누락되어 있습니다. Playwright의 모바일 터치 시뮬레이션을 활용해 X축 임계값(88px) 이상 드래그 시 알림이 닫히는지 검증하는 커버리지 보강이 필요합니다.

## Edge cases
- **초기 웹 폰트 로딩 타이밍 이슈**: `measureMessageOverflow`에서 `cloneNode`를 통해 `scrollHeight`를 측정하는 방식은 실제 렌더링 결과물을 반영하여 정확도가 높지만, 브라우저가 사용자 정의 웹 폰트를 완전히 로딩하기 전(시스템 폰트 상태)에 측정이 발생할 경우 줄바꿈 기준이 실제와 달라 확장(Expand) 버튼 노출 여부가 오작동할 수 있습니다.
- **멀티 터치 상호작용 충돌**: `onTouchStart` 및 `onTouchMove` 이벤트에서 `event.touches[0]` 만을 참조하여 단일 터치 제스처를 처리하고 있습니다. 두 손가락 이상으로 스와이프하거나 확대/축소(Pinch) 제스처를 취하는 도중에 알림 영역이 터치될 경우 좌표 계산이 튀거나 비정상적인 애니메이션이 발생할 엣지 케이스가 존재합니다.

## TODO
- [ ] `web/tests/e2e/toast-layering.spec.ts` 내에 모바일 환경 스와이프를 통한 Toast 닫기 동작(Swipe to Dismiss) E2E 테스트 시나리오 추가 (대상 포트: 3100)
- [ ] (선택) `Toast.tsx`의 멀티 터치 방지 로직 보완 (예: 터치 이벤트 내부에서 `event.touches.length > 1`인 경우 제스처 추적 무시)
- [ ] (선택) `Toast.tsx`의 텍스트 측정 정확도 확보를 위해 `document.fonts.ready` 완료 후 `measureMessageOverflow`를 재평가하는 훅 또는 이벤트 추가 검토
