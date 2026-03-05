# REVIEW

## Functional bugs
- **`resume` 동작의 멱등성 및 HTTP 상태 코드 불일치**: 
  다중 `resume` 요청을 동시에 보낼 때(예: `POST http://localhost:3100/api/runs/1/resume` 동시 4회 호출), 첫 번째 요청이 성공하여 상태를 `running`으로 변경한 후 두 번째 요청이 락을 획득하면 `ValueError("run is not paused")`가 발생합니다. 현재 `api/workflows.py`에서는 이 예외를 `400 Bad Request`로 처리하고 있으나, 테스트 코드(`test_resume_run_concurrent_requests_are_idempotent`)에서는 `409 Conflict`로 기대하거나 무시되어 넘어가는 불일치가 있습니다. 상태가 이미 `running`으로 변경되었으므로 클라이언트 관점의 멱등성을 위해 `200 OK`를 반환하거나, 적절한 상태 모델을 응답하도록 수정이 필요합니다.
- **Graceful Failure 시 클라이언트 응답 오해**:
  `paused` 워크플로우를 재개할 때 런타임 아티팩트 유실 등으로 인해 실패 처리 로직을 타면, 데이터베이스에는 런과 노드의 상태가 `failed`로 정상 변경 및 커밋됩니다. 하지만 `ValueError`를 던져 API 응답으로는 `400 Bad Request`가 반환됩니다. 클라이언트는 서버에서 로직 처리에 실패하여 상태가 이전으로 롤백되었다고 오해할 수 있습니다. 상태가 명시적으로 변경(전이)되었다면 에러 코드가 아닌, 업데이트된 상태 객체와 함께 반환하도록 수정해야 합니다.

## Security concerns
- **X-Forwarded-For 헤더 및 스푸핑 가드 우회 가능성**:
  `DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS` 설정을 통해 로컬호스트(예: `3100-3199`) 포트에 대한 스푸핑 방어는 적용되었으나, Nginx 등 앞단 리버스 프록시에서 `X-Forwarded-For` 헤더를 조작해 유입되는 요청을 엄격하게 재할당하거나 필터링하지 않으면 우회될 잠재적 우려가 있습니다.
- **CLI Runner의 샌드박싱 제어 (Engine v2)**:
  현재 `ExecutorRegistry` 기반으로 외부 스크립트나 AI가 작성한 커맨드를 실행할 때 완전한 시스템 격리가 이루어지지 않는다면 보안상 취약점이 발생할 수 있습니다. 시스템 자원 접근을 차단하는 Docker 기반의 샌드박스 실행 제어가 확실하게 적용되었는지 추가 점검이 필요합니다.

## Missing tests / weak test coverage
- **환경변수 파싱 실패 및 엣지 케이스 단위 테스트 부족**:
  `spoof_guard_ports`에 잘못된 형태의 문자열(예: `3100-3199,invalid`)이 주입되었을 때 서버가 크래시되지 않고 기본값을 쓰는지, 혹은 명시적으로 시작에 실패하는지 확인하는 파서(Parser) 단위 테스트 코드가 누락되었습니다.
- **Graceful Failure 이후 DB 상태 검증 부족**:
  데이터가 유실된 워크플로우 재개 시나리오 테스트(`test_resume_run_fails_gracefully_when_runtime_workspace_missing`)에서, API의 HTTP 상태 코드가 반환되는 것만 검증하고 있습니다. 에러 응답 후 DB를 재조회하여 실제 Workflow와 NodeRun 상태가 각각 `failed` 등으로 정확히 커밋되었는지 검증하는 Assertion 보강이 필요합니다.
- **Lock 해제 안정성에 대한 통합 테스트**:
  DB 트랜잭션 도중 데드락(Deadlock) 타임아웃 등 극단적 예외 상황이 발생했을 때 `finally` 블록의 락 해제 로직이 안전하게 실행되는지 검증하는 모킹(Mocking) 기반 커버리지가 부족합니다.

## Edge cases
- **초장기 실행 중 파일 시스템 잠금(Lock) 문제**:
  Autopilot 도입으로 장시간 방치되는 워크플로우가 재개될 때, 운영체제 백업 프로세스나 기타 프로세스로 인해 `runs/` 내부 아티팩트 디렉토리에 일시적인 읽기 전용 속성이나 파일 잠금이 걸릴 수 있습니다. 이로 인한 권한 에러(Permission Error)가 발생할 경우 Graceful Failure 로직이 정상 동작하지 않고 엔진 워커가 예외로 종료될 엣지 케이스가 존재합니다.
- **LLM 숨은 재시도 루프와 Budget 초과**:
  Agent SDK 표준화 과정에서 특정 에이전트 노드가 실패를 감지하고 자체 폴백(Fallback)을 무한히 반복할 가능성이 있습니다. 단순한 시간 기반 Budget 제약 외에도 동일한 Node가 예상 횟수를 초과하여 다시 스케줄링되는 현상을 탐지하고 차단하는 예산 제한 기능이 명확히 동작해야 합니다.

## TODO
- [ ] `api/app/api/workflows.py`의 `resume_run` 엔드포인트에서 멱등성에 위배되는 `ValueError("run is not paused")` 반환 시 `409` 또는 `200`으로 일관된 응답 코드 수정.
- [ ] Graceful Failure 로직으로 인해 런 상태가 `failed`로 변경 커밋된 경우, `400 Bad Request` 에러 대신 업데이트된 런타임 모델과 함께 정상적인 응답이 반환되도록 API 레벨 리팩토링.
- [ ] 잘못된 `DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS` 환경변수 주입 시 예외가 아닌 기본값을 할당하거나 명확하게 시스템을 종료하도록 설정 파서 테스트 케이스 보강.
- [ ] 에러를 검증하는 테스트 코드에서 API 에러 응답 확인 이후, DB 상의 모델 데이터 상태까지 검증하는 Assertion 구문 추가.
- [ ] 런타임 파일 잠금(OS Permission)에 대비하여 Workspace 디렉토리 아티팩트 검증 로직에 권한 예외를 포함한 포괄적인 오류 핸들링(try-except) 추가.
