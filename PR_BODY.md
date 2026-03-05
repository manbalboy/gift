## Summary

이 PR은 이슈 #67 **[초장기] 초고도화 방안 및 지속적인 확장가능성을 가진 프로그램으로 개발하는 목표 전략**에 따라, 기존 `ex-code` 레포지토리를 분석하여 DevFlow Agent Hub를 **AI 개발 워크플로우 자동화 플랫폼**으로 고도화한 작업의 결과입니다.

핵심 방향은 두 가지입니다:
- **AI 실행은 CLI 방식 기본값 유지** (API 방식은 보조)
- **n8n과 차별화된 기능**으로 조직형 SDLC(이슈→계획→구현→리뷰→테스트→PR)를 노드/엣지 기반 워크플로우로 정의·실행·관측하는 플랫폼 완성

이번 커밋에서는 MVP 범위에 해당하는 **보안 통제, SSE 안정성, 휴먼 게이트 멱등성, 대시보드 관측성** 기반을 구축하였으며, `Human Gate` 세션 쿠키 기반 인증 및 승인/취소 요청 권한 검증 로직을 통합 완료하였습니다.

---

## What Changed

### Backend (FastAPI · 포트 3101)
- **CORS 엄격화**: `manbalboy.com`, `localhost`, `127.0.0.1` 계열 외 Origin 차단 정책 적용 및 검증
- **Human Gate 인증 통합**: 세션 쿠키 기반 인증 추가, 승인(`approve`) / 취소(`reject`) API에 요청자 권한 검증 로직 통합
- **멱등성(Idempotency) 보장**: 승인/수정/거절 API에 동시 중복 요청 방지 로직 추가 — 동일 상태 전환을 짧은 시간에 여러 번 요청해도 단 1회만 처리
- **SSE Keep-Alive Ping**: 장기 연결 타임아웃 방지를 위한 서버 측 Ping 전송 주기 설정
- **장기 대기 스케줄러**: 24시간 이상 `approval_pending` 상태가 지속되는 워크플로우를 탐지하여 알림 이벤트 생성

### Frontend (React/Vite · 포트 3100)
- **`<SafeArtifactViewer />` 컴포넌트 신설**: `status.md`, 아티팩트 텍스트 렌더링 시 DOM 살균(Sanitization) 파이프라인 캡슐화 — XSS 취약점 제거
- **SSE 자동 재연결 및 이벤트 복구**: 네트워크 단절 후 자동 재연결 시 누락 이벤트 동기화 로직 구현
- **Audit Log 필터링 개선**: 날짜 범위(`date_range`) 및 승인 상태 필터 추가, 클라이언트 타임존 오프셋을 API 파라미터로 전달하여 경계 날짜 누락 방지

### Design System
- 다크 테마(`#0B1020` 베이스) + 상태 시맨틱 색상 토큰(`success / running / waiting / failed / review_needed`) 적용
- 모바일 우선(Mobile-First) 반응형 레이아웃 구현 (sm: 0~767 / md: 768~1199 / lg: 1200+)
- 로그·코드 영역에 `JetBrains Mono / D2Coding` Mono 타이포그래피 적용

### Infra / Docker
- 포트 `7000~7099` 대역 Docker Preview 패키징 완료
- Nginx 리버스 프록시 컨테이너 구성 (SSE 장기 연결 지원)
- Preview 기준 도메인: `http://ssh.manbalboy.com:7000`

---

## Test Results

| 구분 | 테스트 항목 | 결과 |
|------|------------|------|
| **보안** | 미허가 Origin CORS 차단 확인 | ✅ 통과 |
| **보안** | XSS 취약점 스캔 (`<SafeArtifactViewer />`) | ✅ 통과 |
| **동시성** | Human Gate 동시 승인/거절 중복 요청 멱등성 | ✅ 통과 |
| **안정성** | Nginx 프록시 환경 SSE 1시간 연속 유지 | ✅ 통과 |
| **복원력** | 강제 네트워크 단절 후 재연결 + 이벤트 복구 | ✅ 통과 |
| **스케줄러** | Time Mocking으로 24h+ 대기 탐지 단위 테스트 | ✅ 통과 |
| **E2E (Playwright)** | Audit Log 날짜 필터링 / 상태 변경 / DOM 렌더링 | ✅ 통과 |
| **Docker Preview** | `http://ssh.manbalboy.com:7000` 정상 접근 | ✅ 통과 |

---

## Risks / Follow-ups

### 잔존 리스크

| 리스크 | 내용 | 완화 방안 |
|--------|------|----------|
| **Nginx 타임존 설정** | 컨테이너 타임존과 클라이언트 오프셋 불일치 시 Audit Log 경계 날짜 누락 가능성 | 클라이언트 TZ 오프셋을 쿼리 파라미터로 항상 명시; 백엔드에서 UTC 기준 정규화 |
| **SSE 심야 유휴 세션** | 이벤트 없는 구간에 Nginx가 유휴 연결을 강제 종료할 수 있음 | Keep-Alive Ping 주기를 Nginx `proxy_read_timeout`보다 짧게 설정 유지 |
| **Human Gate 멀티탭 경쟁** | 동일 사용자가 여러 탭에서 동시에 승인/거절을 시도할 경우 UI 상태 불일치 | 서버 측 DB 트랜잭션 락으로 1차 방어; 클라이언트에 결정 완료 후 읽기 전용 전환 |
| **LLM 호출 비용 초과** | Agent 실행 비용(토큰)이 budget을 초과할 경우 워크플로우 중단 | Phase 2(Agent SDK)에서 비용 budget 초과 시 Human Gate로 에스컬레이션 정책 도입 예정 |

### 후속 과제 (Out-of-scope → 다음 Phase)

- **Phase 1 — Workflow Engine v2**: `workflow_id` 기반 실행 전환, `ExecutorRegistry`, `node_runs` 저장, fallback(`default_linear_v1`) 구현 (3~6주)
- **Phase 2 — Agent SDK v1**: Agent Spec/버전/폴백 + CLI 어댑터 표준화 + 테스트 하네스 (2~4주)
- **Phase 3 — Postgres 이관**: `runs / node_runs / artifacts` 테이블 마이그레이션 + 검색 (2~3주)
- **Phase 5 — Visual Workflow Builder**: ReactFlow 기반 노드 편집기 + 프리뷰 런 (3~6주)
- **Phase 6 — Dev Integrations 확장**: PR/CI/Deploy 이벤트 버스, Idea→Deploy 폐루프 완성 (2~5주)

---

Closes #67

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
