## Summary

이슈 [#67 [초장기] 초고도화 방안 및 지속적인 확장가능성을 가진 프로그램으로 개발하는 목표 전략]에 따라, gift MVP를 기반으로 **DevFlow Agent Hub**의 초장기 확장 설계를 문서화하고, 현재 코드베이스에서 발견된 핵심 안정성·보안 결함을 수정하였습니다.

구체적으로는 ① Workflow Engine v2 / Human Gate / Visual Builder / Artifact Workspace / Agent SDK / Dev Integrations 6개 확장 아이디어의 아키텍처 설계서(SPEC) 작성, ② 플래너가 도출한 P0~P2 우선순위 작업 목록(PLAN) 확정, ③ 기능·보안·테스트 갭 리뷰(REVIEW) 정리, ④ 다크 테마 기반 디자인 시스템(DESIGN\_SYSTEM) 정의를 완료하였으며, 리뷰에서 즉시 수정이 필요하다고 판단된 **SSE 클라이언트 IP 신뢰 프록시 검증 로직 및 스트림 연결 카운터 스레드 안전성** 버그를 코드 레벨에서 수정하였습니다.

---

## What Changed

### 문서 (설계·계획·리뷰·디자인)

| 파일 | 내용 |
|---|---|
| `SPEC.md` | DevFlow 6대 확장 아이디어(A~F) 상세 아키텍처 및 API/DB 스키마, 통합 아키텍처 다이어그램, 로드맵·비용 추정 포함 |
| `PLAN.md` | P0(핵심 안정성), P1(테스트·신뢰성), P2(UX 고도화) 3단계 우선순위 작업 목록, MVP 범위, 완료 기준, 리스크·테스트 전략 |
| `REVIEW.md` | 기능 버그 3건, 보안 취약점 2건, 테스트 공백 3건, 엣지케이스 3건 식별 및 TODO 체크리스트 작성 |
| `DESIGN_SYSTEM.md` | 정보 계층, 다크 컬러 토큰(Foundation + Semantic status), 간격 척도, 타이포그래피, 반응형 규칙, 컴포넌트 가이드, WOW Point(`Live Run Constellation`) 정의 |

### 코드 수정

- **SSE 클라이언트 IP 추출 시 신뢰된 프록시 검증 로직 추가**
  - 기존: `X-Forwarded-For` 헤더를 무조건 신뢰하여 IP 스푸핑 가능
  - 변경: 설정된 신뢰 프록시 목록(`TRUSTED_PROXIES`)에 포함된 요청에서만 헤더를 수용, 그 외에는 직접 연결 IP 사용

- **스트림 연결 카운터 스레드 안전성 수정**
  - 기존: `active_stream_connections`를 단순 정수로 관리하여 동시 연결/해제 시 race condition 발생 가능
  - 변경: `threading.Lock` 기반 원자적 증감으로 카운터 일관성 보장

---

## Test Results

| 항목 | 결과 |
|---|---|
| SSE 연결 카운터 누수 재현 스크립트 (다중 연결/강제 종료 반복) | 수정 전 카운터 오차 확인 → 수정 후 정상 반환 확인 |
| 신뢰 프록시 외 IP에서 위조 `X-Forwarded-For` 헤더 요청 | 수정 후 위조 IP 무시, 실제 연결 IP로 올바르게 추출 확인 |
| 신뢰 프록시 IP에서 정상 `X-Forwarded-For` 헤더 요청 | 헤더 값 정상 추출 확인 |
| 기존 SSE 엔드포인트 정상 동작 (단일 연결/해제) | 기존 동작 유지 확인 |

> Webhook HMAC 서명 단위 테스트, Workflow Builder E2E (Playwright, 포트 3100), Toast 큐잉 스케줄러 단위 테스트, Human Gate 통합 테스트는 후속 이슈에서 추가 예정입니다 (PLAN.md P1 항목 참조).

---

## Risks / Follow-ups

### 잔존 리스크

- **Visual Workflow Builder 프론트-백엔드 페이로드 불일치**: ReactFlow 캔버스 데이터 구조와 `validate_workflow` API 규격이 아직 불일치 상태로, 저장/드라이런 시 데이터 누락 위험 존재 (PLAN P0)
- **Toast 알림 폭주 및 음수 `durationMs` 버그**: 워크플로우 실패 폭주 시 UI 가림 및 소멸 불가 상황 미해결 (PLAN P0)
- **Human Gate 권한 검증 미완**: 승인/재개 API에 대한 권한 체크 로직 미구현 (PLAN P0)
- **대용량 아티팩트 렌더링**: 수십 MB 로그·스크린샷 청크 로딩 미적용으로 브라우저 크래시 위험 잔존 (PLAN P2)

### 후속 작업

| 우선순위 | 작업 |
|---|---|
| P0 | Toast 큐잉 스케줄러 + `durationMs` 방어 로직 구현 |
| P0 | ReactFlow ↔ `validate_workflow` 페이로드 동기화 및 저장 연동 |
| P0 | Human Gate Approve/Resume API 권한 검증 추가 |
| P1 | Webhook HMAC 단위 테스트 작성 (401/403 응답 검증) |
| P1 | Playwright E2E 스크립트 작성 (포트 3100, 드래그·순환 연결·드라이런) |
| P1 | SSE 부하 테스트 스크립트 CI 통합 |
| P2 | 대용량 아티팩트 뷰어 Chunk loading 적용 |

---

Closes #67

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
