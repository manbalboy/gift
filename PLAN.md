# PLAN

## 1. Task breakdown with priority

| Priority | Task | Description | Target Files / Scope |
| --- | --- | --- | --- |
| P0 | CORS 보안 강화 | 인가된 Origin(`manbalboy.com`, `localhost`, `127.0.0.1`) 접근 제어 적용 | `api/app/main.py`, `api/app/core/config.py` |
| P0 | XSS 취약점 대응 | `<SafeArtifactViewer />` 모듈화 및 DOM 살균(Sanitization) 처리 | `web/src/components/SafeArtifactViewer.tsx`, `web/src/utils/sanitize.ts` |
| P0 | API 멱등성 보장 | 휴먼 게이트(승인/거절) 중복/동시 요청 차단 로직 구현 | `api/app/api/workflows.py`, `api/app/services/human_gate_audit.py` |
| P1 | SSE 통신 안정화 | 서버 측 Keep-Alive 핑 추가 및 클라이언트의 자동 재연결/복구 로직 | `api/app/main.py`, `web/src/hooks/useSSE.ts` |
| P1 | 장기 대기 추적 스케줄러 | 24시간 이상 지연된 워크플로우 감지 백엔드 스케줄러 구현 | `api/app/services/human_gate_audit.py` |
| P2 | Audit Log 타임존 동기화 | 날짜 필터링 요청 시 클라이언트의 타임존 오프셋 파라미터 전달 | `web/src/components/AuditLog.tsx`, `api/app/api/workflows.py` |
| P2 | 품질 검증 (테스트) | UI E2E 테스트 보강 및 스케줄러 Time Mocking 단위 테스트 작성 | `web/tests/e2e/audit_log.spec.ts`, `api/tests/test_human_gate.py` |

## 2. MVP scope / out-of-scope

**MVP Scope:**
- `manbalboy.com` 및 로컬 개발 환경용 CORS 정책 적용.
- `SafeArtifactViewer` 컴포넌트를 통한 아티팩트의 안전한 렌더링(XSS 방어).
- 승인/수정/거절 등 Human Gate 상태 변경 API의 멱등성(Idempotency) 확보.
- Nginx 등 리버스 프록시 환경에서도 끊김 없는 SSE 통신(Keep-Alive 핑, 클라이언트 이벤트 자동 복구).
- Audit Log 날짜 필터링 시 클라이언트 타임존 오프셋 반영.
- 24시간 이상 처리되지 않은 승인 대기 워크플로우를 감지하는 백엔드 스케줄러 도입.

**Out-of-scope:**
- 감지된 장기 대기 워크플로우를 슬랙(Slack), 이메일 등 외부 채널로 실시간 알림 전송 기능 (추후 확장에 포함).
- N8N 스타일의 완전한 시각적 워크플로우 빌더(ReactFlow 기반 UI) 고도화 (현재는 엔진 안정성과 상태 관리에 집중).

## 3. Completion criteria

- [ ] 비인가 Origin에서 백엔드 API 호출 시 HTTP 403 Forbidden 에러가 정상적으로 반환됨.
- [ ] XSS 페이로드가 포함된 마크다운 또는 HTML 텍스트가 대시보드에서 스크립트 실행 없이 안전하게 렌더링됨.
- [ ] 휴먼 게이트 승인 API로 동일한 요청을 매우 짧은 시간에 다중 발송하더라도, 단 1회의 처리만 수행되며 데이터 정합성이 유지됨.
- [ ] 네트워크 강제 단절 후 클라이언트가 SSE 스트림을 자동 재연결하며, 누락된 이벤트를 마지막 수신 ID 기준으로 복구함.
- [ ] 사용자의 기기 타임존이 변경되어도 날짜 지정 필터가 해당 타임존을 기준으로 정확하게 워크플로우를 검색함.
- [ ] 백엔드 단위 테스트에서 시간 모킹(Time Mocking)을 적용하여, 24시간 이상 경과한 데이터를 스케줄러가 오차 없이 식별하는지 검증 통과(Coverage 기준치 충족).
- [ ] `<SafeArtifactViewer />` 및 날짜 필터 UI에 대한 Playwright E2E 테스트가 정상 작동함.

## 4. Risks and test strategy

**Risks:**
- **SSE 연결 타임아웃**: 리버스 프록시(Nginx 등)의 `proxy_read_timeout` 설정과 백엔드 유휴 시간 설정이 충돌하여 스트림이 닫힐 위험.
- **Race Condition**: 다중 API 워커 환경에서 휴먼 게이트의 상태(Pending -> Approved/Rejected)를 동시에 변경하려 할 때 락(Lock) 충돌 발생 우려.
- **타임존 경계 오류**: 엣지 케이스 날짜 필터링 시 하루 단위 경계가 어긋나 검색 결과가 누락될 수 있는 문제.

**Test strategy:**
- **프론트엔드 테스트**: Playwright를 이용해 포트 `3000` 번대 로컬 개발 서버 환경에서 E2E 테스트 수행. 악의적인 아티팩트 데이터를 렌더링하고 DOM이 오염되지 않는지 점검.
- **백엔드 단위 테스트**: FastAPI의 `TestClient`와 Pytest를 기반으로 테스트. `freezegun` 라이브러리를 통해 시간을 24시간 뒤로 모킹하여 스케줄러가 해당 워크플로우를 반환하는지 검증. DB 레벨이나 분산 환경 락 메커니즘을 테스트하기 위한 동시성 호출 시뮬레이션 적용.
- **인프라 통합 테스트**: 로컬 Docker Compose Nginx 컨테이너 환경에서 네트워크를 인위적으로 지연, 차단시켜 프론트엔드의 SSE 자동 재연결 로직 정상 작동 여부 확인.

## 5. Design intent and style direction

- **기획 의도**: 워크플로우 기반 자동화 플랫폼(DevFlow)에서 승인, 대기, 로그 관측 과정의 투명성과 무결성을 극대화합니다. 사용자가 복잡한 기술적 문제를 몰라도 안전하게(Security) 신뢰할 수 있는(Reliability) 조작 경험을 제공하는 것이 핵심 메시지입니다.
- **디자인 풍**: 모던 대시보드형 (Modern Dashboard). 정보의 밀집도가 높지만 시스템의 실시간 상태와 보안 경고 등을 빠르고 명확하게 파악할 수 있는 플랫(Flat)하고 심플한 카드형 레이아웃을 사용합니다.
- **시각 원칙**:
  - **컬러**: 긍정(성공, 승인), 경고(대기, 오류), 중립(로그, 정보) 상태를 구별하는 명확한 Semantic Color 체계를 채택합니다.
  - **여백/간격**: 컴포넌트 간 일관된 8px/16px/24px 배수 마진과 패딩을 주어 가독성을 높입니다.
  - **타이포그래피**: 텍스트 데이터(로그, 아티팩트 본문)는 가독성을 위한 고정폭(Monospace) 폰트를 적용하고, 제목 및 컨트롤러는 깨끗한 Sans-serif를 사용합니다.
- **반응형 원칙**: 모바일 우선(Mobile First) 규칙에 따라 설계하되, 대시보드의 사용성을 위해 태블릿 및 데스크톱 환경(768px 이상)에서는 공간을 폭넓게 활용하는 좌우 스플릿 뷰(목록과 상세 화면 병치) 레이아웃으로 확장됩니다.

## 6. Technology ruleset

- **플랫폼 분류**: web, api
- **web (프론트엔드)**: React 기반 프레임워크 사용 (기존 구조를 준수하여 Vite + React + TypeScript + Playwright 환경 채택). 실행 가이드 및 프리뷰 포트는 `3000`번대(예: 3000) 포트를 할당.
- **api (백엔드)**: FastAPI 기반 계획 (Python 비동기 처리의 강점을 살려 SSE 구현 및 스케줄링 프로세스 연동). 실행 가이드 포트는 프론트엔드와 겹치지 않는 별도의 `3000`번대(예: 3001) 포트 할당. 데이터 정합성을 위한 트랜잭션 락 또는 Redis 분산 락 고려.
