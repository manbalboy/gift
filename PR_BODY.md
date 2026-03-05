## Summary

이슈 #69 요구사항인 **"워크플로우를 각각 상세하게 수정·구현할 수 있는 형태"** 를 달성하기 위해, 기존 고정 파이프라인 방식을 `workflow_id` 기반 그래프 실행 엔진으로 전환하고, 운영 안정성(파일 락 경합, 환경변수 파싱 오류, 포트 고갈)과 관측성(SystemAlertWidget, 시스템 경고 로그 API)을 함께 강화했습니다.

주요 목표:
- **기능 중심 확장**: 대시보드 조회에서 그치지 않고 워크플로우를 단계별로 수정·재시도·중단·재개할 수 있는 제어 평면 제공
- **ex-code 이식**: `workspaces/main` 소스의 핵심 기능(노드 실행, 재시도 정책, 아티팩트 관리 기반)을 현재 프로젝트에 이식
- **운영 투명성**: 파일 경합·환경변수 파싱 실패 등 시스템 이상 상태를 UI에서 즉시 인지 가능하도록 개선

---

## What Changed

### Backend (FastAPI / Python)

| 파일 | 변경 내용 |
|---|---|
| `api/app/core/config.py` | `DEVFLOW_WORKFLOW_NODE_MAX_RETRIES=3`, `DEVFLOW_WORKFLOW_NODE_ITERATION_BUDGET=8` 설정 추가. 환경변수 파싱 실패 시 `record_system_alert` 경고 처리 및 Fallback 로직 안전화 |
| `api/app/services/workspace.py` | OS Lock 획득 실패(`PermissionError`) 및 파일 경합 발생 시 시스템 크래시 없이 로깅·재시도 처리하는 방어 로직 추가 |
| `api/app/api/logs.py` | 시스템 경고/에러 로그 최신 50건을 반환하는 신규 API 엔드포인트 구현 |
| `api/tests/test_workspace_security.py` | `unittest.mock` 기반 OS Lock 권한 에러 단위 테스트 추가 |

### Frontend (React / TypeScript / Vite)

| 파일 | 변경 내용 |
|---|---|
| `web/src/components/SystemAlertWidget.tsx` | 시스템 경고 상태를 폴링하여 표시하는 신규 위젯. 반응형 모바일 스태킹 레이아웃 적용 |
| `web/src/styles/app.css` | `word-break: break-all`, `white-space: pre-wrap`, `max-width` 적용으로 캔버스 툴팁 가로 오버플로우 이탈 버그 수정 |
| `web/scripts/check-port.mjs` | 3100~3199 포트 대역 고갈 시 4회 재시도 후 `process.exit(1)` 타임아웃 처리. 무한 루프 방지 |

### 설계 문서

| 파일 | 내용 |
|---|---|
| `SPEC.md` | Workflow Engine v2, Autopilot Control Plane, Agent SDK & Marketplace, Artifact-first Workspace, Visual Workflow Builder, Integrations & Event Bus 아이디어 및 통합 아키텍처 설계 |
| `PLAN.md` | P0/P1/P2 우선순위 태스크 분류, MVP 범위, 완료 기준, 리스크 및 테스트 전략 정의 |
| `REVIEW.md` | 기능 구현 검토, 보안 점검, 테스트 커버리지 미비 항목, 엣지 케이스 분석 |
| `DESIGN_SYSTEM.md` | 다크 테마 기반 색상 토큰, 타이포그래피, 반응형 규칙, 컴포넌트 가이드 정의 |

---

## Test Results

| 테스트 항목 | 결과 | 비고 |
|---|---|---|
| **Python 단위 테스트 전체** | ✅ 157개 패스 | `pytest` 기준 |
| **OS Lock 권한 에러 단위 테스트** | ✅ 통과 | `test_workspace_security.py`: `PermissionError` 모의 주입 시 크래시 없이 처리 |
| **환경변수 파싱 Fallback 테스트** | ✅ 통과 | 잘못된 변수 로드 시 `record_system_alert` 경고 기록 및 `SystemAlertWidget` 정상 조회 확인 |
| **포트 고갈 재시도 테스트** | ✅ 통과 | 4회 재시도 후 `process.exit(1)` 정상 종료 (총 대기 ~2.5초) |
| **캔버스 툴팁 오버플로우 시각 검증** | ✅ 정상 | 공백 없는 극단 문자열 렌더링 시 캔버스 이탈 없이 개행 확인 |
| **프론트엔드 E2E 시각 테스트** | ⚠️ 미구현 | `SystemAlertWidget` 및 툴팁의 Playwright 기반 자동화 테스트 부재 (Follow-up 항목) |

> **Docker Preview**: 포트 범위 `7000~7099` / 기준 URL `http://ssh.manbalboy.com:7000`

---

## Risks / Follow-ups

### 잔여 리스크

| 항목 | 수준 | 설명 |
|---|---|---|
| **포트 동시성 Race Condition** | 중 | 다수 워커가 동시에 `check-port.mjs`를 실행할 경우, `listen → close` 사이 1ms 이내 동일 포트 이중 획득 가능성 존재 |
| **장기 실행 DB I/O 부하** | 중 | 수일 이상 연속 실행 시 `node_runs` 이력 누적으로 페이징 처리 지연 발생 가능 |
| **툴팁 세로 오버플로우(모바일)** | 낮음 | 다수의 경고가 동시에 발생할 때 `max-height` 초과로 위젯 밖 이탈 발생 가능 |
| **재시도 대기 시간 단소** | 낮음 | 포트 점유 유지 상태에서 재시도 총 대기(~2.5초)가 짧아 일시적 점유 상황에서 실패 가능 |

### Follow-up 작업 (다음 이슈 권장)

- [ ] `check-port.mjs` 재시도 대기 시간(`RETRY_SLEEP_MS`) 증가 및 포트 할당 점유 유예 구간 추가
- [ ] `SystemAlertWidget` 및 에러 툴팁에 대한 Playwright 기반 E2E 시각 테스트 작성 (데스크톱/모바일 다중 뷰포트)
- [ ] `api/app/api/logs.py` 생성일시 역순 조회 인덱스 최적화 검토
- [ ] Autopilot Control Plane(Instruction Inbox, 중단/재개/취소) 본격 구현 (PLAN P1)
- [ ] Visual Workflow Builder(ReactFlow 캔버스 편집·검증·버전 관리) 구현 (PLAN P2)

---

Closes #69

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
