```markdown
## Summary

이슈 #67 "초장기 초고도화 방안 및 지속적인 확장가능성"의 1차 실행 사이클을 완료합니다.

SPEC에서 제시한 6개 아이디어(Workflow Engine v2 · Human Gate · Visual Builder · Artifact-first · Agent Marketplace · Dev Integrations) 중 **P0~P1** 범위의 핵심 버그·보안 취약점을 수정하고, 조직형 SDLC에 필수적인 Human Gate RBAC 권한 제어를 실 코드에 적용하였습니다.  
REVIEW.md에서 식별된 4건의 기능 버그와 2건의 보안 취약점을 해소하였으며, 누락되었던 테스트(E2E · 단위 · API 통합)도 보강하였습니다.

---

## What Changed

### P0 — 워크플로우 엔진 버그 수정
- **DAG Fallback 로직 수정** (`api/app/services/workflow_engine.py`)  
  연결(엣지)이 없는 독립 노드가 병렬 처리 큐를 우회하여 강제로 순차 실행되던 버그를 수정하였습니다. 이제 독립 노드는 정상적으로 병렬 큐에 진입합니다.
- **웹훅 유효성 검증 강화** (`api/app/api/webhooks.py`)  
  유효하지 않은 `workflow_id` 또는 잘못된 페이로드 수신 시 즉시 `422 Unprocessable Entity`를 반환하도록 에러 핸들링을 추가하였습니다.
- **SSE 좀비 커넥션 방지** (`api/app/services/workflow_engine.py`)  
  워크플로우 강제 취소 API 호출 시 활성화된 SSE 비동기 제너레이터를 즉시 안전하게 해제하여 메모리 누수 및 좀비 커넥션 문제를 해결하였습니다.

### P0 — 보안: Human Gate RBAC 권한 제어
- **Role 기반 인가 로직 추가** (`api/app/api/workflows.py`)  
  Human Gate 승인/반려 엔드포인트에 `reviewer` · `admin` Role 검증을 도입하였습니다. 권한이 없는 사용자의 요청은 `403 Forbidden`으로 즉시 차단됩니다.
- **워크스페이스 기반 게이트 권한 제어**  
  승인 권한을 워크스페이스 단위로 격리하여 타 프로젝트의 Human Gate를 잘못 처리하는 경우를 원천 차단하였습니다.
- **감사 로그(Audit Log) 기록**  
  승인/반려 결정 주체(`decided_by`), 결정 일시(`decided_at`), 페이로드를 `approval_requests` 테이블에 기록합니다.

### P1 — 프론트엔드 UX 개선
- **인가 실패 Fallback 모달** (`web/src/components`)  
  `403` 에러 발생 시 콘솔에만 에러를 기록하던 방식을 제거하고, "권한 부족 안내 및 관리자 문의" 모달을 즉시 렌더링합니다.
- **SSE 연결 상태 표시등**  
  GNB 상단에 연결 중(파란색) / 연결됨(녹색) / 단절됨(빨간색) 인디케이터를 추가하였습니다. 단절 시 지수 백오프(Exponential Backoff)로 자동 재연결을 시도합니다.
- **포트 고정** (`web` 환경변수 · 구동 스크립트)  
  프론트엔드 `3100` · API `3101` 포트를 명시적으로 고정하여 로컬 개발 환경의 충돌을 제거하였습니다.

### 아티팩트 문서 (stage docs)
- Gemini 플래너 · Codex 수정자 · 수정 후 테스트 리포트 · Gemini 리뷰어 단계 문서를 워크스페이스에 순차적으로 작성하였습니다.

---

## Test Results

| 구분 | 테스트 항목 | 결과 |
|---|---|---|
| Backend Unit | `asyncio.CancelledError` 포착 및 SSE 자원 반환 검증 | ✅ PASS |
| Backend API | 잘못된 `workflow_id` → `422` 응답 확인 | ✅ PASS |
| Backend API | 권한 없는 사용자 Human Gate 호출 → `403` 응답 확인 | ✅ PASS |
| Backend API | `reviewer` Role → 승인 정상 처리 확인 | ✅ PASS |
| Frontend E2E (Playwright) | Human Gate 대기 → 승인 → 워크플로우 재개 흐름 | ✅ PASS |
| Frontend E2E (Playwright) | `403` 에러 시 Fallback 모달 렌더링 확인 | ✅ PASS |
| Frontend E2E (Playwright) | SSE 단절 → 자동 재연결 상태등 변화 확인 | ✅ PASS |

> 모든 테스트는 `localhost:3100`(UI) / `localhost:3101`(API) 고정 포트 환경에서 실행하였습니다.

---

## Risks / Follow-ups

### 현재 리스크
- **비동기 이벤트 루프 블로킹 가능성**: 취소 시그널에 따른 SSE 제너레이터 강제 종료 로직이 복잡한 중첩 코루틴 환경에서 드물게 블로킹될 수 있습니다. 추가 부하 테스트를 통해 검증이 필요합니다.
- **자동 재연결 부하 증폭**: 서버 장애 시 다수의 클라이언트가 동시에 재연결을 시도할 경우 서버에 순간 부하가 집중될 수 있습니다. 재연결 최대 횟수 제한 및 Jitter 적용을 권장합니다.

### Follow-ups (다음 단계)
- **Phase 5 — Visual Workflow Builder (ReactFlow)**: 이번 PR의 scope 밖으로 이월하였습니다. 워크플로우 스키마/검증 API는 이미 구현되어 있으므로 UI 연결만 남아 있습니다.
- **Agent Marketplace / Agent SDK 추상화**: CLI 기반 실행(Gemini · Codex · Claude)을 Agent Spec 버전 체계로 승격하고 SDK를 표준화하는 작업이 필요합니다.
- **Live Run Constellation 미니맵**: DESIGN_SYSTEM.md의 WOW Point로 정의된 실시간 노드 점등 인터랙티브 맵 구현은 별도 이슈로 분리합니다.
- **Temporal / LangGraph 마이그레이션 검토**: 조직 규모 성장에 따라 내장 엔진에서 Temporal(오케스트레이션) + LangGraph(에이전트 루프) 분리 전환 여부를 재평가합니다.
- **Docker Preview 정보**:  
  - Frontend: `http://ssh.manbalboy.com:7000` (컨테이너 포트 3100 → 호스트 포트 7000 매핑)  
  - API: `http://ssh.manbalboy.com:7001` (컨테이너 포트 3101 → 호스트 포트 7001 매핑)

---

Closes #67
```
