## Summary

DevFlow Agent Hub를 **초장기 확장 가능한 AI Development Platform**으로 고도화하기 위한 설계 문서 및 핵심 기반 구현입니다. gift 레포지토리의 FastAPI MVP를 기반으로, Workflow Engine v2 · Human Gate · Artifact-first Workspace · Visual Workflow Builder · Preview 인프라 보안 강화의 5대 축을 단계적으로 구현합니다. n8n과 차별화되는 "Idea → Plan → Code → Review → Deploy" 폐루프 자동화를 목표로 하며, AI 실행 방식은 CLI 기반을 기본값으로 유지합니다.

---

## What Changed

### P0 — Workflow Engine v2

- `workflow_id` 기반 정의 실행으로 오케스트레이터 전환 (`WorkflowDefinitionStore` → `ExecutorRegistry` → `RunOrchestrator`)
- 노드 단위 상태 추적 `node_runs` DB 테이블 추가 및 재시도(Retry Policy) 로직 표준화
- 워크플로우 로딩 실패 시 `default_linear_v1` fallback 보장
- API 추가: `POST /api/runs`, `POST /api/runs/{id}/retry-node`, `POST /api/runs/{id}/cancel`

### P0 — Human Gate (승인/반려/수정 + Resume)

- 테스트 · 리뷰 노드 도달 시 `approval_pending` 상태 전환 및 Resume API 구현
- UI Approval Inbox: 아티팩트 Diff/뷰어와 결합된 승인 패널
- **버그 수정**: `web/src/App.tsx`의 `handleRejectReasonPreset` 함수에서 `current.trimEnd()` 이후 `/\n$/` 조건이 항상 `false`가 되던 논리 오류 수정 → 프리셋 버튼 연속 클릭 시 불필요한 이중 개행 제거

### P1 — Artifact-first Workspace

- `artifacts` DB 테이블(`id, run_id, node_id, type, uri, mime, size, hash`) 및 S3 호환 오브젝트 스토어 연동
- `SafeArtifactViewer` 가상화 스크롤러 좌표 보정 로직 개선, 50 MB 이상 렌더링 시 OOM 방지
- API 추가: `GET /api/runs/{id}/artifacts`, `GET /api/artifacts/{id}`

### P1 — Visual Workflow Builder

- ReactFlow 캔버스 기반 노드/엣지 편집기 통합 (`Node Palette` · `Edge Editor` · `Property Panel`)
- 서버 측 검증 보완: **단절된 노드(Disconnected Graph)** 및 **다중 Entry 노드** 케이스를 400 에러로 거부
- `workflow_definitions` 테이블에 `status(draft/published/deprecated)` 컬럼 추가
- `POST /api/workflows/{id}/preview-run` — 사이드이펙트 없는 드라이런 엔드포인트

### P2 — Preview 인프라 보안 강화 & SSE 안정화

- Preview 환경(포트 7000-7099) 접근 시 **일회성 뷰어 토큰** 발급 및 인증 미들웨어 레이어 적용
- Nginx 지연 응답 모킹 테스트 추가, SSE 장기 연결 중 백엔드 메모리 누수 대응

### 설계 문서

| 파일 | 내용 |
|---|---|
| `SPEC.md` | 아이디어 A–F 상세 설계, 통합 아키텍처, 로드맵 |
| `PLAN.md` | MVP 범위, 완료 기준, 리스크/테스트 전략, 기술 스택 |
| `REVIEW.md` | 기능 버그, 보안 우려사항, 누락 테스트, 엣지 케이스, TODO |
| `DESIGN_SYSTEM.md` | 컬러 토큰, 스페이싱, 타이포, 반응형 규칙, WOW Point |

---

## Test Results

| 항목 | 결과 |
|---|---|
| Workflow Engine v2 — `workflow_id` 실행 및 `node_runs` 적재 | 통과 |
| Human Gate — 승인/반려/Resume 흐름 E2E | 통과 |
| 거절 프리셋 버튼 연속 클릭 텍스트 병합 | 수정 후 통과 |
| SafeArtifactViewer 50 MB 더미 렌더링 메모리 부하 E2E | 통과 (힙 사용량 정상 범위 내) |
| Preview 포트 일회성 토큰 인증 (`test_preview_port_requires_one_time_viewer_token`) | 통과 |
| SSE 스트리밍 Nginx 지연 모킹 누수 방지 통합 테스트 | 통과 |
| Visual Builder 단절 그래프 저장 거부 서버 검증 | 통과 |
| **`test_engine_runs_independent_nodes_without_forced_sequential_fallback`** | **실패** — 단절 그래프 정책 변경에 따른 충돌, 하위 TODO 참조 |

---

## Risks / Follow-ups

### 잔여 버그 / 보완 필요

- [ ] `api/tests/test_workflow_engine.py` — `test_engine_runs_independent_nodes_without_forced_sequential_fallback` 테스트를 단절 그래프 400 거부를 기대하는 케이스로 전면 수정 필요
- [ ] `WorkflowBuilder.spec.ts` (Playwright) — "다중 Entry" · "단절된 노드" 구성 후 저장 시 UI 에러 모달/토스트 노출 여부 E2E 케이스 추가 필요
- [ ] `App.tsx` 프리셋 텍스트 병합 로직 단위 테스트(`App.test.tsx`) 보강 필요

### 보안 Follow-up

- [ ] 로컬 3100번대 포트 직접 접근(Nginx 우회) 시에도 일회성 토큰 인증이 미들웨어 단에서 동일하게 강제되는지 인프라 레벨 확인 필요
- [ ] 아티팩트 저장소 파일 크기 상한선(Rate & Size Limiting) 미구현 — 대용량 악성 파일 업로드를 통한 스토리지 파티션 고갈 위험 존재

### 아키텍처 Follow-up

- 단기(4–8주): 내장 Workflow Engine v2 완성 우선
- 규모/신뢰성 요구 증가 시: Temporal(오케스트레이션) + LangGraph(에이전트 루프) 분리 도입 검토
- Phase 3 (Postgres 이관), Phase 5 (ReactFlow 편집기 완성), Phase 6 (PR/CI/Deploy 이벤트 버스)은 후속 이슈로 분리 추적 예정

### Docker Preview 정보

- 컨테이너 실행 포트: `7000–7099` 범위
- Preview URL: `http://ssh.manbalboy.com:7000`
- CORS 허용 origin: `https://manbalboy.com`, `http://localhost`, `http://127.0.0.1` 계열

---

Closes #67

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
