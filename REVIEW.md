# REVIEW

## Functional bugs
- **DAG Fallback 예외 처리 오류**: `api/app/services/workflow_engine.py` 내부 `_build_predecessors` 함수에서 엣지가 없는 독립 노드 배치 시, 병렬 실행 처리 또는 그래프 검증 단계에서 사전 차단해야 하나 강제적으로 순차 실행으로 Fallback되는 기능적 결함이 있습니다.

## Security concerns
- **Webhook `workflow_id` 검증 미흡 (Silent Fail)**: `api/app/api/webhooks.py`의 웹훅 수신부에서 잘못된 포맷의 `workflow_id`가 수신되었을 때, 명시적인 에러 반환 없이 요청을 무시하는 현상이 있습니다. 보안 및 시스템 예측성을 높이기 위해 HTTP `422 Unprocessable Entity` 에러를 명확히 반환해야 합니다.
- **Human Gate 인가(Authorization) 로직 부족**: `api/app/api/workflows.py` 및 관련 서비스의 승인 처리 엔드포인트가 단순 토큰 검증에 그치고 있습니다. 권한 없는 사용자의 불법적인 승인 조작을 방지하기 위해 사용자 Role(예: reviewer, admin) 및 워크스페이스 권한을 대조하는 세밀한 인가 로직 구현이 시급합니다.

## Missing tests / weak test coverage
- **Frontend Human Gate E2E 통합 테스트 누락**: 대시보드 상에서 Human Gate 노드가 실행 대기(Pending) 상태에 진입하고, 사용자의 승인/반려 조작에 의해 파이프라인이 재개(Resume)되는 전체 흐름을 검증하는 Playwright E2E 시나리오 테스트가 부족합니다. (재현 및 테스트 실행 환경 구성 시 프론트엔드 포트는 `3100`, 백엔드 API는 `3101` 포트를 활용합니다.)
- **Backend 헬스체크 및 DLQ 통합 테스트 미흡**: 백엔드 워커의 상태 기반 헬스체크 추적 및 Dead Letter Queue(DLQ) 에러 복원 처리에 관한 단위 테스트와 스트레스 테스트 커버리지가 부족합니다.

## Edge cases
- **SSE 커넥션 레이스 컨디션 (Zombie Connection 방지)**: 워크플로우 강제 취소 시, 기존에 연결된 서버-클라이언트 간 스트림 제너레이터 연결 풀이 즉각적으로 클리어되지 않아 Zombie Connection으로 남을 수 있는 엣지 케이스가 존재합니다. 다중 클라이언트 환경에서의 일관성 동기화 및 엣지 케이스 안정성을 위해 스트리밍 연결 해제 로직 보완이 필요합니다.

---

## TODO
- [ ] `api/app/services/workflow_engine.py` 파일 내 DAG Fallback 로직 수정 (독립 노드 강제 순차 실행 제거)
- [ ] `api/app/api/webhooks.py` 웹훅 수신부에서 잘못된 `workflow_id` 요청에 대해 HTTP 422 에러 응답 로직 추가
- [ ] `api/app/api/workflows.py` 내 Human Gate 승인 엔드포인트에 Role/Workspace 기반 인가(Authorization) 로직 반영
- [ ] `web/tests/e2e/` 디렉토리에 대시보드 Human Gate 승인/재개 플로우에 대한 Playwright E2E 테스트 작성
- [ ] `api/tests/` 디렉토리에 워커 헬스체크 상태 및 DLQ 복원 로직에 대한 백엔드 통합/스트레스 테스트 보강
- [ ] 워크플로우 취소 시 SSE 커넥션 풀이 즉시 해제되도록 연결 관리 로직 보완
- [ ] 로컬 실행 가이드 포트 수정 (프론트엔드: `3100`, 백엔드 API: `3101`) 및 연동 테스트 점검
