```markdown
## Summary

Self-Improvement Loop 엔진의 초안 설계 및 구현을 완료합니다.

AI가 아이디어를 입력받아 **코드 생성 → 테스트 → 품질 평가 → 개선**의 사이클을 24시간 자율 반복하는 Autonomous Developer 시스템의 핵심 아키텍처를 설계하고, 4대 코어 엔진(Analyzer / Evaluator / Improvement Planner / Executor)을 중심으로 한 MVP 구현체를 제공합니다. 아울러 리뷰에서 지적된 보안 취약점(XSS, CORS, RBAC 누락)과 기능 버그(SSE 중복 렌더링, Pause/Stop 명령 지연, 중복 변경 감지 오류)를 함께 수정합니다.

---

## What Changed

### 코어 엔진 구현 (Self-Improvement Loop)
- **Analyzer Engine**: 코드 구조·아키텍처·의존성·테스트 커버리지·복잡도 분석 파이프라인 구축
- **Evaluator Engine**: 분석 결과를 기반으로 Code Quality / Test Coverage / Security / Performance 등 다차원 품질 점수(Quality Score) 산출
- **Improvement Planner**: 평가 결과를 기반으로 Task List / Backlog / Refactor Plan 생성 및 상태 임계치 이탈 시 Webhook 알림(MVP) 발송
- **Executor Engine**: 코드 수정·테스트 생성·PR 생성 자동화 및 결과를 Analyzer로 피드백

### Long-Running Workflow 제어
- 루프 제어 API (`Start`, `Pause`, `Resume`, `Stop`, `Inject Instruction`) 구현
- Loop Stability 제어: `max_loop_count`, `budget_limit`, `duplicate_change_detection`, `quality_threshold` 설정 지원
- Long-term Memory DB 스키마 설계 (아키텍처 결정 사항, 버그 히스토리, 개선 이력, 성능 메트릭 저장)

### 버그 수정 (REVIEW 반영)
- **SSE 중복 렌더링**: Sequence ID 비교 로직 강화 — 재연결 시 클라이언트가 마지막 수신 ID 이후 이벤트만 수락하도록 처리
- **Pause/Stop 지연**: Executor Engine 스레드/프로세스에 Graceful Shutdown 신호 전파 로직 추가
- **중복 변경 감지 오류**: 공백·줄바꿈 정규화 후 diff 비교하도록 수정하여 불필요한 재루프 방지

### 보안 강화 (REVIEW 반영)
- **RBAC 미들웨어**: `Inject Instruction` 등 주요 제어 엔드포인트에 토큰 검증 미들웨어 매핑
- **CORS 엄격화**: 허용 origin을 SPEC 기준값(`manbalboy.com` 계열, `localhost` 계열)으로 제한, 와일드카드(`*`) 제거
- **XSS 방어**: `sanitizeAlertText` 함수의 필터 패턴 강화 — 로그·상태 알림 메시지 렌더링 전 스크립트 태그 완전 제거

### UI / 대시보드 (DESIGN_SYSTEM 반영)
- 다크 모드 기반 모니터링 대시보드: 엔진 상태, Quality Score, 실시간 로그 패널 구획 배치
- 상태 시맨틱 토큰(Running: Blue / Success: Green / Waiting: Yellow / Failed: Red) 적용
- `Live Run Constellation` 미니 맵 — SSE 이벤트 기반으로 파이프라인 노드 상태를 실시간 점등
- Mobile-First 반응형: 모바일 1단 스크롤 / 데스크탑 분할 대시보드

### 인프라
- 프로젝트 루트 `Dockerfile` 작성 및 7000 포트 바인딩 설정
- OOM 방지를 위한 로그 Burst 윈도잉 주기 단축 및 실시간 메모리 Cap 제한 추가

---

## Test Results

| 구분 | 항목 | 결과 |
|------|------|------|
| Unit Test | 4대 엔진 단위 테스트 (Mock 입출력 정합성) | 작성 완료 |
| Integration Test | Redis 락 획득 실패 / 네트워크 파티션 Fallback 시나리오 | 케이스 추가 |
| E2E / Stress Test | 대용량 로그 Burst + SSE 재연결 중복 방지 검증 (포트 3100/3101 활용) | 스크립트 작성 완료 |
| 보안 검증 | CORS 와일드카드 제거, RBAC 토큰 검증, XSS sanitize | 정적 분석 통과 |

**Docker Preview**
- Container: `agenthub-preview-cdb309bd`
- Image: `agenthub/new-mind-cdb309bd:latest`
- External URL: http://ssh.manbalboy.com:7004
- Health URL: http://127.0.0.1:7004/
- CORS: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- **Status: `failed`** — `[Errno 104] Connection reset by peer` 오류로 컨테이너 정상 기동 실패. Follow-up 항목으로 등록.

---

## Risks / Follow-ups

| 유형 | 내용 | 우선순위 |
|------|------|----------|
| **버그** | Docker Preview 컨테이너 기동 실패(`Connection reset by peer`) — 네트워크 환경 또는 포트 바인딩 설정 재확인 필요 | P0 |
| **엣지케이스** | Quality Score 급락 시 Planner가 정상 코드까지 광범위 수정하는 시나리오 — Safe Mode 전환 방어 로직 고도화 필요 | P1 |
| **엣지케이스** | 장기 실행 중 DB 커넥션 풀 미반환으로 인한 시스템 정지 위험 — 커넥션 풀 회수 정책 및 모니터링 추가 필요 | P1 |
| **테스트** | Redis 분산 락 서버 장애 시 고아 프로세스 발생 시나리오 — 추가 Integration Test 케이스 작성 필요 | P2 |
| **고도화** | 루프 상태 임계치 초과 시 외부 Webhook 알림 — 현재 단순 JSON POST 수준, 템플릿 고도화는 다음 이터레이션에서 진행 | P2 |
| **고도화** | 완전 자율형 아키텍처 재설계 및 다중 서버 분산 배포는 이번 MVP 범위 외 — 별도 이슈로 트래킹 예정 | Out-of-Scope |

---

Closes #71
```

## Deployment Preview
- Docker Pod/Container: `agenthub-preview-cdb309bd`
- Status: `failed`
- External port: `7004` (7000 range policy)
- Container port: `7000`
- External URL: http://ssh.manbalboy.com:7004
- Health probe: http://127.0.0.1:7004/
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Docker preview failed: [Errno 104] Connection reset by peer
