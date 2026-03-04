## Summary

이 PR은 이슈 #65 **[초장기] 오픈소스의 왕이 될 프로그램 제작**의 일환으로, `manbalboy/agent-hub` 프로젝트를 **GitHub Issue → 자동 파이프라인 실행 → PR 생성** 을 지원하는 **DevFlow Agent Hub MVP** 로 고도화한 결과물입니다.

핵심 목표는 기존 FastAPI 고정 파이프라인 구조를 유지하면서 **Workflow Engine 정식화**, **CORS 보안 강화**, **AgentRunner 견고성 개선**, **React Flow 기반 Visual Builder 기초**, **상태 보상(Compensation) 데몬** 을 MVP 범위 내에서 구현하는 것입니다.

> **Docker Preview**: `http://ssh.manbalboy.com:7000` (포트 범위 `7000–7099`)  
> API 서버: `7000`, 대시보드(Next.js): `7001`, Web(Vite): `7002`

---

## What Changed

### P0 — 핵심 수정 및 보안 강화

| 항목 | 변경 내용 |
|---|---|
| **CORS 정규식 보완** (`api/app/main.py`) | 포트 허용 범위를 `7000–7099`로 명시하고, ReDoS 위험이 없는 정규식(`(?:[A-Za-z0-9-]+\.)*manbalboy\.com`)으로 교체. `localhost`·`127.0.0.1` 계열 안전하게 허용 |
| **Path Traversal 방어** (`api/app/services/agent_runner.py`) | 임시 `.sh` 파일 경로를 허용 디렉토리 밖으로 탈출하지 못하도록 경로 검증 로직 추가 |
| **Race Condition DB 락** (`api/app/services/workflow_engine.py`) | `with_for_update()`로 동시 요청 시 노드 상태 덮어쓰기 방지, 트랜잭션 단위 commit 적용 |
| **AgentRunner 실 구동** (`api/app/services/agent_runner.py`) | 긴 프롬프트 대비 `bash -lc` → 임시 `.sh` 파일 실행 구조로 전환. `os.killpg` 타임아웃 종료 포함 |
| **스키마 유효성 검사** | `WorkflowDefinition` 노드 속성에서 실제 `command`를 추출해 `AgentTaskRequest.payload`에 전달하는 로직 추가 — echo 폴백만 실행되던 치명적 버그 수정 |
| **상태 보상 데몬** (`recover_stuck_runs`) | 서버 재시작 시 장기 `running` 상태 노드를 `failed` 또는 재시도 대상으로 복원. 노드 단위 개별 `commit`으로 부분 실패 시 전체 롤백 방지 |

### P1 — 기능 강화

| 항목 | 변경 내용 |
|---|---|
| **React Flow 기반 Visual Workflow Builder 기초** (`web/`) | 노드·엣지 렌더링, 드래그/줌, validate/save 인터랙션 기본 구현 |
| **상태 확장** | `queued / running / done / failed` 외 `review_needed / retrying / blocked / skipped` 추가 |
| **디자인 시스템 적용** | 다크 테마(`#0B1020` 계열) + 상태 시맨틱 컬러 토큰(Success `#22C55E`, Running `#3B82F6`, Failed `#EF4444` 등) 반영. `Pretendard` + `JetBrains Mono` 이중 타이포 체계 |

---

## Test Results

| 테스트 유형 | 결과 | 비고 |
|---|---|---|
| **Unit — AgentRunner 임시파일 라이프사이클** | ✅ PASS | 생성→실행→삭제 순서 및 시스템 예외 브랜치 Mocking 포함 |
| **Unit — 보상 데몬 조건 필터링** | ✅ PASS | 정상 실행 노드 오작동 없이 장기 체류 노드만 선별 복원 확인 |
| **Integration — DB 트랜잭션 격리** | ✅ PASS | `with_for_update` 대기 지연 및 Rollback 케이스 격리 검증 |
| **Integration — CORS 정책** | ✅ PASS | `manbalboy.com` 서브도메인·포트 `7000–7099` 허용, 외부 도메인 차단 확인 |
| **E2E — Webhook → 파이프라인 → 아티팩트** | ✅ PASS | GitHub Webhook 모의 트리거 → Issue Job 생성 → 상태 갱신 → `workspace/` 아티팩트 기록 전 과정 통과 |
| **프론트엔드 UI (WorkflowBuilder)** | ⚠️ 부분 커버 | 노드·엣지 변경 이벤트 기본 케이스 통과. 모바일 뷰포트 전환·잘못된 연결 피드백 테스트 미흡 (Follow-up 항목) |

---

## Risks / Follow-ups

### 잔여 리스크

| 구분 | 내용 | 심각도 |
|---|---|---|
| **RCE (원격 코드 실행)** | 임시 `.sh` 파일을 호스트 `bash`에서 직접 실행하는 구조로, 외부 입력이 검증 없이 주입될 경우 시스템 전체 장악 위험. 현재 단계는 컨테이너 기반 샌드박스 없이 운영 중 | 🔴 높음 |
| **CORS 서브도메인 전수 허용** | `*.manbalboy.com` 전체 허용으로, 취약한 서브도메인이 탈취될 경우 API에 악의적 교차 출처 요청 가능 | 🟡 중간 |
| **다중 프로세스 DB 락 경합** | `threading.Lock` + `with_for_update()` 조합은 Gunicorn 멀티 워커 환경에서 데드락/타임아웃 병목 발생 가능. MVP 범위 외 항목 | 🟡 중간 |
| **좀비 프로세스 대기** | `setsid` 우회 또는 백그라운드 데몬을 생성하는 스크립트 실행 시 `communicate()`에서 무한 대기 가능 | 🟡 중간 |

### Follow-up 항목 (다음 단계)

- [ ] **실행 워커 컨테이너 샌드박스 도입** — Docker-in-Docker 또는 격리 실행 환경으로 RCE 방지 아키텍처 전환
- [ ] **Redis 기반 분산 락** — 멀티 프로세스 스케일아웃 대비 `threading.Lock` 대체 검토
- [ ] **WorkflowBuilder.tsx 테스트 확충** — React Flow 캔버스 조작, 모바일 뷰포트 전환, 잘못된 그래프 연결 시 사용자 피드백 검증
- [ ] **WorkspaceService 엣지 케이스 테스트** — 권한 부족·디스크 초과·디렉토리 생성 실패 단위 테스트 추가
- [ ] **KPI 대시보드 고도화** — 리드타임(이슈→PR), 재작업률, 병목 노드, E2E 통과율 지표 추가
- [ ] **Dev Integration 확대** — GitHub PR/CI/Deploy 이벤트까지 트리거 범위 확장
- [ ] **`Live Run Constellation` WOW 포인트 구현** — 대시보드 상단 실시간 노드 점등 미니맵(Canvas/SVG + SSE)

---

Closes #65

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
