## Summary

이슈 #69 요청에 따라 대시보드 조회만 가능했던 기존 상태에서, **각 워크플로우를 상세하게 수정·제어할 수 있는 형태**로 시스템 전반을 고도화합니다.

핵심 방향은 세 가지입니다.

1. **워크플로우 엔진 V2 전환** — 고정 파이프라인에서 `workflow_id` 기반 DAG 실행으로 전환하여, 노드 단위 재시도·재개·중단이 가능하도록 합니다.
2. **운영 안정화 및 보안 패치** — 무한 루프 차단(Budget Limit), 포트 락 해제, 민감 정보 마스킹, 워크플로우 제어 API 인가를 적용합니다.
3. **대시보드 UI 버그 수정 및 시각 품질 개선** — `SystemAlertWidget` 레이아웃 붕괴 수정 및 다중 뷰포트 E2E 커버리지를 추가합니다.

배포 Preview: `http://ssh.manbalboy.com:7000` (포트 범위 7000–7099 사용)

---

## What Changed

### P0 — 핵심 기능 (High Priority)

| 영역 | 파일 | 변경 내용 |
|------|------|-----------|
| **워크플로우 엔진 V2** | `api/app/services/workflow_engine.py` | `ExecutorRegistry` 도입, `node_runs` 기록으로 부분 재시도·재개 지원. `default_linear_v1` fallback으로 기존 파이프라인 호환 유지 |
| **Autopilot 제어 API** | `api/app/api/workflows.py` | `pause`, `resume`, `cancel`, `retry-node` 엔드포인트 추가. Role/HMAC 인가 미들웨어 연동 |
| **무한 루프 차단** | `api/app/services/workflow_engine.py` | 노드 실행 예산(Budget) 초과 시 즉각 `Blocked` 상태로 전이. 동일 노드 반복 실패 시 Risk Score 누적 및 경고 알림 표출 |
| **민감 정보 마스킹** | `api/app/services/system_alerts.py` | 로컬 경로·인증 토큰을 `***[MASKED]***`로 치환하는 마스킹 필터 적용. 시스템 알림 DB 영속화 처리 |
| **포트 락 타임아웃** | `web/scripts/check-port.mjs` | 3100–3199 포트 경합 시 타임아웃 강제 및 잔여 Lock 파일 자동 소거 로직 추가 |

### P1 — UI 및 품질 개선 (Medium Priority)

| 영역 | 파일 | 변경 내용 |
|------|------|-----------|
| **대시보드 알림 위젯** | `web/src/components/SystemAlertWidget.tsx` | `overflow-y: auto`, `word-break: break-all` 적용으로 뷰포트 오버플로우 버그 수정 |
| **DB 인덱스 최적화** | `api/app/db/system_alert_model.py` + Alembic | `created_at` DESC 인덱스 추가로 최신순 로그 조회 성능 병목 해소 |

### API 변경 요약

```
# 신규 엔드포인트
POST   /api/runs/{id}/cancel
POST   /api/runs/{id}/pause
POST   /api/runs/{id}/resume
POST   /api/runs/{id}/retry-node
GET    /api/runs/{id}/state

# 기존 확장
POST   /api/workflows/validate   (서버 사이드 DAG 검증 강화)
GET    /api/runs/{id}/timeline   (node_runs 기반 타임라인)
```

### DB 스키마 변경 요약

```sql
-- 신규 테이블
workflow_runs   (id, workflow_id, status, started_at, ended_at)
node_runs       (id, run_id, node_id, status, attempt, error, started_at, ended_at, outputs_ref)
instructions    (id, run_id, type, payload, created_at)

-- 신규 인덱스
CREATE INDEX idx_system_alerts_created_at_desc
  ON system_alerts (created_at DESC);
```

---

## Test Results

### 백엔드 (`api/tests/`)

| 테스트 | 결과 |
|--------|------|
| `test_workflow_engine.py` — Budget 초과 시 Blocked 전이 단언 | PASS |
| `test_workspace_security.py` — 마스킹 필터 예외 패턴 및 ReDoS 타임아웃 | PASS |
| 인가 미들웨어 401/403 응답 단위 테스트 | PASS |

### 프론트엔드 E2E (`web/tests/e2e/`)

| 테스트 | 결과 |
|--------|------|
| `system-alert.spec.ts` — 데스크톱(1280px) 레이아웃 오버플로우 없음 | PASS |
| `system-alert.spec.ts` — 모바일(375px) 레이아웃 오버플로우 없음 | PASS |

### 인프라 통합 테스트 (`web/scripts/`)

| 테스트 | 결과 |
|--------|------|
| `test-port-timeout.sh` — 3100/3101 포트 경합 시 타임아웃 + Lock 파일 해제 확인 | PASS |

### Docker Preview 정보

```
컨테이너: agent-hub-preview
포트: 7000 (외부) → 3000 (내부 web), 7001 (외부) → 8000 (내부 api)
URL: http://ssh.manbalboy.com:7000
```

---

## Risks / Follow-ups

### 잔존 위험

| 위험 | 수준 | 설명 |
|------|------|------|
| **LLM 비용 폭주** | 중 | Budget Limit 및 루프 탐지를 적용했으나, 모델 단가·호출량이 미지정이므로 운영 초기 비용 모니터링 필요 |
| **마스킹 정규식 성능** | 중 | 대량 로그 폭증 시 ReDoS 위험 존재. 타임아웃 처리를 추가했으나 실환경 부하 테스트 권장 |
| **초장기 이벤트 히스토리** | 중 | 현재는 내장 엔진 사용. 수십 시간 이상 장기 실행 시 Temporal/LangGraph 런타임 도입 검토 필요 |
| **분산 워커 스케일** | 낮음 | 현재 단일 노드 기준. Kubernetes 멀티 워커 환경은 Out-of-scope (P2 이후 대응) |

### 후속 작업 (Follow-ups)

- [ ] **아티팩트 워크스페이스 (P1)**: 산출물을 1급 객체로 다루는 Object Store 연동 및 `artifacts` API 확장
- [ ] **Visual Workflow Builder (P1)**: ReactFlow 기반 노드 편집기 및 서버 사이드 검증 연동
- [ ] **마스킹 패턴 동적 업데이트**: 환경 변수 기반 동적 로딩으로 재배포 없는 보안 룰 확장
- [ ] **노드별 Retry UI 연동**: 엔진의 `retry-node` API와 대시보드 알림 위젯 액션 버튼 연동
- [ ] **Integrations & Event Bus (P2)**: GitHub PR/CI/Deploy 이벤트 룰 엔진 확장

---

Closes #69
