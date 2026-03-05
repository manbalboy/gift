## Summary

이 PR은 이슈 #69(워크플로우별 상세 수정·구현 가능 형태로의 전환)의 첫 번째 실행 단계로, **DevFlow Agent Hub 확장 설계서(SPEC)** 의 관측성(Observability) 기반을 강화하기 위해 `SystemAlertWidget` 컴포넌트를 핵심 개선했습니다.

기존 대시보드는 "아무것도 제어할 수 없는 형태"였습니다. 이번 변경으로 사용자가 자동으로 쏟아지는 로그 스트림 속에서 **스스로 속도를 제어하고, 원하는 레벨의 알림만 추려보는 제어권**을 갖게 되어, 워크플로우 각 단계별 실행 상태를 추적·탐색할 수 있는 기반을 마련했습니다.

---

## What Changed

### `SystemAlertWidget.tsx` — 핵심 기능 추가

| 기능 | 설명 |
|---|---|
| **필터 칩(Filter Chip) UI** | `All` / `Error` / `Warning` / `Info` 총 4개의 칩 버튼을 툴바에 추가. 클릭 시 해당 레벨의 알림만 클라이언트 사이드에서 즉시 필터링 |
| **자동 스크롤 일시 정지** | 사용자가 스크롤을 위로 올리면 `isAutoScrollPaused` 플래그를 `true`로 전환, 새 로그 수신 시 강제 최하단 이동 차단. 스크롤이 다시 최하단(오차 ≤ 5px)에 도달하면 자동 복귀 |
| **`info` 레벨 지원** | 기존 `error` / `warning`에 `info` 레벨을 추가. DESIGN_SYSTEM의 `color.status.running(#3B82F6)` 토큰 적용 |
| **성능 최적화** | `onScroll` 이벤트에 Throttle 처리 적용. 필터링 연산에 `useMemo` 적용으로 불필요한 재계산 방지 |
| **Empty State UI** | 필터 결과가 0건인 경우 "해당 조건의 알림이 없습니다" 안내 텍스트 노출 |
| **모바일 반응형** | 320px 뷰포트에서 필터 칩과 액션 버튼([CLR]/[EXP])이 `flex-wrap: wrap`으로 자연스럽게 줄 바꿈, 가로 스크롤바 미발생 |

### `SystemAlertWidget.test.tsx` — 단위 테스트 추가

- 필터 칩 클릭 후 해당 레벨 항목만 렌더링되는지 검증
- `All` 칩 선택 시 전체 목록 복원 검증
- 자동 스크롤 일시 정지 플래그 상태 변화 검증
- 필터 결과 0건 시 Empty State 텍스트 노출 검증

### REVIEW 지적 사항 반영

| 지적 사항 | 반영 내용 |
|---|---|
| 소수점 픽셀 오차 | 스크롤 최하단 판별 시 `Math.ceil()` 적용 |
| 필터 전환 시 스크롤 튀김 | 칩 상태 변경 시 `scrollTop` 을 `0`으로 명시적 초기화 |
| 포트 충돌 가능성 | E2E 테스트 실행 포트 `3100`번대로 고정 |

---

## Test Results

### 컴포넌트 단위 테스트 (React Testing Library)

```
PASS  web/src/components/SystemAlertWidget.test.tsx
  ✓ Error 칩 클릭 시 error 레벨 알림만 노출
  ✓ Warning 칩 클릭 시 warning 레벨 알림만 노출
  ✓ All 칩 클릭 시 전체 알림 목록 복원
  ✓ 필터 결과 0건 시 Empty State 메시지 노출
  ✓ 스크롤 상단 이동 시 isAutoScrollPaused = true 전환
  ✓ 스크롤 최하단 복귀 시 isAutoScrollPaused = false 해제
```

### E2E 테스트 (Playwright, 포트: `http://localhost:3100`)

```
✓ 320px 뷰포트에서 가로 스크롤바 미발생
✓ 필터 칩과 액션 버튼 겹침 미발생
✓ 스크롤 상단 고정 상태에서 신규 로그 삽입 시 scrollTop 위치 유지
✓ 스크롤 최하단 복귀 시 자동 스크롤 재개
```

### Docker Preview

- 컨테이너: `devflow-web`
- 외부 노출 포트: `7000`
- Preview URL: `http://ssh.manbalboy.com:7000`

---

## Risks / Follow-ups

### 잔여 리스크

| 항목 | 내용 | 대응 방향 |
|---|---|---|
| **크로스 브라우저 스크롤** | Windows/Mac OS 스크롤바 유무 차이 및 터치패드 가속도에 따른 Throttle 작동 편차 | 추후 CI에 멀티 브라우저 Playwright 매트릭스 추가 |
| **대량 렌더링 병목** | 수천 개 로그 적재 후 필터 전환 시 메인 스레드 블로킹 가능성 | `useMemo` 적용 완료, Virtual Scroll 도입은 P2로 별도 관리 |
| **백그라운드 탭 동기화** | 비활성 탭에서 대량 로그 Push 후 복귀 시 `isAutoScrollPaused` 상태와 실제 DOM 스크롤 위치 불일치 가능성 | `visibilitychange` 이벤트 핸들러로 재동기화 로직 추가 예정 |
| **민감 정보 마스킹** | 스택 트레이스·API 토큰 등이 마스킹 없이 렌더링될 수 있음 | 데이터 출처(API) 단의 Sanitization 검증 필요 — 별도 이슈로 추적 |

### 후속 작업 (SPEC 로드맵 기준)

- **P0-1**: Workflow Engine v2 (`workflow_id` 기반 그래프 실행 + `ExecutorRegistry` + `node_runs`)
- **P0-2**: Agent SDK v1 (Agent Spec/버전/폴백 + CLI adapter 표준화)
- **P0-3**: Autopilot Control Plane (instruction inbox + cancel/pause/resume)
- **P1**: Artifact Workspace + Visual Workflow Builder (ReactFlow 기반 편집)

---

Closes #69

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
