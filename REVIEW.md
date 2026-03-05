# REVIEW

본 문서는 `SPEC.md` 및 `PLAN.md`에 정의된 요구사항과 현재 저장소에 구현된 상태를 비교·분석한 리뷰 결과입니다.

## Functional bugs

- **웹훅 시크릿의 프론트엔드 노출 (Critical)**: `web/src/services/api.ts` 코드 내에 `import.meta.env.VITE_WEBHOOK_SECRET`를 참조하는 부분이 존재합니다. Vite에서 `VITE_` 접두사가 붙은 환경 변수는 빌드 시 클라이언트 코드에 그대로 포함되므로, 웹훅 검증용 시크릿 키가 브라우저에 평문으로 노출되는 심각한 결함이 있습니다. 인증 토큰 및 시크릿은 백엔드에서만 관리되어야 합니다.
- **SSE 백그라운드 태스크 정리**: `api/app/api/workflows.py`에서 `asyncio.CancelledError`를 통한 SSE 제너레이터 안전 종료는 구현되었으나, 클라이언트 연결이 끊겼을 때 워크플로우를 관장하는 `workflow_engine` 내부의 워커 스레드나 비동기 태스크가 완벽히 정리(kill)되는지 엣지 케이스 확인이 필요합니다.

## Security concerns

- **정적 휴먼 게이트 승인 토큰**: 현재 휴먼 게이트 API(승인/반려)가 `settings.human_gate_approver_token`이라는 단일 정적 토큰에 의존하고 있습니다. 환경 변수가 탈취될 경우, 전체 워크스페이스의 승인 권한이 넘어갈 위험이 있습니다. 토큰 로테이션 기능이나 사용자 세션 기반의 JWT 인증 체계로의 전환을 고려해야 합니다.
- **CORS 정책 검증 강화**: `SPEC.md`에 명시된 CORS 허용 도메인(`*.manbalboy.com` 및 `localhost`)이 FastAPI의 CORS 미들웨어에 엄격하게 적용되었는지 확인해야 합니다. 와일드카드(`*`)가 포함되어 있다면 보안 취약점이 될 수 있습니다.

## Missing tests / weak test coverage

- **동시성 트랜잭션 Lock 강도 테스트**: `_handle_human_gate_decision`에 애플리케이션 레벨의 Lock(`lock_provider`)이 적용되어 있으나, 다수의 DB 트랜잭션이 물리적으로 동시에 업데이트를 시도할 때(Row-level Lock 및 데드락 방지)를 가정한 고부하(Stress) 통합 테스트가 부족합니다.
- **네트워크 단절 E2E 테스트**: `Playwright` 테스트(`human-gate.spec.ts`)에서 모달 및 기능 동작은 검증하고 있으나, 브라우저의 오프라인 모드 전환 후 복구 시 Jitter가 적용된 지수적 백오프 로직에 따라 재연결 배너가 올바르게 렌더링되는지 네트워크 상태 제어 테스트가 추가되어야 합니다.
- **Audit Log 조회 엣지 테스트**: 감사 로그(Audit Log)가 무한정 쌓였을 경우의 Pagination 처리나 대량 데이터 응답 시의 성능 저하를 검증하는 테스트 커버리지가 필요합니다.

## Edge cases

- **멱등성(Idempotency) 처리**: 휴먼 게이트 승인 API 호출 시, 네트워크 지연으로 인해 클라이언트가 동일한 승인 요청을 여러 번 재시도할 수 있습니다. 현재 로직은 상태가 `approval_pending`이 아닐 경우 `409 Conflict`를 반환하는데, 이미 성공적으로 승인된 동일 주체의 중복 요청일 경우 오류 대신 멱등하게 성공(200) 처리하는 편이 클라이언트 UX 측면에서 더 안정적일 수 있습니다.
- **단일 노드 워크플로우 (No Edges)**: 연결된 엣지가 전혀 없는 단일 노드로만 구성된 DAG 실행 시, 노드 1개 실행 직후 워크플로우 상태가 즉시 `done`으로 안전하게 전이되는지 추가 확인이 필요합니다.
- **서버 재기동 시 초기 로딩 집중(Thundering Herd)**: SSE 재연결에 Jitter 백오프를 적용해 Thundering Herd를 완화했지만, 백엔드 서버가 다운되었다가 복구되는 시점에 다수의 클라이언트가 동시에 새로고침을 누르거나 초기 접속을 시도할 때 발생하는 부하에 대한 대비(서버단 Rate Limiting 등)도 고려해야 합니다.

---

## TODO Checklist

- [ ] `web/src/services/api.ts` 등 프론트엔드 코드에서 `VITE_WEBHOOK_SECRET` 참조를 제거하고, 클라이언트 노출 시크릿 보안 취약점 해결.
- [ ] 휴먼 게이트 승인/반려 처리 시, 이미 처리된 본인의 중복 요청에 대해 `409` 예외 대신 멱등성(Idempotency)을 보장하여 정상 응답하도록 API 로직 개선.
- [ ] 프론트엔드 Playwright E2E 테스트에 `browserContext.setOffline(true/false)`를 활용한 네트워크 단절 및 재연결 배너 UI 동작 테스트 케이스 추가.
- [ ] API 반환 시 대량의 Audit Log 데이터 처리를 위한 Pagination 로직 적용 및 관련 백엔드 단위 테스트 보강.
- [ ] `workflow_engine` 내부에서 단일 노드 워크플로우(엣지 없음) 실행 시 완료 후 즉각적인 `done` 종료 처리가 이루어지는지 점검 및 보완.
