## [#67] 초고도화 방안 적용: 실행 엔진 리팩토링, 보안 강화, 테스트 보강

---

## Summary

기존 `workspaces/main` 구현의 구조적 한계를 분석하고, n8n 대비 차별화된 **DevFlow Agent Hub** 플랫폼으로 도약하기 위한 핵심 기반을 구축합니다.

이번 PR은 이슈 #67의 [초장기] 초고도화 목표 전략 중 **MVP 범위(P0~P1)**에 해당하는 항목을 집중 이행합니다.

- **실행 엔진 전환**: UI 조회 의존 방식 → `workflow_id` 기반 백그라운드 워커 비동기 실행
- **엣지 기반 노드 전이**: 배열 순서(Sequence) 무시 구조 → 실제 Edges 조건 참조 전이
- **보안 강화**: Webhook HMAC 서명 검증 적용으로 인가되지 않은 외부 호출 차단
- **자원 안정성**: SSE 채널 누수 방어 및 Graceful Shutdown 로직 보강
- **자동 복구**: 노드 실패 시 백오프 기반 재시도(최대 3회) 엔진 통합

---

## What Changed

### 백엔드 (api)

| 영역 | 변경 내용 |
|---|---|
| **실행 엔진** | `workflow_id` 기반 `ExecutorRegistry` + `RunOrchestrator` 도입. 기존 API 조회 트리거 방식을 백그라운드 워커 중심으로 전환 |
| **노드 전이** | 노드 배열 순서 의존 로직 제거, `edges` 조건(`success` / `failure` / `always`) 기반 전이로 교체. DAG 사이클 검증 포함 |
| **재시도 로직** | 노드 실행 실패 시 `retry_policy`(max\_attempts, backoff) 적용. 지정 횟수 초과 시 `run.status = failed` 처리 |
| **SSE 누수 방어** | 워크플로우 취소 시 활성 SSE 채널 및 워커 스레드를 원자적으로 회수하는 Graceful Shutdown 추가 |
| **Webhook 보안** | `api/app/api/webhooks.py` 에 HMAC 서명 검증 로직 적용. 서명 불일치 요청 401 차단 |

### 프론트엔드 (web)

| 영역 | 변경 내용 |
|---|---|
| **Toast 안정화** | `durationMs` 기본값 방어, `word-break: break-all` 적용, 동시 노출 최대 3개 큐잉 제한 |
| **대용량 아티팩트** | 수십 MB 로그/스크린샷 렌더링 시 Chunk Loading 기법으로 브라우저 프리징 방지 |
| **디자인 시스템 적용** | 다크 테마(`bg.base: #0B1020`), 상태 시맨틱 토큰(성공/진행/대기/실패), Pretendard + JetBrains Mono 이중 타이포 체계 준수 |

### 테스트

| 구분 | 내용 |
|---|---|
| `pytest` 단위/통합 | Webhook HMAC 검증, IP 위조 차단, Human Gate Resume 이행 시나리오 |
| Python 부하 테스트 | 다중 SSE 연결 반복 시 자원 누수 없음 검증 |
| Playwright E2E | `http://localhost:3100` 환경에서 ReactFlow 에디터 노드 순환 참조 방어 및 저장 시나리오 통과 |

---

## Test Results

```
pytest (api)
  ✅ test_webhook_hmac_valid              PASSED
  ✅ test_webhook_hmac_invalid_rejected   PASSED
  ✅ test_human_gate_resume_flow          PASSED
  ✅ test_sse_connection_no_leak          PASSED
  ✅ test_node_backoff_retry_3_attempts   PASSED

Playwright (web - http://localhost:3100)
  ✅ workflow_editor_cyclic_dag_blocked   PASSED
  ✅ workflow_editor_save_valid_flow      PASSED
  ✅ toast_max_3_concurrent              PASSED

Python SSE 부하 테스트
  ✅ 50 클라이언트 연결/강제종료 반복 → 활성 채널 Orphan 0건
```

> Docker Preview 정보
> - 컨테이너: `devflow-api` (port **6000**), `devflow-web` (port **3100**)
> - Preview URL: `http://ssh.manbalboy.com:7000`
> - 포트 범위: 7000-7099 (외부 노출), 6000 (내부 API), 3100 (Web)
> - CORS 허용: `manbalboy.com` 계열, `localhost` 계열

---

## Risks / Follow-ups

### 위험 요소

| 위험 | 영향도 | 대응 |
|---|---|---|
| SSE 이벤트 누락 (백그라운드 전환 과도기) | 중 | 클라이언트 재연결 로직 + run 상태 폴링 병행 보완 |
| 포트 충돌 (`3100`, `6000`) | 하~중 | CI/로컬 환경에서 포트 점유 확인 스크립트 추가 예정 |
| Human Gate 인가 검증 미완 | 중 | 현재 서명 기반 1차 방어 적용, 역할(Role) 기반 인가 검증은 Phase 4 후속 작업으로 분류 |
| 대형 DAG 워크플로우 성능 | 중 | 노드 50개 이상 시나리오는 Phase 1 완료 후 벤치마크 예정 |

### Follow-ups (이후 단계)

- **Phase 2**: Agent SDK v1 — Agent Spec/버전 관리 + CLI 어댑터 표준화
- **Phase 3**: Postgres 이관 — SQLite → Managed Postgres, `node_runs` / `artifacts` 스키마 완성
- **Phase 4**: Human Gate 고도화 — 역할 기반 Approve/Reject 인가 + Approval Inbox UI
- **Phase 5**: Visual Workflow Builder — ReactFlow 편집기 + dry-run 프리뷰 실행
- **Phase 6**: Dev Integrations 확장 — PR/CI/Deploy 이벤트 버스 연동

---

Closes #67
