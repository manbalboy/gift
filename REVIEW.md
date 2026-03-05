# REVIEW

## Functional bugs
- `api/app/api/workflows.py` 내 `resume` 엔드포인트에서 동일 조건으로 동시 요청이 발생할 경우 락 경합으로 인해 `400 Bad Request` 에러가 발생하는 멱등성(idempotency) 버그가 존재합니다. (예: `curl -X POST http://localhost:3100/api/runs/{id}/resume` 동시 다발적 요청 시). 이를 `409 Conflict` 또는 `200 OK`로 응답하도록 수정해야 합니다.
- 워크플로우 런타임 중 아티팩트 유실 등으로 인해 실패 상태(`failed`)로 전이될 때, 정상적으로 업데이트된 `Run` 상태 객체를 반환하지 않고 시스템 예외(`400 Bad Request`)를 던지는 문제가 있습니다.
- 프론트엔드 대시보드(React)에서 워크플로우 실패 시 상태 전이에 따른 `Failed` 노드 UI가 정상적으로 렌더링되지 않고, 단순히 에러 알림(Toast 등)으로만 처리되는 상태 처리 불일치 결함이 있습니다.

## Security concerns
- `DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS` 환경변수 주입 시 잘못된 문자열이나 특수문자가 들어올 경우 파서가 크래시될 수 있는 취약점이 있습니다. 예기치 않은 프로세스 종료를 막기 위해 안전한 기본값 할당 및 예외 처리가 필요합니다.
- 장기 실행 워크플로우(Autopilot) 과정에서 Workspace 디렉토리 내부 아티팩트에 접근할 때, 파일 시스템 권한(Permission) 문제나 OS Lock이 발생할 경우 런타임이 적절한 에러 핸들링 없이 크래시될 위험이 존재합니다. 이로 인해 좀비 프로세스가 발생하거나 시스템 자원이 누수될 수 있습니다.

## Missing tests / weak test coverage
- `config.py`의 `spoof_guard_ports` 파싱 로직과 관련하여, 유효하지 않은 입력이나 경계값에 대한 단위 테스트가 누락되어 있습니다.
- Graceful Failure 발생 시 API 응답만 검증하고 있으며, 실제 DB 테이블(`Run` 및 `NodeRun`)에 상태가 `failed`로 정확히 커밋되었는지 확인하는 통합 테스트의 어서션(Assertion)이 부족합니다.
- 동시성 문제 검증을 위해 다중 `resume` API 호출 시 멱등성을 테스트하는 비동기 통합 테스트 케이스가 누락되어 있습니다.
- 프론트엔드(UI) 환경에서 고의로 아티팩트를 손상시킨 뒤 `resume`을 수행했을 때, 노드가 정상적으로 `Failed` 상태 색상(Red)으로 렌더링되는지 확인하는 E2E 테스트가 부족합니다.

## Edge cases
- 사용자가 워크플로우를 중단(`pause`)한 상태에서 수동으로 워크스페이스 내 주요 아티팩트(예: 코드 파일, 스펙 문서 등)를 삭제하거나 수정했을 때, `resume` 시 파일 I/O 오류로 전체 시스템이 크래시되지 않고 우아하게 실패 상태로 전이되는지(Graceful Failure) 처리해야 합니다.
- 컨테이너나 로컬 환경에서 로컬 테스트를 진행할 때 지정된 포트(예: `3100`)를 이미 다른 프로세스가 점유 중일 경우, 명확한 에러 메시지와 함께 대체 포트 할당 또는 예외 처리가 이루어져야 합니다.

---

# TODO

- [ ] `api/app/api/workflows.py` 내 `resume` 엔드포인트 동시 호출 시 멱등성 보장 로직 구현 (`409` 또는 `200` 반환 처리)
- [ ] 워크플로우 실패 상태(`failed`) 전이 시, 에러 발생 대신 갱신된 `Run` 상태 모델을 반환하도록 예외 처리 리팩토링
- [ ] Workspace 디렉토리 아티팩트 접근 로직에 파일 잠금(OS Lock) 및 권한(Permission) 예외를 방어하는 포괄적인 `try-except` 핸들링 추가
- [ ] 환경변수 `DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS` 파싱 로직 안정화 (특수문자 및 유효하지 않은 입력 방어 및 기본값 적용)
- [ ] `config.py`의 포트 파싱 로직에 대한 경계값 및 예외 상황 단위 테스트(Unit Test) 작성
- [ ] `resume` 다중 동시 요청 시 멱등성 응답을 검증하는 비동기 통합 테스트 작성
- [ ] Graceful Failure 발생 시 DB(`Run`/`NodeRun`)에 `failed` 상태가 올바르게 커밋되었는지 검증하는 통합 테스트 어서션(Assertion) 추가
- [ ] 프론트엔드 대시보드 렌더링 수정: `failed` 상태 수신 시 에러 알림 대신 노드 다이어그램이 Failed 상태(Red)로 렌더링되도록 UI 보완
- [ ] React 대시보드 상에서 워크플로우 실패 및 상태 렌더링을 검증하기 위한 E2E 테스트 시나리오 구현
