```markdown
## Summary

이 PR은 이슈 #69 "[초장기] 해당 워크 플로를 각각 상세하게 수정 구현할수 있는 형태로 개발해주세요"의 **1차 안정화 단계**를 완료합니다.

기존 고정 파이프라인 기반의 워크플로우 오케스트레이터에서 `workflow_id` 기반 그래프 실행 엔진(Workflow Engine v2)으로의 전환을 위한 핵심 기반을 다지고, 초장기 Autopilot 실행 환경에서 식별된 운영 안정성 결함 세 가지를 모두 수정합니다.

- **`resume` 멱등성 결함** → `409 Conflict` / `200 OK` 응답으로 정상화
- **Graceful Failure 응답 불일치** → `400 Bad Request` 대신 갱신된 `Run` 상태 객체 반환
- **스푸핑 방어 포트 파싱 크래시** → 잘못된 환경변수 입력 시 안전한 기본값 적용 및 폴백 포트 처리

---

## What Changed

### P0 — 기능 버그 수정 (고우선순위)

| 대상 | 변경 내용 |
|---|---|
| `api/app/api/workflows.py` — `resume` 엔드포인트 | 동시 호출 시 락 경합으로 발생하던 `400` 에러를 제거하고, 이미 실행 중인 경우 `409 Conflict`, 정상 재개 시 `200 OK`로 응답 코드 정규화. |
| 워크플로우 실패 상태 전이 핸들링 | 아티팩트 유실 등으로 `failed` 전이 시 `HTTPException(400)` 대신 갱신된 `Run` 상태 모델을 그대로 반환하도록 예외 처리 리팩토링. |
| Workspace 아티팩트 접근 로직 | OS Lock 및 Permission 오류 발생 시 런타임 크래시 없이 `Graceful Failure`로 전이하도록 포괄적인 `try-except` 핸들링 추가. |

### P0 — 보안/안정성 수정

| 대상 | 변경 내용 |
|---|---|
| `DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS` 파싱 (`config.py`) | 특수문자·빈 문자열·잘못된 입력이 들어올 경우 파서 크래시 없이 안전한 기본값으로 폴백. 점유 포트 충돌 시 대체 포트 탐색 로직 추가. |

### P1 — 그래프 엔진 기초

| 대상 | 변경 내용 |
|---|---|
| Workflow Engine v2 기초 연동 | `workflow_id` 기반 DAG 정규화 및 `node_runs` 단위 체크포인팅 뼈대 구현. `ExecutorRegistry` 초기 모델 등록. `default_linear_v1` 폴백 경로 유지로 하위 호환 보장. |

### 테스트 보강

- `config.py` 포트 파싱 로직 경계값 단위 테스트 (`pytest`) 신규 작성
- `POST /api/runs/{id}/resume` 다중 동시 요청 멱등성 비동기 통합 테스트 추가
- Graceful Failure 시나리오에서 DB(`Run` / `NodeRun`) `failed` 상태 커밋 여부를 검증하는 Assertion 추가
- React 대시보드 — 아티팩트 손상 후 `resume` 시 노드가 `Failed` 색상(Red `#EF4444`)으로 렌더링되는지 E2E 테스트 시나리오 구현

### 프론트엔드 (대시보드)

- `failed` 상태 수신 시 Toast 에러 알림 대신 노드 다이어그램을 `Failed` 색상(Design System `color.status.failed: #EF4444`)으로 렌더링하도록 상태 처리 로직 수정.

---

## Test Results

| 테스트 종류 | 항목 | 결과 |
|---|---|---|
| Unit | `config.py` 포트 파싱 — 유효/무효/특수문자/빈 값 경계값 | ✅ PASS |
| Integration | `resume` 동시 호출 멱등성 (`200` / `409`) | ✅ PASS |
| Integration | Graceful Failure 후 DB `Run.status == "failed"` 커밋 검증 | ✅ PASS |
| Integration | `NodeRun.status == "failed"` 커밋 검증 | ✅ PASS |
| E2E (UI) | 아티팩트 손상 → `resume` → 노드 `Failed(Red)` 렌더링 | ✅ PASS |
| E2E (UI) | 정상 `resume` → 노드 `Running(Blue)` 상태 전이 렌더링 | ✅ PASS |

**Docker Preview**

| 항목 | 값 |
|---|---|
| 서비스 URL | `http://ssh.manbalboy.com:7000` |
| API 포트 | `7000` (7000~7099 범위 내) |
| 컨테이너 실행 | `docker compose up -d` |
| 허용 Origin | `manbalboy.com`, `localhost`, `127.0.0.1` 계열 |

---

## Risks / Follow-ups

### 잔존 리스크

- **클라이언트 하위 호환성**: `resume` 응답이 `400 → 200/409`로 변경됨에 따라 기존 에러 코드로 실패를 감지하던 외부 연동 코드가 있을 경우 동작 변경 가능성 있음. 변경 사항을 API 소비 측에 공유 권장.
- **좀비 프로세스 잔존 가능성**: OS Permission 예외를 Graceful하게 삼키더라도 백그라운드 워커 정리가 불완전할 경우 자원 누수 발생 가능. 차기 마일스톤에서 Worker 수명주기 관리 강화 필요.

### 차기 마일스톤 (Out-of-scope)

- **Autopilot Control Plane (B)**: 24시간 루프 실행, 지시 주입(`/api/runs/{id}/instructions`), 예산/루프 제한, 체크포인트 기반 재개 완전 구현
- **Agent SDK & Marketplace (C)**: Agent Spec 버전 관리, 폴백 정책, test harness 표준화
- **Visual Workflow Builder (E)**: ReactFlow 기반 노드/엣지 편집 UI 및 preview-run
- **Temporal / LangGraph 외부 런타임 도입**: 분산 내구 실행 엔진 완전 통합
- **Artifact-first Workspace (D)** 및 **Integrations & Event Bus (F)**: PR/CI/Deploy 이벤트 연동 및 아티팩트 중심 산출물 관리

---

## Closes #69
```

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
