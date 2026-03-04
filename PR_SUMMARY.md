## Summary

Issue #65 "오픈소스의 왕이 될 프로그램" 개발 과정에서 발견된 Toast 알림 컴포넌트의 핵심 버그(상태 동기화 불일치, 메모리 누수, 모바일 레이아웃 점핑)를 수정하고, XSS 취약점을 원천 차단하며, 테스트 커버리지를 대폭 보강합니다. 또한 사용자 경험 개선을 위한 일괄 닫기(Clear All) 기능을 추가합니다.

---

## What Changed

### [P0] 버그 픽스 및 보안 강화

- **`web/src/App.tsx`** — Toast 렌더링 사이클과 `dedupedToastKeysRef` 간 데이터 동기화 불일치 해결. 알림 최대 개수(3개) 초과 시 큐(Queue) 로직 안정성 확보.
- **`web/src/components/Toast.tsx`** — 윈도우 리사이즈 이벤트에 디바운스(Debounce) 처리 적용. 컴포넌트 언마운트 시 리스너 클린업 명확화로 메모리 누수 차단.
- **XSS 차단** — 앱 전체에서 `dangerouslySetInnerHTML` 사용 내역 전수 검사 및 완전 배제. 외부 웹훅 데이터의 렌더링 무결성 확보.

### [P1] UI/UX 개선

- **`web/src/styles/app.css`** — 모바일 뷰포트(767px 이하)에서 알림 확장(Expand) 탭 터치 시 `max-height` + `transition` 애니메이션을 적용하여 레이아웃 점핑 현상 제거.

### [P2] 테스트 커버리지 확보

- **`web/src/App.test.tsx`** — `jest.useFakeTimers()`를 활용한 동시성 웹훅 이벤트 유입 시나리오 및 `dedupeKey` 상태 경합(Race Condition) 방어 단위 테스트 보강.
- **`web/src/components/Toast.test.tsx`** — 뷰포트 크기 모킹을 통한 모바일 화면 텍스트 말줄임 조건 및 렌더링 분기 단위 테스트 추가.
- **`web/tests/e2e/toast-layering.spec.ts`** — Playwright 기반 동적 브라우저 리사이징 및 모바일 화면 전환 시 시각적 반응성 E2E 시나리오 보강(타겟: 포트 3100).

### [P3] 기능 추가

- **일괄 닫기(Clear All)** — 복수 알림 누적 시 한 번에 닫는 UI 요소 및 상태 로직 추가 (`App.tsx`, `Toast.tsx`).

### Docker Preview 정보

| 항목 | 값 |
|---|---|
| 컨테이너 포트 | `3100` |
| 외부 노출 포트 | `7000` (7000-7099 범위) |
| Preview URL | `http://ssh.manbalboy.com:7000` |

---

## Test Results

| 테스트 종류 | 파일 | 결과 |
|---|---|---|
| 단위 테스트 (Jest) | `App.test.tsx` | ✅ 통과 — 동시성 이벤트·dedupeKey 경합 시나리오 포함 |
| 단위 테스트 (Jest) | `Toast.test.tsx` | ✅ 통과 — 모바일 뷰포트 모킹 분기 포함 |
| E2E 테스트 (Playwright) | `toast-layering.spec.ts` | ✅ 통과 — 데스크톱/모바일 리사이징 시나리오 (포트 3100) |
| 보안 검사 | 전체 소스 | ✅ `dangerouslySetInnerHTML` 미사용 확인 |
| 메모리 누수 | `Toast.tsx` | ✅ 리사이즈 리스너 클린업 확인 |

**전체 테스트 기준**: `npm run dev -- --port 3100` 환경에서 Jest + Playwright 모두 정상 통과.

---

## Risks / Follow-ups

### 잔존 위험

- **Flaky E2E 가능성**: 렌더링 지연 또는 모바일 뷰포트 전환 타이밍에 따라 Playwright 테스트가 간헐적으로 불안정해질 수 있음. → CI 재시도 정책(최대 2회) 적용 권장.
- **고속 다중 알림 엣지케이스**: 밀리초 단위 이벤트 폭주 시 React 배치 렌더링 경계에서 큐 상태가 꼬이는 재발 가능성이 낮게 남아 있음. → 통합 모니터링에서 지속 관찰 필요.

### 후속 작업 (Out-of-scope, 다음 이슈에서 처리)

- `Info` / `Success` 등 새로운 알림 레벨 추가
- 백엔드 FastAPI 워크플로우 엔진 및 에이전트 마켓플레이스 영역 개선
- DESIGN_SYSTEM의 `Live Run Constellation` 대시보드 미니맵 구현 (WOW Point)
- Toast 외 대시보드 UI/UX 전면 개편

---

Closes #65
