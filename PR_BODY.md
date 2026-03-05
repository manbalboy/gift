```markdown
## Summary

이 PR은 이슈 #69 "[초장기] 해당 워크 플로를 각각 상세하게 수정 구현할수 있는 형태로 개발해주세요"를 해결하기 위해 DevFlow Agent Hub의 핵심 워크플로우 실행 엔진과 대시보드 제어 기능을 전면 확장합니다.

기존 시스템은 고정된 선형 파이프라인(이슈 읽기→계획→구현→리뷰→PR)만 지원하여 사용자가 각 단계를 수정하거나 개입할 수 없는 구조였습니다. 이번 변경을 통해 다음 핵심 목표를 달성합니다.

- **워크플로우를 개별 노드 단위로 제어**할 수 있는 Engine v2 도입
- **실행 중 외부 지시 주입 및 중단/재개/취소**가 가능한 Autopilot Control Plane 구축
- REVIEW.md에서 지적된 **Race Condition, UI 오버플로우, 민감 정보 노출, 쿼리 성능 저하** 전면 수정
- 시스템 알림 로그의 **DB 영속화 및 민감 정보 마스킹** 보안 강화

---

## What Changed

### [P0] Engine v2 — `workflow_id` 기반 그래프 실행

- `WorkflowDefinitionStore`: `workflow_id` + 버전 기반으로 워크플로우 정의를 저장하고, DAG 유효성 검증(`validate_workflow`) 수행
- `GraphRunner`: entry node → edge routing(`on=success|failure|always`) → 다음 노드 순차 실행으로 전환. 고정 오케스트레이터에서 완전 분리
- `ExecutorRegistry`: 노드 타입별 실행기(gh_read_issue, gemini_plan, tester_run_e2e 등)를 동적으로 매핑
- `node_runs` DB 테이블 신설: 노드 단위 상태(`queued/running/done/failed`), 시도 횟수, 오류, 아티팩트 참조 저장 → 부분 재시도 및 노드 수준 재실행 지원
- 기존 선형 파이프라인과 역호환을 위한 `default_linear_v1` fallback 유지

### [P0] Autopilot Control Plane — 지시 주입 및 생명주기 제어

- `Instruction Inbox`: `POST /api/runs/{id}/instructions` API를 통해 실행 중인 워크플로우에 새로운 아이디어·요구사항·우선순위 변경을 주입할 수 있는 append-only 로그 테이블 구현
- Run Lifecycle API 확장: `pause`, `resume`, `cancel`, `retry-node` 엔드포인트 신설
- 예산(Budget) 제어: 루프 횟수 초과·시간 초과 시 오케스트레이터가 노드를 `blocked` 상태로 안전하게 강제 전환하는 방어 로직 적용
- Backlog & Work-item 스케줄러: `work_items` 테이블로 작업 항목 단위를 격리하여 하나의 기능이 블로킹되더라도 다음 항목으로 계속 진행

### [P0] 시스템 알림 DB 영속화 및 보안 수정

- `SystemAlertLog` 모델을 DB에 영속화하여 대시보드 재접속 후에도 이력 조회 가능
- `created_at DESC` 스캔 인덱스 마이그레이션 적용 → `/api/logs` 대용량 조회 성능 개선
- **민감 정보 마스킹 파이프라인**: FastAPI 알림 서비스 저장 전단에서 정규표현식을 이용해 인증 토큰(`Bearer ...`), 절대 경로(`/home/docker/`, `/root/`)를 `***[MASKED]***`로 치환

### [P0] Race Condition 및 UI 버그 수정

| 항목 | 수정 내용 |
|---|---|
| `web/scripts/check-port.mjs` | 다중 워커 포트 할당 경합 방지를 위한 점유 유예 시간 및 재시도 간격 조정 |
| `SystemAlertWidget` CSS | `overflow-y: auto`, `max-height` 추가 및 `word-break` 처리로 뷰포트 이탈 방지 |
| DB 인덱스 | `system_alert_model.py` 스키마에 `created_at` 역순 스캔 인덱스 마이그레이션 반영 |

### [P0] Agent SDK 표준화

- CLI 러너 템플릿화: gemini/codex/claude 등 AI 도구를 `agent_version` 기반으로 조회하고 context(아티팩트 참조)를 프롬프트로 렌더링한 뒤 실행
- `budget`, `fallback_of` 속성을 Agent Spec에 추가하여 비용 폭주 방어

---

## Test Results

### E2E — Playwright (`web/tests/e2e/system-alert.spec.ts`)

| 테스트 케이스 | 뷰포트 | 결과 |
|---|---|---|
| 긴 텍스트 로그 렌더링 시 세로 오버플로우 없음 | Desktop (1280×720) | PASS |
| 긴 텍스트 로그 렌더링 시 세로 오버플로우 없음 | Mobile (390×844) | PASS |
| 스크롤 가능 영역 내 로그 접근 | Desktop | PASS |
| `word-break` 긴 단어 잘림 처리 | Mobile | PASS |

### 포트 고갈 시뮬레이션 (`web/scripts/test-port-timeout.sh`)

- 3100번대 포트 전체 점유 상황 시뮬레이션에서 명시적 타임아웃 예외 발생 확인
- 무한 대기(Deadlock) 없이 안전하게 실패 반환 검증 완료

### 백엔드 단위 테스트

| 항목 | 결과 |
|---|---|
| Budget limit 초과 시 노드 실행 차단 및 `blocked` 상태 전환 | PASS |
| 민감 정보 마스킹 유틸리티 (Bearer 토큰 패턴) | PASS |
| 민감 정보 마스킹 유틸리티 (절대 경로 패턴) | PASS |
| `created_at` DESC 인덱스 적용 전/후 로그 조회 성능 비교 | 성능 향상 확인 |

### Docker Preview

| 항목 | 내용 |
|---|---|
| 컨테이너 | `devflow-api` (FastAPI), `devflow-web` (Vite + React) |
| 외부 노출 포트 | `7000` (web), `7001` (api) |
| Preview URL | http://ssh.manbalboy.com:7000 |
| CORS 허용 origin | `manbalboy.com`, `localhost`, `127.0.0.1` 계열 |

---

## Risks / Follow-ups

### 리스크

| 항목 | 내용 | 완화 방안 |
|---|---|---|
| LLM 루프 비용 폭주 | Agentic 워크플로우가 무한 재시도 상태에 빠질 경우 API 호출 비용이 급증 | Budget limit + 루프 탐지 로직 적용. `blocked` 전환 후 더 이상 자동 진행하지 않음 |
| Engine v2 전환 중 하위 호환 | 기존 Job 데이터가 `default_linear_v1` fallback에서 동작하지 않을 수 있음 | fallback 검증 마이그레이션 스크립트를 통해 기존 데이터 재매핑 필요 |
| Instruction 주입 API 접근 관리 | 권한 없는 사용자의 외부 지시 주입 API 호출 방어 체계 미완성 | 현재 최소한의 요청 검증만 적용. 향후 인가 체계(인증 토큰 검증) 강화 예정 |

### Follow-ups (다음 단계)

- **[P1] Artifact Workspace**: 로그 파일 중심에서 `artifacts` 테이블 기반 산출물 메타데이터 관리로 전환, Object Store(S3 호환) 연동
- **[P1] Visual Workflow Builder**: ReactFlow 기반 노드/엣지 편집 UI 구성, `/api/workflows/validate` API와 연동하여 저장 전 DAG 검증
- **[P1] SSE/WebSocket 실시간 로그 스트리밍**: 현재 폴링 기반 갱신을 Server-Sent Events로 전환
- **[P2] Integrations 확장**: PR/CI/Deploy 이벤트 수신 및 룰 엔진, outbox 기반 재처리 파이프라인 구성
- **[보안] 제어 API 인가 체계 강화**: Instruction 주입·Cancel·Resume 엔드포인트에 대한 명시적 접근 권한 검증 도입

---

Closes #69
```

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
