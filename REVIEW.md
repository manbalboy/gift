# REVIEW

## Functional bugs
- **창 크기 동적 변경 미대응**: `Toast.tsx`의 `isMobileViewport` 판단 로직(`window.matchMedia`)이 컴포넌트 렌더링 시점에 단 한 번만 평가됩니다. 브라우저 창 크기를 데스크톱에서 모바일로 동적으로 조절할 경우, 뷰포트 변경이 실시간으로 감지되지 않아 액션 버튼 표시 여부가 갱신되지 않는 UI 버그가 존재합니다.
- **상태 업데이트 함수 내 Ref 변이**: `App.tsx`의 `enqueueToast` 내부 `setToasts` 상태 업데이트 함수 블록 안에서 `dedupedToastKeysRef.current.delete()`를 직접 호출하고 있습니다. React의 상태 업데이트 함수는 순수 함수(Pure function)로 동작해야 하므로, 이 방식은 동시성 렌더링(Concurrent Rendering) 모드에서 부작용(Side effect)을 발생시키고 큐 관리의 불안정성을 초래할 수 있습니다.

## Security concerns
- **과도한 CORS 허용 정책**: `PLAN.md`에 따라 당장의 수정 범위에서 제외되었으나, `SPEC.md`에 명시된 CORS 도메인 허용 정규식이 지나치게 관대하여 운영 환경에서 보안 취약점이 될 위험이 여전히 남아있습니다.
- **웹훅 페이로드 노출 위험**: 웹훅 파싱 시 에러 내용(`error.detail`)을 가공 없이 `enqueueToast`로 그대로 노출하고 있습니다. 악의적인 웹훅 요청이 스크립트나 중요 시스템 경로를 에러 메시지에 주입하여 반환할 경우, 클라이언트 브라우저 노출 및 로깅 과정에서 2차적인 보안 이슈로 이어질 수 있습니다.

## Missing tests / weak test coverage
- **수동 닫기 이벤트 단위 테스트 누락**: `App.test.tsx`에서 타이머 만료와 큐 밀어내기에 대한 `dedupeKey` 반환 검증은 존재하나, 사용자가 명시적으로 X 버튼을 눌러 `closeToast`를 호출했을 때 `dedupeKey`가 정상적으로 해제되는지를 검증하는 단위 테스트가 부족합니다.
- **Toast 컴포넌트 전용 단위 테스트 부족**: `Toast.tsx` 내부의 `isMobileViewport`에 따른 버튼 렌더링 분기 로직과 `durationMs` 이후 정상적으로 닫기 콜백이 호출되는지를 격리하여 테스트하는 파일(`Toast.test.tsx`)이 구성되지 않았습니다.
- **반응형 리사이즈 E2E 테스트 누락**: 뷰포트 크기를 고정한 상태의 렌더링 검증(`toast-layering.spec.ts`)은 있으나, 실행 중에 창 크기를 조절(예: 로컬 테스트 시 `http://localhost:3100` 접속 후 브라우저 크기 변경)할 때 레이아웃과 버튼 노출 상태가 올바르게 반응하는지를 확인하는 테스트 케이스가 없습니다.

## Edge cases
- **타이머와 큐 밀어내기 Race Condition**: 3개의 Toast가 가득 찬 상태에서, 기존 알림의 타이머 만료 시점(`closeToast` 실행)과 새로운 알림 발생 시점(`enqueueToast`의 `slice(-3)`)이 마이크로초 단위로 겹칠 경우 상태 업데이트가 비동기적으로 경합하여 알림이 누락되거나 의도치 않은 중복 `dedupeKey` 해제가 발생할 수 있습니다.
- **모바일 툴팁 비활성화 한계**: 긴 URL이나 띄어쓰기 없는 에러 메시지가 전달될 경우, `text-overflow: ellipsis`에 의해 잘린 텍스트를 터치 기반 모바일 기기에서는 `title` 속성을 통한 툴팁(Tooltip)으로 확인할 수 없습니다. 상세 에러를 사용자가 온전히 파악하기 어려운 엣지 케이스가 발생합니다.

---

## TODO

- [ ] `Toast.tsx`에 `resize` 이벤트 리스너를 추가하거나, 상위의 `useIsMobilePortrait` 훅을 재사용하여 창 크기 변경에 실시간으로 반응하도록 컴포넌트 수정
- [ ] `App.tsx`의 `setToasts` 상태 업데이트 함수(`prev => next`) 블록 내부에서 수행되는 Ref 변이(`dedupedToastKeysRef.current.delete`) 로직을 `useEffect` 또는 상태 업데이트 블록 외부로 분리하여 React의 순수성 원칙 준수
- [ ] Toast X(닫기) 버튼 클릭 시 `dedupeKey` 해제를 검증하는 `App.test.tsx` 단위 테스트 케이스 추가
- [ ] `Toast.tsx` 컴포넌트의 모바일 뷰포트 분기 및 타이머 닫기 로직을 검증하는 전용 단위 테스트 작성
- [ ] 동일한 식별자로 들어오는 알림과 타이머 기반 닫기 로직 간의 Race Condition 방어를 위한 큐 상태 관리 견고화 작업 (고도화 대비)
- [ ] 모바일 환경 등에서 말줄임 처리된 긴 에러 메시지를 사용자가 직접 확인할 수 있는 대체 UX(클릭 시 모달/확장 등) 고려
- [ ] (보안 백로그) 웹훅 에러 시 클라이언트에 노출되는 메시지 사니타이징(Sanitization) 처리 검토
