## Summary

이슈 #69에서 요청된 "워크플로우를 각각 상세하게 수정·제어할 수 있는 형태"로의 전환을 위해, **Workflow Engine v2 기반 고도화**를 착수하였습니다.

기존에는 대시보드 열람만 가능했던 MVP 구조에서 벗어나, (1) 클라이언트·서버 양단의 그래프 유효성 검증 강화, (2) 프론트엔드 입력 폼 버그 수정, (3) Agentic Loop 무한 반복 방지 예산 추적, (4) 보안 미들웨어 보완이라는 네 가지 핵심 개선을 완료했습니다. 이를 통해 사용자가 워크플로우 노드를 안전하게 편집·저장·실행·중단할 수 있는 기반을 마련했습니다.

---

## What Changed

### 1. 프론트엔드 폼 개행 누적 버그 수정 (`web/src/App.tsx`)
- `handleRejectReasonPreset` 처리 시 개행 문자와 후행 공백이 지속 누적되던 버그를 정규식 최적화로 수정.
- 사용자가 지시 주입 폼에서 프리셋 버튼을 반복 클릭해도 텍스트가 오염되지 않음.

### 2. 프론트엔드 단위 테스트 추가 (`web/src/App.test.tsx`)
- 위 수정 로직을 커버하는 단위 테스트 40줄 신규 작성.
- 개행·공백 누적 경계값 및 정상 흐름을 포함한 시나리오 검증.

### 3. 빌더 UI 클라이언트 사전 유효성 검사 및 E2E 테스트 보강 (`web/tests/e2e/workflow-builder.spec.ts`)
- 단절 그래프(Disconnected graph)·다중 진입점 상태에서 저장 시도 시 에러 토스트가 정상 노출되는지 검증하는 E2E 테스트 44줄 추가.
- 불량 그래프가 백엔드로 전달되지 않도록 캔버스 저장 이벤트 시점에 클라이언트 사이드 차단 로직 적용 확인.

### 4. 백엔드 워크플로우 검증 테스트 전면 개편 (`api/tests/test_workflow_engine.py`)
- 과거 사양에 머물러 단절 그래프를 허용하던 테스트 케이스 40줄 삭제.
- 비정상 그래프 데이터 수신 시 `400` / `422` 유효성 에러를 올바르게 반환하는지 확인하는 테스트 11줄로 교체.

### 5. Agentic Loop 무한 반복 방지 (예산 추적) (`api/app/services/workflow_engine.py`)
- 노드 실행 시 최대 반복 횟수를 카운팅하는 예산 추적 로직 추가.
- 임계치 초과 시 엔진 상태를 강제 `paused`로 전환하여 비용 폭주 및 무한 루프를 방어.
- `paused` 상태 처리 시 발생하던 기존 버그도 함께 수정.

### 6. 보안 미들웨어 보완 (`api/app/main.py` / `api/app/api/dependencies.py`)
- 프리뷰 토큰 인증 우회 경로(Preview Token bypass path)를 명시적으로 허용 처리하여 정상 프리뷰 흐름에서 인증 오류가 발생하지 않도록 수정.
- 로컬 포트 직접 접근 시 뷰어 토큰 검증이 엄격히 적용되는 방어 로직 유지.

---

## Test Results

| 구분 | 결과 | 수량 |
|---|---|---:|
| passed | ✅ PASS | 131 |
| failed | - | 0 |
| skipped | - | 0 |
| errors | - | 0 |

- 실행 시간: 약 23.69s
- 테스트 커맨드: `run_agenthub_tests.sh e2e`
- 최종 상태: **PASS** (exit code 0)

> Docker Preview: Dockerfile이 저장소 루트에 존재하지 않아 컨테이너 프리뷰는 이번 사이클에서 건너뜀(skipped).

---

## Risks / Follow-ups

### 잠재 리스크
- **False Positive 가능성**: 무한 루프 방지 예산 임계치가 너무 낮게 설정될 경우, 정상적으로 장기 대기가 필요한 AI 호출(예: 대용량 코드 생성)이 조기에 `paused` 처리될 수 있음. 임계치 튜닝 및 모니터링 필요.
- **하위 호환성**: 기존 Job 실행 구조(고정 Orchestrator 방식)에서 DAG 기반 Workflow Engine v2 전환 시 레거시 `workflow_run` 레코드와의 스키마 호환성 검증이 필요.

### Follow-ups (Out-of-scope, 후속 이슈 권장)
- **Artifact-first Workspace (P1)**: 로그 중심 구조를 산출물(spec/plan/test_report) 1급 객체 관리로 전환. Object Storage 연동 포함.
- **Visual Workflow Builder 완성 (P1)**: ReactFlow 기반 노드/엣지 편집 UI와 `validate` API 완전 연동 및 버전 퍼블리시 기능.
- **Integrations & Event Bus (P2)**: PR/CI/Deploy 이벤트 기반 룰 엔진 및 Postgres outbox 패턴 적용.
- **외부 S3 스토리지 연동**: MVP에서는 로컬 스토리지 대체 운영, 이후 S3-compatible 오브젝트 스토어로 마이그레이션 예정.
- **Temporal / LangGraph 런타임 어댑터**: 현재는 내장 엔진 사용, 초장기 실행 안정성을 위한 외부 런타임 어댑터 도입 검토 필요.

---

Closes #69

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
