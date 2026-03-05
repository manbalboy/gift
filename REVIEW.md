# REVIEW

## Functional bugs
- 휴먼 게이트 승인/반려(Approve/Reject) API에는 멱등성(Idempotency) 로직이 적용되어 동일 요청 시 중복 처리 없이 정상 응답(`200 OK`)을 반환하나, **휴먼 게이트 승인 대기 철회(Cancel) API**에는 멱등성이 누락되어 있습니다. 동일한 승인 대기 건에 대해 짧은 간격으로 철회 요청을 2회 이상 호출할 경우, 두 번째 요청에서는 노드 상태가 이미 `approval_pending`이 아니라는 이유로 `409 Conflict` 오류를 반환하는 버그가 있습니다.

## Security concerns
- 클라이언트 빌드 산출물에서 `VITE_WEBHOOK_SECRET` 노출 문제는 정상적으로 제거되었으나, API 요청 헤더에 삽입하기 위한 `VITE_HUMAN_GATE_APPROVER_TOKEN` 환경변수가 프론트엔드 코드(`web/src/services/api.ts`) 내부에 여전히 `import.meta.env` 형태로 하드코딩되어 주입되고 있습니다. 비록 MVP 범위 내에서 정적 토큰을 사용한다고 하더라도, 인가(Authorization)를 위한 비밀 토큰 값이 브라우저 측 번들에 노출되는 것은 중대한 보안 취약점이므로 서버 사이드 세션 혹은 다른 인증 토큰 발급 방식으로 구조를 변경해야 합니다.

## Missing tests / weak test coverage
- **프론트엔드 E2E 테스트 누락**: 휴먼 게이트 및 네트워크 오프라인 재연결에 대한 E2E 테스트는 Playwright에 작성되었으나, 새롭게 UI에 추가된 **휴먼 게이트 승인 대기 철회(Cancel) 기능**에 대한 E2E 테스트가 누락되어 있습니다. 사용자가 버튼을 클릭하여 성공적으로 철회가 이루어지고 UI가 다시 대기 상태로 복구되는지 검증하는 시나리오가 필요합니다.
- **백엔드 단위 테스트 부족**: 새롭게 도입된 Audit Log API(`GET /api/runs/{run_id}/human-gate-audits`)에 적용된 상태 필터(`status`) 및 날짜 필터(`date_range`) 쿼리 파라미터 조합을 검증하는 백엔드 단위 테스트(Unit test)가 충분하지 않습니다.

## Edge cases
- 네트워크 단절 및 재연결 상황(Offline/Online)에서 브라우저가 짧은 시간 내에 여러 번 상태를 전환(Flapping)할 경우, `web/src/services/api.ts` 내부의 SSE 스트림 자동 재연결(`subscribeWorkflowRuns`) 로직의 타이머가 꼬이면서 불필요한 백엔드 다중 연결(Multiple connections)을 시도할 가능성이 존재합니다.
- 로컬 환경 재현 시 충돌 방지를 위해 3100번대 포트(예: 프론트엔드 `http://localhost:3100`, API `http://localhost:3101`)를 사용하도록 설계되었으나, 일부 에러 메시지나 문서 가이드에 과거 포트나 하드코딩된 오리진이 남아있을 경우 CORS 오류나 타임아웃 엣지 케이스를 유발할 수 있습니다.

---

## TODO
- [ ] 프론트엔드 코드(`web/src/services/api.ts`) 내부의 `VITE_HUMAN_GATE_APPROVER_TOKEN` 하드코딩 의존성을 제거하고 보안을 강화할 수 있는 안전한 인증/인가 체계로 수정.
- [ ] 백엔드 `cancel_pending_approval` API (`POST /api/approvals/{approval_id}/cancel`)에 중복 호출 처리를 위한 멱등성(Idempotency) 로직 추가 (`409` 예외 발생 대신 상태 체크 후 `200 OK` 응답).
- [ ] 휴먼 게이트 승인 대기 철회(Cancel) 버튼 클릭 및 API 호출 흐름에 대한 Playwright 기반 프론트엔드 E2E 테스트 케이스 보강.
- [ ] Audit Log API의 `status` 및 `date_range` 필터링 쿼리 파라미터가 정확하게 동작하는지 검증하는 백엔드 `pytest` 케이스 추가.
- [ ] 재연결 빈도가 짧을 때 SSE 스트림(`EventSource`)의 타이머 해제 및 중복 생성 방지가 안정적으로 작동하는지 프론트엔드 로직 더블 체크.
