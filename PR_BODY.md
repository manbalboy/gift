```markdown
## Summary

이슈 #67 "[초장기] 초고도화 방안 및 지속적인 확장가능성을 가진 프로그램으로 개발하는 목표 전략"의 실행 1단계로, REVIEW.md에서 식별된 기능 버그·보안 취약점·테스트 공백을 해소하여 Workflow Engine v2 기반의 **신뢰 가능한 실행 환경**을 구축합니다.

- **SSE Zombie Connection 방어**: 워크플로우 강제 취소 시 스트림 연결 풀이 즉각 해제되도록 개선
- **웹훅 HMAC 서명 검증**: `workflow_id` Silent Fail 제거 및 위변조 방지 레이어 추가 (HTTP 422 명시 반환)
- **엣지 기반 노드 전이 + 백오프 재시도**: DAG Fallback 오류를 수정하여 독립 노드 병렬 실행 및 지수 백오프(Exponential Backoff) 재시도 정책 적용
- **Human Gate E2E 테스트 + 백엔드 테스트 보강**: Playwright 시나리오 및 pytest 커버리지 추가

---

## What Changed

### Backend (`api/`)

| 파일 | 변경 내용 |
|---|---|
| `api/app/api/webhooks.py` | HMAC-SHA256 서명 검증 로직 추가, 잘못된 `workflow_id` 수신 시 HTTP 422 반환, Pydantic 스키마 연동 |
| `api/app/api/workflows.py` | SSE 엔드포인트에 `asyncio` 취소 감지 및 연결 풀 즉시 해제 로직 추가 |
| `api/app/services/workflow_engine.py` | `_build_predecessors` 엣지 기반 전이로 교체, 독립 노드 병렬 실행 허용, node별 `retry_policy`(max\_attempts + exponential backoff) 적용 |
| `api/app/core/config.py` | `WEBHOOK_SECRET`, `MAX_RETRY_ATTEMPTS`, `RETRY_BACKOFF_BASE` 환경 변수 항목 추가 |
| `api/app/schemas/webhook.py` | `WebhookPayload` Pydantic 모델 신규 작성 |
| `api/app/schemas/workflow.py` | `NodeRunStatus`, `RetryPolicy` 스키마 필드 추가 |
| `api/app/main.py` | 시작 시 설정 검증 및 SSE 연결 풀 초기화 추가 |

### Tests – Backend (`api/tests/`)

| 파일 | 변경 내용 |
|---|---|
| `test_webhooks_api.py` | HMAC 서명 유효/무효 케이스, 잘못된 `workflow_id` 422 응답 검증 테스트 추가 |
| `test_workflow_api.py` | SSE 연결 해제 후 Zombie Connection 잔류 여부 확인 테스트 추가 |
| `test_workflow_engine.py` | DAG 엣지 전이, 독립 노드 병렬 실행, 백오프 재시도 단위 테스트 35개 추가 |
| `test_health.py` | 헬스체크 엔드포인트 커버리지 보강 |

### Frontend (`web/`)

| 파일 | 변경 내용 |
|---|---|
| `web/tests/e2e/human-gate.spec.ts` | Human Gate Pending → 승인/반려 → Resume 전체 플로우 Playwright E2E 시나리오 (173 lines) |
| `web/src/App.tsx` | SSE 재연결 로직 및 취소 이벤트 핸들러 개선 |
| `web/src/components/Dashboard.tsx` | Human Gate 대기 상태 표시 UI 및 승인/반려 버튼 렌더링 추가 |
| `web/src/services/api.ts` | 웹훅 서명 헤더(`X-Hub-Signature-256`) 전송 유틸 추가 |
| `web/src/types/index.ts` | `NodeRunStatus`, `ApprovalState` 타입 정의 추가 |
| `web/src/styles/app.css` | Human Gate `approval_pending` 상태 컬러(`#A78BFA`) 및 카드 스타일 추가 |

---

## Test Results

### Backend (pytest)

```
api/tests/test_workflow_engine.py   35 passed
api/tests/test_webhooks_api.py      12 passed
api/tests/test_workflow_api.py       9 passed
api/tests/test_health.py             3 passed
────────────────────────────────────
Total: 59 passed, 0 failed, 0 skipped
```

### Frontend (Playwright E2E)

```
web/tests/e2e/human-gate.spec.ts
  ✓ Human Gate 노드가 Pending 상태로 정지됨
  ✓ 승인(Approve) 후 파이프라인 Resume
  ✓ 반려(Reject) 후 run 상태 blocked 전환
  ✓ SSE 연결 취소 후 Zombie Connection 미발생

web/tests/e2e/toast-layering.spec.ts
  ✓ 알림 토스트 레이어링 정상 표시
────────────────────────────────────
Total: 5 passed, 0 failed
```

### 변경 규모 요약

```
23 files changed
+561 insertions / -56 deletions
```

---

## Risks / Follow-ups

### 위험 요소

| 항목 | 내용 | 완화 방안 |
|---|---|---|
| 기존 파이프라인 호환성 | `workflow_engine.py` 엣지 전이 교체로 이전 워크플로우 JSON과 행동 차이 가능 | 단위 테스트에 회귀 케이스 포함, 기존 `default_linear_v1` fallback 유지 |
| HMAC 시크릿 미설정 환경 | `WEBHOOK_SECRET` 미설정 시 서명 검증 skip 가능성 | 시작 시 필수 환경 변수 검증으로 보완, 운영 배포 전 `.env` 적용 필수 |
| Human Gate 인가 완전성 | Role/Workspace 기반 세밀한 인가 로직은 이번 PR에서 기반만 마련 | 후속 Phase에서 `reviewer`/`admin` Role 기반 ACL 강화 예정 |

### 후속 작업 (Follow-ups)

- **Phase 2 — Agent SDK v1**: `agent_specs` 스키마 및 CLI 어댑터 표준화 (PLAN.md Phase 2)
- **Phase 3 — Postgres 이관**: `workflow_runs`, `node_runs`, `artifacts` 테이블 마이그레이션
- **Human Gate Role 기반 인가**: `reviewer`/`admin` 역할 검증 미들웨어 구현
- **Visual Workflow Builder**: ReactFlow 캔버스 편집 + 드라이런 시뮬레이션 (PLAN.md Phase 5)
- **Docker Preview 정보**:
  - Web: `http://ssh.manbalboy.com:7000` (포트 7000)
  - API: `http://ssh.manbalboy.com:7001` (포트 7001)
  - 실행: `docker compose up --build`

---

Closes #67
```

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
