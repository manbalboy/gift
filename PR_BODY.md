```markdown
## Summary

이슈 [#65] *[초장기] 오픈소스의 왕이 될 프로그램 제작* 의 첫 번째 실행 사이클 결과물입니다.

DevFlow Agent Hub의 핵심 목표인 **"GitHub Issue → 자동 파이프라인 실행 → PR 생성"** 흐름 위에, SPEC에서 도출된 보안·안정성 결함을 우선 패치하고 Agent Marketplace, KPI 대시보드, Dev Integration Webhook의 기초 구조를 신규 구현했습니다.

> **핵심 원칙**: 오케스트레이터가 단계 순서를 결정하고 AI(Gemini/Codex/Claude)는 CLI 작업자(worker)로 호출됩니다.

---

## What Changed

### 보안 패치 (P0)

| 파일 | 변경 내용 |
|---|---|
| `api/app/main.py` | `allow_origin_regex` 수정 — `manbalboy.com` 계열 도메인은 포트 무관 허용, localhost/127.0.0.1 계열 보존 |
| `api/app/api/webhooks.py` | GitHub 웹훅 엔드포인트에 `X-Hub-Signature-256` HMAC 서명 검증 의존성 추가 |
| `api/app/api/webhooks.py` | 범용 CI/CD 웹훅 수신 시 API Secret 토큰 검증 단계 추가 |

### 백엔드 신규 구현 (P0/P1)

| 파일 | 변경 내용 |
|---|---|
| `api/app/services/rate_limiter.py` | 인메모리 → **Redis 기반 Rate Limiter** 전환 (Scale-out 환경 대응, 장애 시 로컬 Fallback 유지) |
| `api/app/services/agent_runner.py` | 태스크 실행 전 **Docker Ping 체크** 추가 (좀비 컨테이너·스레드 고갈 조기 차단, 3초 타임아웃) |
| `api/app/services/workflow_engine.py` | Workflow Engine 초기 구현 — `workflow_id` 기반 실행, executor registry, `node_runs` 저장 |
| `api/app/services/workspace.py` | 프로젝트 단위 산출물(PRD/Plan/Code/Test/PR) 경로 분리 및 저장 로직 |
| `api/app/models/agent.py` | Agent Marketplace DB 모델 (입출력 스키마·툴·프롬프트 정책 영속성 확보) |
| `api/app/schemas/agent.py` | Agent CRUD 요청/응답 Pydantic 스키마 |
| `api/app/api/agents.py` | Agent Marketplace CRUD API 엔드포인트 |
| `api/app/models/workflow.py` | `workflow_definitions`, `workflow_runs`, `node_runs` DB 모델 |
| `api/app/schemas/workflow.py` · `webhook.py` | 워크플로우·웹훅 요청/응답 스키마 |
| `api/app/core/config.py` | Redis 연결 설정 추가 |
| `api/app/db/base.py` · `session.py` | DB 세션 관리 기반 설정 |

### 프론트엔드 신규 구현 (P1)

| 파일 | 변경 내용 |
|---|---|
| `web/src/components/Dashboard.tsx` | 리드타임·실패율·병목 구간 시각화 KPI 대시보드 |
| `web/src/components/LiveRunConstellation.tsx` | 워크플로우 노드 실시간 상태 표시 인터랙티브 미니맵 (WOW Point) |
| `web/src/components/StatusBadge.tsx` | 상태 통일 badge 컴포넌트 (`queued/running/done/failed/review_needed`) |
| `web/src/App.tsx` | 라우팅 및 신규 뷰 통합 |

### 테스트 추가 (P2)

- `api/tests/` — 웹훅 HMAC 검증 실패 케이스(401/403), Redis Rate Limiter 동시성, Docker Ping 타임아웃 Mock 테스트
- `web/src/components/Dashboard.test.tsx` · `LiveRunConstellation.test.tsx` · `WorkflowBuilder.test.tsx` — RTL 기반 렌더링 단위 테스트

---

## Test Results

| 구분 | 결과 |
|---|---|
| 테스트 스위트 | `run_agenthub_tests.sh e2e` |
| 통과 | **41** |
| 실패 | **0** |
| 스킵 | 0 |
| 실행 시간 | 8.36s |

```
.........................................                                [100%]
41 passed in 8.36s
```

---

## Risks / Follow-ups

| 항목 | 내용 | 우선순위 |
|---|---|---|
| **Redis Fallback 시 Rate Limit 무력화** | Scale-out 환경에서 Redis 장애 시 워커별 독립 인메모리 카운터로 우회되어 전체 허용량이 N배로 증가할 수 있음. 로깅 강화 및 Fallback 허용 한계를 보수적으로 조정 필요 | 후속 조치 |
| **Docker Ping 빈도 오버헤드** | 노드가 짧은 간격으로 연속 실행될 경우 매 태스크마다 3초 타임아웃 서브프로세스가 생성되어 I/O 부하 발생. 결과 캐싱(TTL 30초 등) 도입 검토 필요 | 후속 조치 |
| **KPI 집계 성능** | 전체 Run 데이터 풀 스캔 시 응답 지연 우려. 인덱스 최적화 또는 집계 테이블 분리 검토 필요 | 후속 조치 |
| **Workflow Engine MVP 한계** | 조건 분기·병렬 노드·Visual Builder(ReactFlow)는 이번 PR 범위 외. 다음 이터레이션에서 구현 예정 | Out-of-scope |
| **Temporal/LangGraph 마이그레이션** | 외부 워크플로우 엔진 전환은 현재 내부 엔진 안정화 이후 검토 | Out-of-scope |

---

Closes #65
```

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
