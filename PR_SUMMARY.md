## Summary

DevFlow Agent Hub의 워크플로우 실행 중 사용자에게 상태를 전달하는 Toast 알림 시스템의 치명적 버그 2건을 수정하고, 테스트 커버리지를 강화했습니다.

- `enqueueToast`에서 큐가 3개를 초과할 때 밀려난 항목의 `dedupeKey`가 해제되지 않아 동일한 알림이 재표시되지 않는 누수 버그 수정
- 모바일(좁은 뷰포트) 환경에서 `mobile-blocker`와 Toast 액션 버튼이 충돌하고, 긴 메시지가 뷰포트를 이탈하는 UI 오버플로우 문제 해결

## What Changed

### `web/src/App.tsx`
- `enqueueToast` 내 `slice(-3)` 처리 시, 새 배열에 포함되지 못한 이전 항목들의 `dedupeKey`를 `dedupedToastKeysRef`에서 명시적으로 `delete`하는 로직 추가
- 큐 오버플로우 시 발생하던 메모리 누수 및 알림 무시 현상 방지

### `web/src/components/Toast.tsx`
- 모바일 뷰포트 감지 시 `'노드로 이동'` 등의 액션 버튼 렌더링을 제한(숨김 처리)
- `mobile-blocker` 활성 구간에서의 의도치 않은 상호작용 충돌 제거

### `web/src/styles/app.css`
- `sm` 브레이크포인트(`0~767px`) 미디어 쿼리에 `text-overflow: ellipsis` 및 `overflow: hidden` 적용
- 긴 Toast 메시지가 레이아웃을 이탈하지 않고 말줄임(`...`) 처리되도록 수정
- 디자인 시스템의 모바일 좌우 안전 여백(`16px`) 기준 준수

### `web/src/App.test.tsx` (신규)
- 모의 타이머(Fake Timers)를 활용한 단위 테스트 작성
- Toast 최대 3개 유지 검증 및 밀려난 항목의 `dedupeKey` 정상 해제 확인

### `web/tests/e2e/toast-layering.spec.ts`
- 모바일 뷰포트 크기(`375px`) 시뮬레이션 후 강제 오류 알림 발생
- Toast `z-index`가 오버레이보다 항상 상단에 위치하는지 E2E 검증 보강

## Test Results

| 테스트 항목 | 결과 |
|---|---|
| Toast 4회 연속 호출 시 첫 번째 항목 `dedupeKey` 해제 | ✅ 통과 |
| 큐에 최대 3개 이하만 유지되는지 검증 | ✅ 통과 |
| 모바일 뷰포트에서 액션 버튼 숨김 처리 | ✅ 통과 |
| 긴 메시지 `text-overflow: ellipsis` 렌더링 | ✅ 통과 |
| Toast `z-index` 최상단 렌더링 E2E | ✅ 통과 |

**Docker Preview 정보**
- 컨테이너 포트: `7000-7099` 범위
- Preview URL: `http://ssh.manbalboy.com:7000`
- 실행 방법: `docker compose up` 후 상기 URL에서 확인

## Risks / Follow-ups

### 잠재적 위험

- **Race Condition (저위험)**: `setTimeout` 기반 `closeToast` 타이머 만료 시점과 `slice(-3)` 큐 정리 시점이 겹칠 경우 잠재적 상태 업데이트 충돌 가능성 존재. 현재 MVP 범위에서는 발생 빈도가 낮으나 모니터링 필요.
- **CSS 브레이크포인트 불일치 (저위험)**: 디자인 시스템 `sm: 0~767px` 기준과 `mobile-blocker` 활성화 해상도가 특정 태블릿/분할 화면 환경에서 완벽히 일치하지 않을 수 있음. 예외 해상도 추가 검증 권장.
- **CORS 허용 도메인 정책 (별도 트래킹 필요)**: `manbalboy.com` 서브도메인 전체 허용 정책은 악의적 서브도메인 탈취에 취약할 수 있음. 본 PR 범위(Out-of-scope)에서는 제외되었으나 배포 전 별도 강화 필요.

### Follow-up 항목

- [ ] `slice(-3)` + `setTimeout` 경쟁 조건에 대한 방어 로직 보강 (다음 이터레이션)
- [ ] CORS 허용 정규식을 더 엄격한 패턴으로 교체 (보안 이슈로 별도 트래킹)
- [ ] React Flow 기반 Visual Workflow Builder 구현 (Marketplace P1 로드맵 연계)

---

Closes #65
