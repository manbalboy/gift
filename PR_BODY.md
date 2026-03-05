```markdown
## Summary

이슈 #69 "[초장기] 해당 워크 플로를 각각 상세하게 수정 구현할수 있는 형태로 개발해주세요"에 대응하여, **워크플로우 엔진의 안정성 확보 및 대시보드 상태 가시성 강화**를 핵심 목표로 구현을 진행했습니다.

기존 시스템은 대시보드 조회만 가능하고 실제 워크플로우를 제어·수정할 수 없는 상태였습니다. 이번 PR은 워크플로우 그래프 기반 실행 엔진(Engine v2) 정규화, `/resume` 동시성 충돌 방어, 환경 변수 파싱 안전 폴백, 파일 I/O 예외 처리 강화, 실패 노드 시각화 및 Retry 유도 UX를 통해 **"보기만 하는 대시보드"에서 "직접 제어·수정 가능한 운영 플랫폼"으로 전환하는 기반**을 마련합니다.

---

## What Changed

### [P0] 워크플로우 엔진 안정성 및 동시성 처리

| 영역 | 변경 내용 |
|------|-----------|
| `api/app/api/workflows.py` | `/resume` 엔드포인트에 비동기 락(`asyncio.Lock`) 적용. 동시 요청 시 `409 Conflict` 또는 `200 OK` 반환으로 상태 경합 제거 |
| `api/app/services/workflow_engine.py` | 그래프 정규화(DAG 기반 실행) 적용, 파일 I/O 및 시스템 예외 발생 시 프로세스 크래시 방지 및 `Run`/`NodeRun` 상태를 `failed`로 안전하게 DB 커밋 |
| `api/app/core/config.py` | `DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS` 등 환경 변수 파싱 시 특수문자·빈 문자열 입력에 대한 포괄적 예외 처리 및 안전한 기본값 폴백 로직 추가. 포트 충돌 방어 폴백 로직 수정 |
| `api/app/services/workspace.py` | 파일 읽기/쓰기 시 OS Lock 방어 로직 적용 및 `logging.error` 기반 구조화 에러 로깅(런 ID, 노드 ID, 스택 포함) 추가 |

### [P0] 대시보드 UI 상태 시각화 및 UX

| 영역 | 변경 내용 |
|------|-----------|
| `web/src/` (ReactFlow 노드 컴포넌트) | `failed` 상태 노드에 `#EF4444` 계열 붉은색 테두리·배경 강조 렌더링 적용 (디자인 시스템 `color.status.failed` 토큰 준수) |
| 대시보드 Banner/Toast | 노드 실패 전이 시 에러 알림과 함께 "Retry Node" 즉시 실행 액션 버튼 노출, 사용자 재시도 유도 UX 구현 |

### [P0] 테스트 커버리지 확충

- **Unit Test:** `config.py` 설정 파싱 엣지 케이스(극단 특수문자, 빈 문자열) 검증
- **Integration Test:** 포트 3100 환경에서 50개 비동기 동시 요청 `/resume` 멱등성 검증, 예외 시 `failed` 상태 DB 커밋 검증
- **E2E Test:** 아티팩트 손상 발생 후 대시보드 노드 다이어그램 에러 상태(붉은색) 렌더링 확인

---

## Test Results

| 테스트 유형 | 대상 | 결과 |
|------------|------|------|
| Unit | `config.py` 환경 변수 파싱 엣지 케이스 | PASS |
| Integration | `/resume` 50개 동시 요청 (포트 3100) | 전원 `200 OK` 또는 `409 Conflict` 반환, 크래시 없음 |
| Integration | 파일 권한 예외 유발 시 `failed` 상태 DB 커밋 | PASS (백그라운드 프로세스 생존 확인) |
| Integration | 잘못된 `DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS` 주입 후 API 기동 | 기본값으로 정상 기동 확인 |
| E2E | 아티팩트 손상 후 대시보드 노드 렌더링 | `failed` 붉은색 렌더링 정상 확인 |
| 시각 검증 | "Retry Node" 액션 버튼 노출 조건 | 노드 실패 전이 즉시 표시 확인 |

---

## Risks / Follow-ups

### 잔존 리스크

- **동시성 락 데드락 잠재 위험:** 현재 `asyncio.Lock` 기반 단일 인스턴스 적용이므로, 멀티 워커 환경(수평 확장 시) DB 수준 분산 락으로의 전환이 필요합니다.
- **파일 I/O 무음 처리 완전 제거 미확인:** 모든 경로에 대한 예외 핸들러 적용 여부를 추가 감사 필요.
- **LLM 호출 루프 비용 폭주:** Autopilot 장기 실행 시 루프 탐지 및 예산(budget) 제한 로직이 아직 미구현 상태입니다.

### 후속 작업 (Follow-ups)

| 우선순위 | 항목 | 설명 |
|----------|------|------|
| P1 | Workflow Engine v2 완성 | `workflow_id` 기반 완전한 DAG 실행, `ExecutorRegistry`, `node_runs` 기록 체계 |
| P1 | Autopilot Control Plane | 지시 주입(Instruction Inbox), `cancel`/`pause`/`resume` 표준화, 장기 실행 체크포인트 |
| P1 | Agent SDK 표준화 | Agent Spec 버전 관리, CLI 어댑터 표준화, 폴백 정책 |
| P2 | Artifact Workspace | 산출물 1급 데이터화, object store 연동, 타임라인 검색 |
| P2 | Visual Workflow Builder | ReactFlow 기반 워크플로우 편집·검증·버전 관리 UI |
| P2 | Integrations & Event Bus | PR/CI/Deploy 이벤트 연결, 룰 엔진, outbox 기반 재처리 |

---

Closes #69
```

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
