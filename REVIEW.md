> [!IMPORTANT]
> 최우선 1차 목표: `ex-code` 내부 코드를 분석해 현재 프로젝트에 모든 기능을 구현한다.

# REVIEW

## Functional bugs

- **DAG Fallback (엣지 없는 그래프의 순차 실행 예외)**: `api/app/services/workflow_engine.py` 내 `_build_predecessors` 함수에서 노드 간 유효한 연결선(Edge)이 하나도 없을 경우(`valid_edge_count == 0`), 등록된 순서(`sequence`)를 기준으로 강제 순차 실행으로 Fallback 하도록 구현되어 있습니다. 이는 사용자가 시각적으로 노드들을 캔버스에 배치만 해두고 엣지를 명시적으로 연결하지 않았을 때 의도치 않은 순서로 파이프라인이 자동 전이될 수 있는 잠재적인 논리적 버그(Logical Bug)로 작용합니다. 엣지가 없는 노드는 병렬로 독립 실행되거나, 그래프 유효성 검사에서 실행을 차단하는 것이 명확한 설계에 부합합니다.

## Security concerns

- **Human Gate 인가(Authorization) 한계**: `PLAN.md`에는 "노드 승인(Approve)/반려(Reject) 요청 단계에서 파이프라인 조작을 시도하는 요청 주체의 실제 권한 유효성을 검증하는 인가 로직 추가"가 명시되어 있습니다. 백엔드 코드와 단위 테스트(`test_human_gate_approve_requires_token`)를 통해 인증 토큰(Authentication)의 유무는 방어되고 있으나, 해당 사용자가 실제로 이 워크플로우를 승인할 수 있는 권한(Role)이 있는지에 대한 세밀한 접근 제어(RBAC, 예를 들어 'reviewer' 또는 관리자 권한 확인)가 충분히 구현되어 있지 않습니다.
- **Webhook 메모리 고갈 및 DoS 방어**: 웹훅 수신부에서 `MAX_WEBHOOK_PAYLOAD_BYTES (5MB)`를 제한하고, 스트리밍 방식으로 청크를 누적하기 전에 IP 기반 Rate Limiter를 통과하도록 설계되어 있어 기본적인 메모리 고갈 공격은 방어됩니다. 하지만, 다수의 클라이언트가 커넥션만 맺고 고의적으로 매우 느린 속도로 데이터를 전송하는 Slowloris 공격에 취약할 수 있으므로 ASGI(Uvicorn) 혹은 리버스 프록시(Nginx) 레벨에서의 타임아웃 방어 설정 점검이 필요합니다.

## Missing tests / weak test coverage

- **Human Gate Workflow 통합 E2E UI 커버리지 누락**: 프론트엔드 Playwright 테스트 커버리지에 ReactFlow 노드 추가 및 순환 연결 검증, Toast 큐잉(3개 초과 대기) 로직은 잘 작성되어 있습니다. 그러나 휴먼 게이트 타입 노드에 의해 워크플로우가 승인 대기(Pending) 상태로 멈추고, 이후 사용자가 대시보드 인터페이스를 통해 승인(Approve) 또는 반려(Cancel)를 눌러 파이프라인(Resume)이 재개되는 가장 핵심적인 종단간 통합 E2E 시나리오 테스트가 누락되어 있습니다.
- **DLQ 및 상태 기반 워커 헬스체크 검증 누락**: `PLAN.md`의 고도화 항목에 명시된 "상태 기반 워커 헬스체크 및 DLQ 재할당" 로직에 대한 구체적인 실패 테스트(장애 발생 워커 스레드의 Task를 다른 가용 워커로 롤백 및 재할당) 코드가 백엔드 테스트 스위트에 존재하지 않습니다.

## Edge cases

- **잘못된 `workflow_id`의 묵시적 무시 (Silent Fail)**: 웹훅 처리 로직(`webhooks.py`)에서 `workflow_id`가 파싱 불가능한 잘못된 타입(예: 문자열 등)으로 들어올 경우, 로그 레벨에서 경고(warning_code)만 남기고 프로세스 자체는 성공(`HTTP 200 OK`)한 것처럼 처리되어 `WebhookEventOut`을 반환합니다. 이는 트리거를 요청한 외부 시스템(GitHub Actions, Jenkins 등) 입장에서는 CI 트리거가 정상 작동했다고 오판하게 만드는 Edge Case를 유발합니다.
- **SSE 커넥션과 상태 강제 취소 시 레이스 컨디션 (Race Condition)**: 다수의 클라이언트(다중 탭 등)가 동일한 `workflow_id`를 대상으로 SSE 스트림을 맺고 있을 때, 워크플로우 강제 취소를 요청하면 백엔드 워커 스레드는 `cancel_event`에 의해 즉각 종료되지만 스트림 제너레이터 연결 풀이 완전히 해제되기 전까지 프론트엔드 단에 일시적인 지연 상태(Zombie Connection)가 발생할 여지가 있습니다.

---

## TODO

- [ ] `workflow_engine.py` 내 `_build_predecessors` 함수의 유효 엣지 0개 시 순차 실행으로 강제 Fallback하는 로직을 제거하고, 독립 노드 병렬 실행 또는 검증 차단으로 변경할 것.
- [ ] Human Gate 승인 처리 엔드포인트에 단순히 토큰의 유효성을 검사하는 것을 넘어, 사용자의 Role 또는 워크스페이스 권한을 대조하는 세밀한 인가(Authorization) 로직을 추가할 것.
- [ ] 프론트엔드 대시보드 상에서 Human Gate 노드가 멈추고 사용자가 승인/취소 버튼을 클릭해 워크플로우 상태가 재개(Resume)되는 전체 Flow에 대한 Playwright E2E 테스트 시나리오를 추가할 것.
- [ ] 웹훅 수신부에서 `workflow_id`가 잘못된 포맷으로 전달되었을 때, 묵시적 무시(Silent Fail) 대신 `422 Unprocessable Entity` 에러를 명시적으로 반환하여 외부 CI/CD 시스템과 상태 동기화를 보장할 것.
- [ ] 워커 헬스체크 및 Dead Letter Queue(DLQ) 복원 처리에 관한 백엔드 통합/스트레스 테스트(pytest) 커버리지를 보강할 것.
