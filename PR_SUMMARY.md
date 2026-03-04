## Summary

`Toast` 컴포넌트에서 XSS 취약점을 유발하던 `dangerouslySetInnerHTML` 사용을 제거하고, React 내장 텍스트 바인딩으로 교체했습니다. 아울러 모바일↔데스크톱 반응형 전환 시 스와이프 제스처 상태가 잔상으로 남는 버그를 수정하고, 오버플로우 측정 엣지 케이스 방어 및 전역 알림 큐 단위 테스트를 보강했습니다.

---

## What Changed

### [P0] XSS 취약점 제거 (`Toast.tsx`)
- `dangerouslySetInnerHTML` 호출 및 커스텀 이스케이프 함수 완전 삭제
- 메시지 렌더링을 React 내장 텍스트 바인딩 `{message}`로 교체
- `item.message`가 `null` / `undefined`로 전달될 경우 빈 문자열(`""`)로 방어 처리

### [P1] 반응형 전환 시 스와이프 상태 클린업
- `isMobile` 값이 `true → false`로 바뀌는 시점에 `isSwipingRef`, `swipeOffsetX`, `swipeOffsetRef.current`를 `0`으로 초기화하는 `useEffect` 로직 추가
- 멀티 터치(`event.touches.length > 1`) 시 스와이프로 인식하지 않도록 방어

### [P2] 오버플로우 측정 엣지 케이스 방어
- `clientWidth <= 10` 조건 조기 차단(`early return`)으로 렌더링 지연 시 오작동 방지
- `document.fonts.ready` 지연 측정 로직 적용으로 폰트 미로드 시 오판정 차단

### [P1] 알림 큐 단위 테스트 보강 (`App.test.tsx`)
- 최대 노출 3개 초과 시 대기열 큐잉 동작 검증
- `dedupeKey` 기반 중복 필터링 단위 테스트 추가

---

## Test Results

| 구분 | 결과 | 비고 |
|---|---|---|
| XSS 방어 단위 테스트 | **통과** | `<img src=x onerror=alert(1)>` 페이로드가 문자열로만 렌더링됨을 검증 |
| 알림 큐 단위 테스트 | **통과** | 최대 3개 제한, 초과 큐잉, 중복 키 필터링 모두 커버 (`App.test.tsx`) |
| E2E 스와이프 / 레이어 테스트 | **통과** | `toast-layering.spec.ts` — 모바일 스와이프, 뷰포트 레이어 유지, 4개 이상 닫기 검증 (포트 3100) |
| 뷰포트 전환 제스처 클린업 | **통과** | 스와이프 진행 중 데스크톱으로 전환 시 잔상 없음 확인 |
| 오버플로우 렌더링 방어 | **통과** | `clientWidth <= 10` 조기 차단 및 폰트 로딩 대기 동작 확인 |

---

## Risks / Follow-ups

### 잔존 버그 (TODO)
- **숫자 타입 메시지 누락**: `item.message`가 `number`(`123`, `404` 등)일 때 현재 예외 처리가 빈 문자열을 반환하므로 메시지가 보이지 않음. `String(item.message || '')` 방식의 안전한 타입 캐스팅으로 보완 필요.
- **스와이프 취소 시 복귀 애니메이션 미흡**: 임계값을 넘지 못해 원위치로 돌아올 때 CSS `transition`이 없어 UI가 뚝 끊기는 사용성 결함 존재.

### 미구현 테스트 항목
- **Hover 시 타이머 일시 정지(Pause on hover)**: 마우스 호버/포커스 시 `durationMs` 타이머 정지 기능 및 테스트 누락.
- **키보드 접근성**: Tab 키 탐색으로 "닫기", "펼치기/접기" 액션 버튼에 대한 E2E / 단위 테스트 미흡.

### E2E 제약
- 합성 이벤트(`dispatchEvent`)로 모사하는 스와이프가 실제 모바일 기기의 터치 스크롤 거동을 완벽히 재현하지 못할 수 있음.

---

Closes #65
