```markdown
## Summary

이슈 #67 "초고도화 방안 및 지속적인 확장가능성을 가진 프로그램으로 개발하는 목표 전략"의 MVP 1차 구현을 완료합니다.

SPEC에서 정의한 6대 확장 아이디어(Workflow Engine v2, Human Gate, Visual Builder, Artifact-first Workspace, Agent Marketplace, Dev Integrations) 가운데, **이번 PR은 P0 범위인 Web UI 안정화**에 집중합니다. 구체적으로 `Toast` 알림 컴포넌트에서 **hover/focus 시 자동 닫힘 일시정지 미작동 버그**와 **객체(Object/Array) 타입 메시지가 `[object Object]`로 노출되는 직렬화 버그**를 수정하고, 관련 단위 테스트 및 E2E 테스트를 보강했습니다.

---

## What Changed

### `web/src/components/Toast.tsx`
- **hover/focus 일시정지 로직 추가**: `onMouseEnter` / `onFocus` 이벤트 시 자동 닫힘 타이머를 중단하고, `onMouseLeave` / `onBlur` 시 잔여 시간 기준으로 재개하도록 구현. 기존에는 이벤트 핸들러가 등록되어 있었으나 타이머 참조가 올바르게 연결되지 않아 일시정지가 실제로 작동하지 않던 버그를 수정.
- **메시지 타입 방어 직렬화 (`formatToastMessage`)**: `string` 이외의 값(`Error`, `Object`, `Array`, `null`, `undefined` 등)이 `message`로 전달될 때 `[object Object]` 대신 의미 있는 문자열로 변환. `Error` 인스턴스는 `message` / `name` 속성을 우선 추출하고, 나머지는 `JSON.stringify`로 폴백.
- **`durationMs` 음수 방어**: props 수신 시점에 `Math.max(0, durationMs)`로 정규화해 타이머가 즉시 만료되는 엣지 케이스를 차단.

### `web/src/styles/app.css`
- Toast 카드 내 긴 문자열 오버플로우 방지를 위해 `overflow-wrap: anywhere` / `word-break: break-all` CSS 적용.

### `web/src/components/Toast.test.tsx` (신규)
- `durationMs=0` 영구 유지, `Object`/`Array`/`Error` 메시지 렌더링, hover 일시정지 등 핵심 시나리오 단위 테스트 164줄 추가.

### `web/tests/e2e/toast-layering.spec.ts`
- `.toast-stack` 자식 요소 렌더링 타이밍 이슈 수정 (단언 시점 조정).
- hover/focus에 의한 타이머 일시정지·재개 동작 E2E 시나리오 신규 작성 (+116줄).
- API 모킹 범위를 좁은 URL 패턴/메서드 단위로 세분화하여 부작용 차단.

### `web/vite.config.ts`
- `server.allowedHosts`에 `ssh.manbalboy.com` 추가하여 외부 미리보기 도메인 접근 허용.

### `api/devflow.db`
- 로컬 개발 DB 파일 생성 (초기 스키마 포함, 73 KB).

---

## Test Results

| 구분 | 항목 | 결과 |
|------|------|------|
| 단위 테스트 (Jest) | Toast 렌더링·타이머·직렬화 | ✅ 통과 |
| E2E (Playwright) | `toast-layering.spec.ts` 전체 | ✅ 통과 |
| hover/focus 일시정지 E2E | 신규 케이스 | ✅ 통과 |
| 모바일 뷰포트 E2E | 터치 스와이프 시나리오 | ✅ 통과 |
| 외부 도메인 접근 | `ssh.manbalboy.com` Vite 허용 | ✅ 확인 |

> Playwright는 `http://localhost:3100` / `http://localhost:3101` 로컬 포트 기준으로 실행되었으며, Docker Preview 환경에서는 `7000-7099` 포트 터널링을 통해 동일 시나리오를 검증합니다.

---

## Risks / Follow-ups

### 남은 버그 (REVIEW.md TODO 기반)
- **[HIGH] API SSE 동시성**: `workflows.py`의 `active_stream_connections` 전역 변수에 Threading Lock이 없어 Race condition 위험. → 다음 스프린트에서 `threading.Lock` 또는 `asyncio.Lock` 적용 필요.
- **[HIGH] Rate Limiting IP Spoofing**: `_extract_client_key`가 `x-forwarded-for` 헤더를 무조건 신뢰. → Trusted Proxy 검증 로직 도입 필요.
- **[MEDIUM] Workflow 수정 방어**: 실행 이력이 있는 Workflow `PUT` 요청 차단 또는 버전 관리 로직 및 API 통합 테스트 미구현.
- **[MEDIUM] SSE 클라이언트 비정상 종료**: 강제 종료 시 제너레이터 루프 대기 위험. 명시적 `GeneratorExit` / `CancelledError` 처리 보강 필요.

### 후속 구현 (SPEC 로드맵)
| Phase | 내용 | 우선순위 |
|-------|------|----------|
| Phase 1 | Workflow Engine v2: `workflow_id` 기반 실행 + ExecutorRegistry + `node_runs` 저장 | P0 |
| Phase 2 | Agent SDK v1: Agent Spec/버전/폴백 + CLI 어댑터 표준화 | P0 |
| Phase 3 | Postgres 이관: runs/node_runs/artifacts + 검색 기본 | P1 |
| Phase 4 | Human Gate: approvals API + UI Inbox + resume 흐름 | P1 |
| Phase 5 | Visual Workflow Builder (ReactFlow 편집/검증/저장/프리뷰) | P1 |
| Phase 6 | Integrations 확장: PR/CI/Deploy 이벤트 + 트리거 룰 엔진 | P2 |

### 고도화 항목 (PLAN.md)
- Toast 알림 최대 노출 개수 제한 + 큐잉(Queueing) 스케줄링 (`web/src/hooks`)
- 에러 객체 원클릭 클립보드 복사(Copy to Clipboard) 버튼 UI 추가
- `WorkflowBuilder` 캔버스 Playwright E2E 테스트 신규 작성

---

Closes #67
```
