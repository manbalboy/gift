# REVIEW

본 리뷰는 현재 저장소의 `SPEC.md`, `PLAN.md` 요구사항과 코드 상태 및 테스트 결과를 종합하여 분석한 결과입니다.

## Functional bugs
- **휴먼 게이트 상태 전이 버그**: 백엔드 테스트 환경에서 워크플로우 런(run)이 `human_gate` 노드 대기 상태에 진입했을 때, 런 상태가 `waiting`으로 변경되어야 하나 지속적으로 `queued` 상태에 머무는 문제가 확인되었습니다. (`test_workflow_api.py`의 `test_human_gate_approve_after_long_pending_resumes_run` 테스트 실패)
- **철회(Cancel) API 멱등성 결여**: 동일한 휴먼 게이트 승인 철회 요청을 중복으로 전송할 경우(`POST /api/approvals/{approval_id}/cancel`), 의도된 대로 상태 검증 후 `200 OK`를 반환하지 않고 `409 Conflict` 오류를 발생시키고 있습니다. 이로 인해 다중 클릭 상황에서 UI 에러를 유발합니다.
- **SSE(Server-Sent Events) 스트림 중복 생성**: 프론트엔드의 네트워크 연결 상태가 짧은 주기로 끊김과 연결을 반복(플래핑)할 때, 이전 `EventSource` 타이머가 해제되지 않고 다중 스트림이 생성되어 메모리 누수 및 네트워크 중복 요청을 유발하는 버그가 내재되어 있습니다.

## Security concerns
- **인증 토큰의 하드코딩 및 클라이언트 노출**: `web/vite.config.ts`, `web/src/services/api.ts` 등 프론트엔드 환경과 백엔드 `config.py`, `workflows.py`에 `VITE_HUMAN_GATE_APPROVER_TOKEN`이라는 보안 토큰이 하드코딩되어 있습니다. 이로 인해 빌드된 정적 산출물에 관리자 인증 토큰이 평문으로 노출되는 치명적인 보안 취약점이 존재하며, 즉각적인 동적 토큰 혹은 세션 기반 아키텍처로의 전환이 필요합니다.

## Missing tests / weak test coverage
- **Audit Log 조회 쿼리 테스트 부재**: 백엔드 API 기능 중 상태(`status`)와 날짜 범위(`date_range`)를 결합한 다형성 검색 필터가 정상 동작하는지 검증하는 유닛 테스트(`pytest` 내 Audit Log 필터 관련 케이스)가 누락되어 있습니다.
- **철회(Cancel) 흐름 E2E 테스트 누락**: 사용자가 대시보드 상에서 승인 대기 중인 항목을 철회하는 전체 UI 상호작용 및 API 호출 성공 후 UI가 초기 상태로 복원되는지 검증하는 Playwright E2E 테스트(`web/tests/e2e/human-gate.spec.ts`)가 작성되어 있지 않습니다.

## Edge cases
- **다중 클릭 및 동시성 요청**: 불안정한 네트워크 환경에서 사용자가 취소 혹은 승인 버튼을 연타할 경우를 고려해야 합니다. 상태가 이미 처리되었는데 추가적인 상태 변경 API가 인입되는 레이스 컨디션 방어를 더욱 견고히 하여 사용자에게 오도된 피드백을 주지 않아야 합니다.
- **오프라인 단절 상태 지속 후 복구**: 브라우저 오프라인 모드에서 온라인으로 복귀 시, 연결이 끊어진 시간 동안 백엔드에서 생성된 산출물(Artifact) 이벤트가 화면에 정상적으로 갱신되는지 유실 검증이 필요합니다. 재현 테스트 시 포트 충돌 방지를 위해 로컬 개발 서버 실행 시 프론트엔드는 `http://localhost:3100`, 백엔드 API는 `http://localhost:3101`과 같이 3100번대 포트를 할당하여 안전한 환경에서 네트워크 단절 시뮬레이션을 진행하는 것을 권장합니다.

---

## TODO
- [ ] `VITE_HUMAN_GATE_APPROVER_TOKEN` 환경변수 하드코딩 구조를 삭제하고, 클라이언트 빌드 산출물에 보안 토큰이 평문으로 노출되지 않는 동적 인증 파이프라인 적용
- [ ] 프론트엔드 네트워크 상태 훅(`useWorkflowRuns.ts`, `api.ts`)에 중복 SSE 스트림 생성 방지용 락(Lock) 추가 및 컴포넌트 언마운트 시 명시적인 `EventSource` 종료 코드 보강
- [ ] 백엔드 `POST /api/approvals/{approval_id}/cancel` 엔드포인트에 멱등성 보장 로직 적용 (이미 처리되었거나 취소된 상태에서는 예외 대신 `200 OK` 반환)
- [ ] 휴먼 게이트 진입 시 워크플로우 런이 `queued` 상태에 머무는 원인 수정 및 정상적인 `waiting` 상태로 전이되도록 백엔드 오케스트레이터 버그 픽스
- [ ] 백엔드 `test_workflow_api.py` 파일에 `status`와 `date_range` 쿼리 파라미터를 활용한 Audit Log 검색 필터링 검증 테스트 케이스 추가
- [ ] 프론트엔드 `web/tests/e2e/human-gate.spec.ts` 파일에 휴먼 게이트 승인 철회 액션에 대한 Playwright E2E 시나리오 작성
- [ ] (P2) 단순히 DB의 승인/반려 상태를 변경하는 것에 그치지 않고 휴먼 게이트 결정 이력과 사유를 `review.md` 혹은 `status.md`와 같은 표준 아티팩트 형태로 워크스페이스 내에 저장하는 로직 연동
- [ ] 백엔드 유닛 테스트 및 프론트엔드 E2E 테스트를 구동하여 수정된 모든 항목이 정상적으로 100% 통과(Pass)하는지 최종 점검 (3100번대 포트 환경 기준)
