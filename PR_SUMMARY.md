## Summary

이 PR은 이슈 #67 "[초장기] 초고도화 방안 및 지속적인 확장가능성을 가진 프로그램으로 개발하는 목표 전략"에 대응하여, **DevFlow Agent Hub**를 n8n과 차별화된 AI 개발 자동화 플랫폼으로 고도화하기 위한 핵심 기반을 구축합니다.

이번 변경은 6가지 확장 아이디어(Workflow Engine v2, Human Gate, Visual Builder, Artifact-first Workspace, Agent Marketplace, Dev Integrations) 중 **보안·안정성·성능** 측면에서 즉시 적용 가능한 P0/P1 항목을 먼저 구현합니다. CLI 기반 AI 실행을 기본으로 유지하며, API 방식은 보조 수단으로 설정하는 원칙을 지킵니다.

---

## What Changed

### [P0] 보안 강화 — XSS 방어 및 워크스페이스 권한 격리

- **`web/src/utils/sanitize.ts`**: `DOMPurify` 훅을 추가하여 `javascript:` 프로토콜 링크 및 악의적인 `<svg>` 속성을 렌더링 전 완전 차단. 마크다운/아티팩트 뷰어 전 구간에 적용.
- **`api/tests/test_workspace_security.py`**: 다중 워크스페이스 환경에서 인가되지 않은 타 워크스페이스 사용자가 Human Gate(승인/거절) API를 조작하는 시나리오를 검증하는 통합 테스트 추가. 일관된 `403 Forbidden` 반환 확인.

### [P0] 클라이언트 복원력 — SSE 재연결 및 Graceful Fallback

- **SSE 지수 백오프(Exponential Backoff)**: Nginx 180s 타임아웃 강제 종료 후 재연결 시 429 에러를 방지하기 위해, 재시도 대기 시간을 1초 → 2초 → 4초 → 8초 순으로 점진 증가하는 로직 적용. 최대 시도 횟수 초과 시 '연결 실패' 최종 에러 UI로 전환.
- **Graceful Fallback UI**: 로컬 3100번대 포트(3108 프록시, 3101 백엔드) 연결 실패(502/타임아웃) 시 무한 로딩·화면 깨짐 없이 "서버 상태가 불안정합니다" 안내 UI 즉시 렌더링.

### [P1] 성능 최적화 — Artifact 뷰어 Chunked Loading

- **`web/src/components/` Artifact 뷰어**: 50MB 이상 대용량 텍스트 산출물의 브라우저 힙 OOM 방지를 위해 스크롤 기반 청크 단위 로딩/해제 구조로 리팩토링. 뷰어 내부 텍스트 검색(하이라이팅 툴바) 동시 지원.

### [P2] 리뷰 경험 고도화

- **휴먼 게이트 거절 사유 프리셋**: 권한이 검증된 리뷰어가 거절 시 "UX 가이드 위반", "보안 취약점", "사양 불일치" 등 3~4종의 고정 프리셋 버튼으로 빠른 입력 지원.
- **디자인 시스템 정합**: 에러/거절 액션은 `color.status.failed(#EF4444)`, 검색 하이라이팅은 Yellow 강조색 적용. Pretendard(UI) + JetBrains Mono(로그/코드) 이중 타이포 체계 준수. 모바일 우선 반응형(breakpoint: sm/md/lg) 적용.

---

## Test Results

| 테스트 항목 | 결과 | 비고 |
|---|:---:|---|
| `sanitize.test.ts` — `javascript:alert(1)` 및 `<svg>` 페이로드 XSS 차단 | **PASS** | 정상 콘텐츠(Mermaid 다이어그램 등) 보존 확인 |
| `test_workspace_security.py` — 타 워크스페이스 Human Gate 조작 시 403 반환 | **PASS** | `asyncio.gather` 다중 트랜잭션 포함 |
| SSE 재연결 — 서버 강제 단절 후 지수 백오프 동작 | **PASS** | 네트워크 탭에서 1s → 2s → 4s → 8s 대기 확인 |
| 3108 포트 강제 종료 시 Graceful Fallback UI 전환 | **PASS** | 안내 메시지 즉시 렌더링 확인 |
| Artifact 뷰어 — 대용량 텍스트 Heap 급증 미발생 | **PASS** | Chrome DevTools 메모리 탭 확인 (육안 프로파일링) |
| 뷰어 내부 검색 — 하이라이팅 정상 동작 | **PASS** | |
| 거절 프리셋 버튼 클릭 시 폼 즉시 입력 | **PASS** | |
| 대용량 OOM E2E 자동화 프로파일링 테스트 | **미작성** | Follow-up 필요 |
| 3100번대 포트 강제 차단 Playwright E2E 네트워크 결함 테스트 | **미작성** | Follow-up 필요 |

---

## Risks / Follow-ups

### 잔존 버그 및 엣지 케이스

- **Chunked Loading + 검색 하이라이팅 깜빡임(Flickering)**: 스크롤로 청크가 교체될 때 하이라이팅이 일시 해제 후 재적용되는 현상. 렌더링 안정화 추가 작업 필요.
- **검색 결과 스크롤 좌표 오차**: 아직 로드되지 않은 청크 하단 영역에 위치한 검색 결과로 이동 시 스크롤 좌표 오차로 화면 튀는 현상 발생 가능.
- **거절 프리셋 덮어쓰기**: 사용자가 직접 작성한 내용이 있는 상태에서 프리셋 버튼 클릭 시 기존 입력이 덮어씌워지는 UX 이슈. Append 또는 경고 방식으로 개선 필요.

### 후속 작업 (Follow-ups)

- [ ] 50MB 이상 더미 데이터로 OOM 및 GC 추이를 검증하는 E2E 성능 자동화 테스트 작성
- [ ] Playwright 기반 로컬 포트 강제 차단 시 Graceful Fallback + 지수 백오프 검증 네트워크 결함 E2E 테스트 보완
- [ ] Chunked Loading 뷰어의 검색 하이라이팅 깜빡임 및 스크롤 좌표 오차 해결
- [ ] **Phase 1(Workflow Engine v2)**: `workflow_id` 기반 정의 실행 + `node_runs` 저장 + `ExecutorRegistry` + fallback 구현 (3~6주 예상)
- [ ] **Phase 2(Agent SDK v1)**: CLI 어댑터 표준화 + 테스트 하네스 (Phase 1 후반과 병렬)
- [ ] **Phase 4(Human Gate UI)**: Approval Inbox + Resume 흐름 (Phase 1 완료 후 순차)
- [ ] **Visual Workflow Builder(ReactFlow)**, **Artifact-first Workspace**, **Dev Integrations 이벤트 버스**는 Phase 3~6 순차 진행

### 주의 사항

- `DOMPurify` 정책이 과도하게 엄격해질 경우 Mermaid 다이어그램 등 정상 시각 데이터까지 차단될 수 있으므로, 허용 목록(allowlist) 정책 지속 모니터링 필요.
- 외부 의존성(gh auth, npm 설치, 외부 네트워크) 실패 시 타임아웃/재시도/재처리 시나리오 Runbook 문서화 예정.

---

Closes #67
