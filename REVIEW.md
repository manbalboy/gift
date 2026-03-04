# REVIEW

## Functional bugs
- **상태 동기화 및 메모리 누수**: `web/src/App.tsx` 파일 내에서 Toast 컴포넌트의 렌더링 사이클과 내부 Ref 데이터 간의 동기화 불일치 문제가 있습니다. 알림 최대 개수 초과 시 큐(Queue) 로직이 정상적으로 동작하지 않을 수 있습니다.
- **리사이즈 이벤트 처리 미흡**: `web/src/components/Toast.tsx`에서 브라우저 창 크기를 연속적으로 조절할 경우 이벤트 클린업 및 최적화가 부족하여 과도한 리렌더링 및 UI 멈춤 현상이 발생합니다.
- **모바일 레이아웃 점핑 현상**: 모바일 뷰포트에서 긴 텍스트를 가진 알림의 확장(Expand) 탭을 터치할 때, 부드러운 애니메이션 전환 없이 레이아웃이 튀는 현상이 있습니다.

## Security concerns
- **XSS (크로스 사이트 스크립팅) 노출 위험**: 외부에서 유입되는 웹훅 데이터를 기반으로 알림을 렌더링할 때, 데이터 무결성 검증이 누락될 위험이 있습니다. 앱 내에 `dangerouslySetInnerHTML`과 같은 안전하지 않은 DOM 조작 메서드 사용 여부를 전면 검증하고 원천적으로 차단해야 합니다.

## Missing tests / weak test coverage
- **상태 경합(Race Condition) 단위 테스트 부족**: `web/src/App.test.tsx`에 여러 웹훅 이벤트가 동시에 유입될 경우를 대비한 상태 처리(동시성 이벤트 및 `dedupeKey` 로직) 검증 테스트가 필요합니다.
- **모바일 뷰포트 렌더링 단위 테스트 부재**: `web/src/components/Toast.test.tsx`에서 화면 크기 모킹을 통한 텍스트 말줄임 조건이나 분기 처리에 대한 테스트가 누락되어 있습니다.
- **E2E 기반 시각적 회귀 테스트 미흡**: Playwright를 이용한 E2E 환경(`web/tests/e2e/toast-layering.spec.ts`)에서 동적 브라우저 리사이징 및 모바일 화면 전환 시 시각적 반응성을 점검하는 시나리오가 불충분합니다.

## Edge cases
- **초고속 다중 알림 발생**: 밀리초 단위로 다수의 알림 이벤트가 동시에 쏟아질 때, React의 렌더링 사이클에 묶여 알림 상태 큐가 꼬이거나 최대 표시 개수 제한을 우회하여 화면에 겹쳐서 렌더링되는 상황이 발생할 수 있습니다.
- **극한의 화면 리사이징 조작**: 사용자가 화면 크기를 쉴 새 없이 조절하는 엣지 케이스에서, 이벤트 디바운스 처리가 없을 경우 메모리 누수로 인해 브라우저 탭이 강제 종료될 가능성이 존재합니다.

---

## TODO

- [ ] `web/src/App.tsx` 내 Toast 렌더링 상태와 `dedupedToastKeysRef` 간의 데이터 동기화 문제 해결 및 큐(Queue) 안정성 확보.
- [ ] `web/src/components/Toast.tsx`의 윈도우 리사이즈 이벤트에 디바운스(Debounce) 또는 쓰로틀(Throttle) 로직 적용 및 마운트/언마운트 시 명확한 클린업 구현.
- [ ] `web/src/styles/app.css`를 수정하여 모바일 뷰포트 기준 알림 확장 시 부드러운 `transition` 및 `max-height` 애니메이션 적용.
- [ ] 전체 소스 코드에서 `dangerouslySetInnerHTML` 사용 내역 확인 및 완전 배제 조치.
- [ ] 여러 개의 알림이 누적되었을 때 사용자 경험을 개선하는 '일괄 닫기(Clear All)' 기능 추가.
- [ ] `web/src/App.test.tsx`에 `jest.useFakeTimers()`를 도입하여 동시성 웹훅 이벤트 유입 시나리오에 대한 단위 테스트 보강.
- [ ] `web/src/components/Toast.test.tsx`에 뷰포트 크기를 모킹하여 모바일 화면에서의 컴포넌트 동작을 검증하는 테스트 추가.
- [ ] 로컬 포트 3100 타겟(`npm run dev -- --port 3100`)으로 Playwright E2E 테스트(`web/tests/e2e/toast-layering.spec.ts`) 시나리오 보강 및 모바일 화면에서의 시각적 회귀 방어 확인.
