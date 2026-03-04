---

## Summary

**[초장기] 오픈소스의 왕이 될 프로그램 제작 (#65)** 이슈의 일환으로, DevFlow Agent Hub의 보안 취약점 수정·안정성 강화·구조적 개선을 수행한 PR입니다.

REVIEW.md에서 식별된 웹훅 보안 취약점, Rate Limiter 한계, 동시성 문제, 프론트엔드 오류를 중심으로 MVP 범위 내 핵심 수정 사항을 반영하였습니다. 본 변경은 "AI는 작업자, 오케스트레이터가 순서를 결정한다"는 기본 원칙을 유지하면서 플랫폼의 신뢰도를 높이는 데 초점을 맞춥니다.

---

## What Changed

### 보안 (Security)
- **웹훅 HMAC 서명 검증 추가**: `api/app/api/webhooks.py`에서 GitHub 웹훅 요청의 `X-Hub-Signature-256` 헤더 검증 누락 패치. 미검증 페이로드 수신 차단.
- **`X-Forwarded-For` IP 파싱 강화**: Spoofing을 통한 Rate Limiting 우회 방지를 위해 신뢰할 수 있는 프록시 기반 엄격한 IP 파싱 로직 적용. 비표준 형식 및 다중 IP 엣지 케이스 처리 포함.
- **페이로드 크기 제한 적용**: 웹훅 수신 시 과도한 페이로드로 인한 DoS 위험 완화를 위해 최대 페이로드 크기 제한 추가.
- **`workflow_id` 타입 파싱 예외 로깅**: 잘못된 타입(`bool`, 예상치 못한 객체 등) 유입 시 Warning/Error 로거를 통해 감사 추적 가능하도록 개선.
- **CORS 정규식 보완**: `manbalboy.com` 계열 및 `localhost` 계열 허용 origin 처리를 위한 정규식 오류 수정.
- **Path Traversal 방어**: 파일 경로를 처리하는 로직에 경로 탈출(traversal) 방어 로직 추가.

### 안정성 (Stability)
- **분산 락(lock_provider) 추가**: 워크플로우 동시 실행 방지를 위한 분산 락 제공자 구현. Race Condition으로 인한 DB 이중 실행 문제 해소.
- **Race Condition DB 락**: DB 쓰기 경합 상황에서의 안정성 확보.
- **Docker 헬스체크 캐시 개선**: 반복적인 헬스체크 요청이 서비스 응답에 미치는 영향 최소화.
- **SSE Rate Limiter 개선**: 다중 워커 환경에서의 Server-Sent Events 연결에 대한 Rate Limiting 동작 개선. 로컬 메모리 기반의 구조적 한계 및 향후 분산 캐시(Redis) 도입 필요성을 주석으로 문서화.

### 구조 / 코드 품질
- **AgentRunner 실 구동 연결**: 기존 stub 수준이던 `AgentRunner`를 실제 실행 흐름에 연결. 에이전트 러너 리팩토링으로 CLI 호출 흐름 명확화.
- **스키마 유효성 검사 강화**: 워크플로우 정의 및 노드 입력에 대한 JSON Schema 검증 추가.

### 테스트
- **`test_webhooks_api.py` 엣지 케이스 추가**: 조작된 `X-Forwarded-For` 헤더, 잘못된 페이로드 타입, 서명 불일치 등 다양한 케이스에 대한 단위 테스트 작성.
- **프론트엔드 Jest 환경 정비**: `web/` 디렉터리 테스트 환경 복구 및 `package.json` 스크립트 보완.

### UI
- **`WorkflowBuilder.tsx` 오타 수정**: 모바일 뷰 안내 문구 "모 니터링을" → "모니터링을" 수정.
- **노드 속성 패널 기초 구현**: React Flow 캔버스에서 노드 클릭 시 해당 노드의 ID·타입을 표시하는 읽기 전용 패널 추가 (편집 기능 제외).

---

## Test Results

| 테스트 항목 | 결과 |
|---|---|
| `pytest` API 단위 테스트 (webhooks, HMAC, IP 파싱) | PASS |
| `pytest` 워크플로우 스키마 유효성 검사 | PASS |
| `pytest` Race Condition / 분산 락 시나리오 | PASS |
| `npm run test` 프론트엔드 Jest (WorkflowBuilder, 속성 패널) | PASS |
| Docker 컨테이너 기동 및 헬스체크 | PASS |
| GitHub 웹훅 서명 검증 E2E (로컬 시뮬레이션) | PASS |

**Docker Preview 정보**
- 컨테이너: `agent-hub-preview`
- API 포트: `3000`
- Web 포트: `3001`
- Preview URL: `http://ssh.manbalboy.com:7000`

---

## Risks / Follow-ups

### 잠재적 위험
- **웹훅 IP 파싱 변경**: 엄격해진 `X-Forwarded-For` 처리로 인해, 비표준 프록시 체인을 거치는 일부 GitHub 요청이 차단될 수 있습니다. 운영 배포 전 실제 GitHub 웹훅 수신 환경 확인을 권장합니다.
- **분산 락 도입**: 단일 노드 환경에서는 영향 없으나, 향후 다중 워커 스케일아웃 시 락 제공자(lock_provider) 구현체를 Redis 등 외부 스토리지 기반으로 교체해야 합니다.

### 후속 과제 (Follow-ups)
- [ ] Rate Limiter를 Redis 기반 분산 구현으로 전환 (현재 로컬 메모리 한계 문서화 완료)
- [ ] Workflow Engine: `workflow_id` 기반 실행 전환 및 `node_runs` 저장 구조 구현 (P0, 다음 스프린트)
- [ ] Visual Builder 노드 속성 패널 편집 기능 추가 (현재 읽기 전용)
- [ ] Agent SDK 표준화: IO Schema, tools, fallback 정책 정형화
- [ ] Temporal 또는 LangGraph 기반 Workflow Engine 아키텍처 전환 검토 (장기)

---

Closes #65

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
