# REVIEW

## Functional bugs

- **Toast 큐 상태 관리 및 식별자(dedupeKey) 누수**
  - **설명**: `web/src/App.tsx`에서 알림 큐를 관리할 때, 새로운 Toast 알림이 추가되면서 기존 큐 배열을 `slice(-3)`으로 자를 때 큐에서 밀려난 항목들의 `dedupeKey`가 정상적으로 해제되지 않는 치명적인 버그가 존재합니다. 이로 인해 한 번 밀려난 알림과 동일한 내용의 알림을 다시 띄우려고 할 때 무시되는 현상이 발생합니다.
  - **재현 예시**: 로컬 개발 서버(예: `http://localhost:3100`)에 접속하여 동일한 경고 알림을 4번 연속 트리거할 경우, 첫 번째로 큐에서 제거된 알림이 이후 다시 호출되어도 렌더링되지 않음을 확인할 수 있습니다.

- **모바일 뷰포트에서 UI 오버플로우 및 상호작용 충돌**
  - **설명**: 모바일과 같은 좁은 화면 비율에서 긴 텍스트를 가진 Toast 메시지가 뷰포트를 벗어나는 오버플로우 문제가 있습니다. 또한 화면 차단을 위해 사용하는 `mobile-blocker`와 Toast 내부의 액션 버튼(예: '노드로 이동')이 겹쳐서 의도치 않은 상호작용 충돌이 발생합니다.

## Security concerns

- **CORS 허용 도메인 정책의 광범위한 정규식 허용**
  - **설명**: SPEC 문서에 따르면 `manbalboy.com` 계열의 서브도메인 및 포트를 포괄적으로 허용하는 정책이 요구됩니다. 비록 이번 MVP 구현 범위(Out-of-scope)에서는 CORS 정규식 변경이 제외되었으나, 광범위한 도메인 허용은 악의적인 서브도메인 탈취나 스푸핑 공격에 취약할 수 있습니다. 향후 배포 환경에서는 허용 origin 정책에 대해 보다 엄격한 검증 로직이 요구됩니다.

## Missing tests / weak test coverage

- **전역 상태 통합을 위한 단위 테스트 누락**
  - **설명**: 현재 Toast의 큐 밀어내기 로직과 `dedupeKey` 누수 발생을 방어하기 위한 테스트가 부재합니다. `web/src/App.test.tsx` 파일을 신규로 작성하여, 모의 타이머(Fake Timers)와 큐 조작을 혼합해 `dedupeKey` 누수 조건 및 최대 3개의 알림 유지를 검증하는 단위 테스트가 시급합니다.

- **Z-Index 및 렌더링 계층 E2E 테스트 부족**
  - **설명**: 컴포넌트 간의 겹침 상태를 실제 렌더링 트립에서 확인하는 테스트가 미흡합니다. `web/tests/e2e/toast-layering.spec.ts`를 보강하여, 모바일 뷰포트 크기로 조정 시 시스템 알림이 항상 최상단에 올바르게 노출되는지(z-index)를 검증하는 E2E 테스트 작성이 필요합니다.

## Edge cases

- **타이머 기반 상태 제거와 큐 정리 시점의 충돌(Race Condition)**
  - **설명**: 기존 `setTimeout` 기반의 `closeToast` 타이머가 만료되는 시점과 새로운 Toast가 추가되어 `slice(-3)`을 통해 큐가 강제로 잘리는 시점이 겹칠 경우 발생할 수 있는 잠재적인 레이스 컨디션(Race Condition)이 존재합니다. 이 경우 타이머가 이미 삭제된 요소를 참조하려 하면서 React 상태 업데이트 에러가 발생할 수 있습니다.

- **예외 해상도에서의 CSS 분기점(Breakpoint) 오작동**
  - **설명**: 모바일 CSS 분기점이 `mobile-blocker`의 활성화 해상도와 완벽하게 일치하지 않을 수 있습니다. 특정 태블릿 해상도나 화면 분할 환경(예: 로컬 테스트 `http://localhost:3101`에서 가로폭을 임의로 조절하는 경우)에서 액션 버튼이 반쯤 가려지거나 클릭이 불가능한 상태로 렌더링될 수 있는 엣지 케이스가 우려됩니다.

## TODO

- [ ] `web/src/App.tsx`: `enqueueToast` 함수 내 배열 `slice(-3)` 처리 시 밀려나는 이전 Toast들의 `dedupeKey`를 `dedupedToastKeysRef`에서 `delete` 하는 로직 추가
- [ ] `web/src/components/Toast.tsx`: 모바일 뷰포트 감지 시 액션 버튼('노드로 이동' 등)의 렌더링을 제한하거나 숨기도록 컴포넌트 수정
- [ ] `web/src/styles/app.css`: 좁은 화면에서 텍스트가 뷰포트를 이탈하지 않도록 `text-overflow: ellipsis`를 적용한 모바일 전용 미디어 쿼리 속성 추가
- [ ] `web/src/App.test.tsx`: Toast 3개 초과 유지 방지 및 `dedupeKey` 해제를 검증하는 통합 단위 테스트 작성(모의 타이머 활용)
- [ ] `web/tests/e2e/toast-layering.spec.ts`: 모바일 뷰포트 크기를 시뮬레이션하고, 강제 오류 알림 발생 시 UI 가시성 및 Z-Index 겹침 방지를 확인하는 E2E 테스트 보강
