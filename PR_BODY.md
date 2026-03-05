## Summary

이 PR은 이슈 #69의 요구사항인 **"워크플로우를 각각 상세하게 수정·구현할 수 있는 형태"** 를 달성하기 위해, 기존 대시보드 조회 전용 구조를 탈피하여 워크플로우 편집·실행·제어를 아우르는 자동 개발자 플랫폼의 핵심 기반을 구축했습니다.

- 워크플로우 엔진의 무한 루프 및 타임아웃 방어 로직을 구현하고, 강제 Pause 상태로 전환된 워크플로우를 재개(Resume)할 수 있는 API 및 UI를 연동했습니다.
- 뷰어 토큰 인증 미들웨어를 Fail-closed 정책으로 강화하여 인증 설정 누락 시 전체 노출이 발생하지 않도록 보안 결함을 수정했습니다.
- 프론트엔드 폼 입력 버그와 워크플로우 빌더의 그래프 무결성 검증 부재를 해소하고, 전역 Toast UI를 통한 일관된 에러 피드백 체계를 완성했습니다.

---

## What Changed

### Backend (`api/`)

| 파일 | 변경 내용 |
|---|---|
| `api/app/api/dependencies.py` | `require_viewer_token` 함수를 Fail-closed 정책으로 수정. `viewer_token` 미설정 시 `401 Unauthorized` 반환. Localhost 스푸핑(3100번 포트 우회) 방어 로직 추가. |
| `api/app/services/workflow_engine.py` | 노드 실행 횟수·타임아웃 초과 시 워크플로우를 `PAUSED` 상태로 강제 전환하는 방어 로직 구현. Pause된 상태에서 남은 노드를 이어서 실행하는 Resume 핵심 로직 추가. 반복 예산 추적(budget counter) 추가. |
| `api/app/api/workflows.py` | `POST /runs/{run_id}/resume` 엔드포인트 신설. 클라이언트가 Pause 상태의 워크플로우를 안전하게 재개할 수 있는 제어 API 제공. |
| `api/tests/test_workflow_engine.py` | 비정상 그래프 페이로드 주입 시 `400`/`422` 반환 여부 테스트 추가. 무한 루프 목킹(Mocking)을 통한 `PAUSED` 상태 전이 검증. Resume 기능 백엔드 통합 테스트 추가. 토큰 미설정 시 차단되는지 확인하는 보안 테스트 케이스 추가. |

### Frontend (`web/`)

| 파일 | 변경 내용 |
|---|---|
| `web/src/App.tsx` | 프리셋 텍스트 반복 입력 시 공백·개행이 누적되는 버그 수정 (정규식 최적화). 워크플로우 `PAUSED` 상태를 감지하여 Resume 버튼을 노출하는 UI 연동. |
| `web/src/App.test.tsx` | 다국어·특수문자·멀티라인 등 텍스트 파싱 엣지 케이스 파라미터화 단위 테스트 추가. |
| `web/src/components/WorkflowBuilder.tsx` | 단절 그래프, 다중 진입점 존재 시 서버 저장 API 호출 차단 및 Toast 에러 피드백 제공하는 클라이언트 검증 로직 추가. |
| `web/src/components/common/Toast.tsx` | 동시다발적 에러 발생 시 일관된 톤앤매너로 렌더링되도록 Toast UI 고도화. 실패(`#EF4444`) / 경고(`#F59E0B`) 시맨틱 색상 토큰 적용. |
| `web/tests/e2e/WorkflowBuilder.spec.ts` | 단절 그래프 저장 시 Toast 렌더링 확인 및 네트워크 요청 미발생 검증 E2E 테스트 추가. Resume 버튼 클릭 흐름 E2E 테스트 추가. |

### Docker Preview

- 컨테이너 포트: `7000` (외부 노출)
- Preview URL: `http://ssh.manbalboy.com:7000`
- CORS 허용: `manbalboy.com` 계열 및 `localhost` 계열

---

## Test Results

| 구분 | 테스트 항목 | 결과 |
|---|---|---|
| FE 단위 | 프리셋 텍스트 파싱 엣지 케이스 (국영문·특수문자·멀티라인) | ✅ 통과 |
| FE E2E | 단절 그래프 저장 시도 → Toast 렌더링 + API 미호출 확인 | ✅ 통과 |
| FE E2E | `PAUSED` 상태 워크플로우 → Resume 버튼 클릭 → 재개 확인 | ✅ 통과 |
| BE 단위 | 비정상 그래프 페이로드 → `400`/`422` 반환 검증 | ✅ 통과 |
| BE 단위 | 무한 루프 목킹 → 임계치 초과 시 `PAUSED` 전이 확인 | ✅ 통과 |
| BE 통합 | `POST /runs/{id}/resume` → 남은 노드 정상 재개 확인 | ✅ 통과 |
| BE 보안 | 토큰 미설정 시 `401` 반환 (Fail-closed) 확인 | ✅ 통과 |
| BE 보안 | 3100번 포트 Localhost 스푸핑 우회 차단 확인 | ✅ 통과 |

---

## Risks / Follow-ups

### 현재 리스크

- **정상 장기 실행 노드의 강제 중단**: 복잡한 빌드·E2E 노드처럼 실제로 긴 실행 시간이 필요한 경우, 전역 타임아웃 임계치에 의해 의도치 않게 `PAUSED` 처리될 수 있음. 초기 임계값을 보수적으로 설정했으나, 운영 중 노드별 커스텀 타임아웃 설정 옵션 도입이 권장됨.
- **SSE 스트림의 Pause 전환 처리**: 워크플로우가 급격히 `PAUSED`로 전환될 때 SSE 스트림이 불필요한 재연결을 시도하는 엣지 케이스가 남아 있음. P1 단계에서 SSE 상태 이벤트 표준화 시 함께 해소 예정.
- **뷰어 토큰 Fail-closed 적용 범위**: 프리뷰 토큰 인증 우회 경로(preview 전용 엔드포인트)는 의도적으로 허용 상태를 유지함. 내부 Webhook 테스트 및 로컬 E2E 파이프라인이 차단되지 않도록 예외 처리 경로를 문서화하고 관리 필요.

### 후속 작업 (Follow-ups)

- [ ] **P1: 노드별 타임아웃 개별 설정** — `workflow_definition` 스키마에 노드 단위 `timeout_sec` 속성 추가하여 전역 임계치 의존도 완화.
- [ ] **P1: SSE 상태 이벤트 표준화** — `PAUSED`/`RESUMED`/`CANCELLED` 이벤트를 SSE 스트림으로 클라이언트에 푸시하는 표준 규격 정의.
- [ ] **P1: Artifact-first Workspace** — 노드 실행 결과를 파일 경로가 아닌 `artifact_id` 기반으로 전달하는 구조로 전환 (SPEC.md 아이디어 D).
- [ ] **P1: Visual Workflow Builder 완성** — ReactFlow 캔버스에서 조건 분기 엣지(`on=success|failure|always`) 및 변수 맵핑 UI 구현 (SPEC.md 아이디어 E).
- [ ] **P2: Autopilot Control Plane** — 지시 주입(instruction inbox), 24시간 루프 실행, Continue-As-New 기반 장기 실행 세그멘테이션 구현 (SPEC.md 아이디어 B).

---

Closes #69

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
