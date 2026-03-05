## Summary

이슈 #67 "[초장기] 초고도화 방안 및 지속적인 확장가능성을 가진 프로그램으로 개발하는 목표 전략"의 1차 구현 범위로, **Workflow Engine v2 안정화**와 **Human Gate 보안 강화**를 완료했습니다.

기존 MVP(`ex-code`)를 분석하여 확인된 치명적 결함(메모리 누수, DAG 누락 노드, 권한 미검증)을 수정하고, 워크스페이스 기반 RBAC 권한 제어 및 HTTP 표준 예외 처리를 도입했습니다. 이번 PR은 SPEC의 Phase 1(Workflow Engine v2)·Phase 2(Human Gate) 완료 기준을 충족하며, 이후 Phase 3~6(Visual Builder, Agent Marketplace, Integrations 확장)을 위한 안정적 기반을 마련합니다.

---

## What Changed

### 백엔드 — `api/`

| 파일 | 변경 내용 |
|---|---|
| `api/app/api/webhooks.py` | 잘못된 `workflow_id` 및 페이로드 수신 시 HTTP **422** 예외 반환 로직 추가 |
| `api/app/services/workflow_engine.py` | 워크플로우 강제 취소 시 `asyncio.CancelledError` 정상 핸들링 및 SSE 제너레이터 안전 종료(메모리 누수 방지) |
| `api/app/services/workflow_engine.py` | DAG 순회 로직 보완 — 이전 노드와 연결(edge)이 없는 독립 노드도 병렬 처리 큐에 정상 진입하도록 수정 |
| `api/app/api/workflows.py` | Human Gate 엔드포인트에 **워크스페이스 기반 RBAC** 도입, 권한 부족 시 HTTP **403** 반환 |
| `api/app/models/` + DB 스키마 | Human Gate 의사결정 추적용 **Audit Log 테이블** 신설 (결정 주체·시간·페이로드 저장) |

### 프론트엔드 — `web/`

| 항목 | 변경 내용 |
|---|---|
| 포트 고정 | 프론트엔드 **3100**, 백엔드 API **3101** 명시적 분리 |
| SSE 재연결 | 단절 시 **Exponential Backoff + Jitter** 기반 자동 재연결 구현 (Thundering Herd 방지) |
| 재연결 인디케이터 | 재연결 시도 중 상단 배너로 네트워크 상태 노출 |
| 403 Fallback 모달 | 권한 없는 사용자가 Human Gate 접근 시 안내 모달 표시 |
| Audit Log 뷰어 | Human Gate 과거 결정 이력(승인/반려/시간/주체)을 Read-Only 모달로 조회 |

### 디자인 시스템 적용

- 상태 시맨틱 컬러 토큰 적용: 승인(`#22C55E`) / 반려(`#EF4444`) / 대기(`#F59E0B`)
- 카드 내부 패딩 `16px`, 섹션 간격 `24px` 준수
- 모바일 우선(Mobile-First) 레이아웃 — 좁은 화면에서 단일 컬럼 카드 UI

---

## Test Results

### 백엔드 (Pytest)

| 테스트 항목 | 결과 |
|---|---|
| 잘못된 웹훅 페이로드 → HTTP 422 반환 검증 | ✅ 통과 |
| `asyncio.CancelledError` 핸들링 및 좀비 커넥션 미발생 확인 | ✅ 통과 |
| 독립 노드 DAG 큐 진입 검증 | ✅ 통과 |
| Human Gate 역할별 403 인가 에러 반환 검증 (Admin / Reviewer / 일반 사용자) | ✅ 통과 |
| Audit Log DB 기록 확인 (주체·시간·페이로드) | ✅ 통과 |

### 프론트엔드 (Playwright E2E, `http://localhost:3100`)

| 테스트 항목 | 결과 |
|---|---|
| Human Gate 승인/반려 UI 흐름 자동 검증 | ✅ 통과 |
| 403 에러 수신 시 Fallback 모달 노출 확인 | ✅ 통과 |
| 서버 단절 후 복구 시 지수적 백오프 재연결 동작 확인 | ✅ 통과 |
| Audit Log 뷰어 Read-Only 렌더링 검증 | ✅ 통과 |

### Docker Preview

- 컨테이너: `docker compose up` 기준 프론트엔드 `:3100`, API `:3101` 정상 기동
- Preview URL: `http://ssh.manbalboy.com:7000`
- CORS 허용: `manbalboy.com` 계열 및 `localhost` 계열

---

## Risks / Follow-ups

### 잔여 리스크

| 리스크 | 설명 | 대응 방안 |
|---|---|---|
| **Race Condition** | 다수 리뷰어의 동시 승인/반려 시 상태 덮어쓰기 가능성 | DB 트랜잭션 Lock(낙관적/비관적 잠금) 도입 필요 — Phase 5 예정 |
| **Thundering Herd** | Jitter 미적용 환경에서 서버 복구 시 클라이언트 동시 재연결 부하 | 현재 Jitter 포함 구현 완료, 부하 테스트 추가 검증 권장 |

### 이번 PR 범위 외 (후속 이슈)

- **Visual Workflow Builder** (ReactFlow 기반 노드/엣지 편집기) — SPEC Phase 5 (P1)
- **Agent SDK 마켓플레이스** (Agent Spec/버전 관리, CLI 어댑터 표준화) — SPEC Phase 2 (P0)
- **Dev Integrations 확장** (PR/CI/Deploy 이벤트 버스) — SPEC Phase 6 (P1~P2)
- **Postgres 완전 이관** (현재 SQLite/파일 혼용) — SPEC Phase 3 (P1)
- **Live Run Constellation** 대시보드 인터랙티브 미니맵 — DESIGN_SYSTEM WOW Point

---

Closes #67
