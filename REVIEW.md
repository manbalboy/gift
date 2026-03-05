# REVIEW

## Functional bugs
- **Race Condition in Human Gate (Idempotency)**: `api/app/api/workflows.py`의 `approve_human_gate`, `reject_human_gate` 라우트에서 중복/동시 요청을 방지하기 위한 멱등성 검사 로직(`_is_idempotent_human_gate_decision`)이 존재하나, 다중 API 워커 환경에서 완벽한 동시성 제어(Lock)가 결여되어 있습니다. 두 요청이 정확히 동시에 도달할 경우, 둘 다 `node.status == "approval_pending"` 상태를 읽어 락 충돌이나 중복 처리(Race Condition)가 발생할 위험이 있습니다. `engine` 내부나 DB 레벨에서 `SELECT ... FOR UPDATE` 또는 Redis 분산 락 적용이 필요합니다.
- **Artifact Viewer HTML Escaping**: `web/src/utils/sanitize.ts`에서 단순히 HTML 엔티티를 이스케이프(`<`, `>`, `&` 등)하고 개행 문자를 `<br />`로 변환하고 있습니다. XSS 방어 측면에서는 동작하지만, 아티팩트가 마크다운(Markdown)이나 리치 텍스트 포맷일 경우 포맷팅이 깨지는 기능적 한계(단순 텍스트로만 렌더링)가 존재합니다.

## Security concerns
- **CORS 설정 제한**: `api/app/main.py`에 구현된 CORS 미들웨어와 Allow-origin 정규식은 `manbalboy.com` 및 로컬 환경(`127.0.0.1`, `localhost`)의 `3100-3199` 포트를 정확하게 허용하고 있어 보안 정책을 충족합니다.
- **XSS 살균(Sanitization)**: `SafeArtifactViewer`는 잠재적인 `<script>` 태그 실행을 효과적으로 막습니다. 제어 문자(Control characters) 제거 역치 정상적으로 구현되어 있어, 대시보드의 DOM 오염 가능성은 낮습니다. 
- **Session/Token 검증**: 휴먼 게이트의 세션 쿠키 검증 및 시그니처(`hmac`) 확인이 안전하게 구성되어 인가되지 않은 접근을 차단합니다.

## Missing tests / weak test coverage
- **스케줄러 Mocking 테스트 세분화**: `api/tests/test_human_gate.py` 내에 기본 동작 테스트는 포함되어 통과하였으나, 스케줄러(`scan_stale_human_gate_nodes`)가 24시간 경계를 정확히 식별하는지 엣지 케이스 단위 테스트 커버리지가 다소 모호합니다.
- **동시성(Race Condition) 시뮬레이션 테스트**: 다중 호출 시나리오에서 락(Lock) 충돌 및 데이터 정합성을 검증하는 인위적인 동시성 단위 테스트(Concurrency test)가 누락되어 있습니다.

## Edge cases
- **SSE Nginx 타임아웃 경계**: `settings.sse_heartbeat_interval_seconds`가 기본 15초로 설정되어 Keep-Alive 핑을 보냅니다. 배포 환경 리버스 프록시의 타임아웃 설정과 충돌하거나 네트워크 지터가 발생할 때 일시적인 스트림 단절이 일어날 엣지 케이스가 존재합니다. 클라이언트 재연결 및 `last-event-id` 기반 복구가 이를 방어하는 핵심입니다.
- **타임존 자정(Midnight) 경계 오류**: `_parse_audit_date_range_or_400`에서 클라이언트 타임존 오프셋을 반영하여 `today`를 계산할 때, 기준 엣지가 걸쳐 있는 특정 시간대 변경 구간(DST 등)에서는 일부 이벤트 검색이 누락될 가능성이 존재합니다.

---

## TODO checklist
- [ ] `api/app/api/workflows.py` 및 `engine` 로직 내 휴먼 게이트 승인/거절 시 DB 레벨 트랜잭션 락(`with_for_update()`) 또는 분산 락 추가 구현 (Race Condition 방지)
- [ ] `web/src/utils/sanitize.ts`의 단순 텍스트 이스케이프 방식을 보완하여, 안전하면서도 시각적인 마크다운/HTML 렌더링이 가능한 로직(`DOMPurify` 등 도입) 연동 검토
- [ ] `api/tests/test_human_gate.py`에 `freezegun`을 활용한 24시간 초과 식별 Mocking 테스트 보강
- [ ] 백엔드 동시성(Concurrency) 호출 단위 시뮬레이션 테스트 작성
- [ ] Nginx SSE 타임아웃(`proxy_read_timeout`) 및 백엔드 Heartbeat 인터벌 간의 호환성 점검
