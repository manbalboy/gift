## Summary

이슈 #69 "[초장기] 해당 워크 플로를 각각 상세하게 수정 구현할수 있는 형태로 개발해주세요"에 대응하여, 워크플로우 엔진의 핵심 안정성·보안 기반을 강화하고 노드 단위 실행 제어 기능을 추가합니다.

기존 대시보드 관찰 위주의 시스템을 "각 워크플로우 노드를 독립적으로 제어·수정·재개"할 수 있는 형태로 전환하기 위한 P0 우선순위 작업(PLAN §1 참고)을 이번 PR에서 완료하며, 이후 시각적 워크플로우 빌더(Idea E)·아티팩트 워크스페이스(Idea D) 구현의 안정적인 기반을 마련합니다.

---

## What Changed

### 1. API 보안 강화 — localhost 스푸핑 차단
- `api/app/api/dependencies.py`: `_enforce_localhost_spoof_guard` 함수를 도입하여 `Host` 헤더가 내부 포트(3100–3199 대역)를 위장하는 외부 요청을 `403 Forbidden`으로 차단합니다.
- `api/app/core/config.py`: 차단 대역을 `SPOOF_GUARD_PORTS` 환경변수(List 형태)로 주입받도록 구성하여, 인프라 포트 변경 시 코드 수정 없이 정책을 조정할 수 있습니다.
- 프리뷰 토큰 인증 우회 경로(`/preview/*`)를 허용 목록에 추가하여 외부 프리뷰 접근(포트 7000–7099)이 정상 동작하도록 처리합니다.

### 2. 워크플로우 엔진 — 노드별 타임아웃 오버라이드
- `api/app/services/workflow_engine.py`: 노드 정의에 `timeout_override` 필드를 추가하고, 엔진이 노드를 스케줄링할 때 해당 값을 우선 적용합니다. 미설정 시 전역 기본 타임아웃으로 폴백합니다.
- 노드 유형(LLM 호출, E2E 테스터, 리뷰어 등)별로 개별 타임아웃을 부여할 수 있어, 단일 슬로우 노드가 전체 런을 차단하는 문제를 해소합니다.

### 3. 워크플로우 엔진 — 노드 반복 예산 추적
- `api/app/services/workflow_engine.py`: 노드가 실행될 때마다 `loop_budget` 카운터를 증가시키고, 허용 임계치 초과 시 해당 노드를 `failed`로 전이시켜 무한 재작업 루프와 LLM 비용 폭주를 방지합니다(SPEC §Autopilot 리스크 참고).

### 4. `paused` 상태 처리 버그 수정
- 장기 방치된 런타임을 재개(Resume)할 때 임시 아티팩트가 만료·유실된 경우, 엔진 크래시 대신 해당 노드를 `failed`로 안전하게 전이시키고 에러 메시지를 `node_run`에 기록하는 Graceful Failure 로직을 적용합니다(REVIEW Edge Cases 참고).

### 5. 에이전트 파이프라인 단계 문서화 (docs stage)
- 이슈 읽기 → Gemini 플래너 → Codex 수정자 → 테스트 리포트 → UX E2E 검수 → Gemini 리뷰어 순서의 각 단계 결과물을 리포지터리에 커밋하여 재현 가능한 자동 SDLC 흐름을 문서화합니다.

---

## Test Results

| 테스트 항목 | 방법 | 결과 |
|---|---|---|
| `_enforce_localhost_spoof_guard` 403 차단 | 단위 테스트(pytest) | PASS |
| `SPOOF_GUARD_PORTS` 환경변수 주입 | 단위 테스트(pytest) | PASS |
| `timeout_override` 적용/미적용 스케줄링 차이 | 단위 테스트(pytest, `test_workflow_engine.py`) | PASS |
| `paused` 아티팩트 만료 후 Resume → Graceful Failure | 안전성 테스트(아티팩트 수동 삭제 후 resume 호출) | PASS (`failed` 전이 및 에러 기록 확인) |
| 동시 Resume 다중 요청 시 중복 스케줄링 방지 | 통합 테스트(`concurrent.futures`, 3100 포트 환경) | PASS (단일 스레드만 생성됨) |
| UX E2E (대시보드 관측, 상태 배지) | E2E 검수 리포트 참조 | PASS |

> Docker Preview: `http://ssh.manbalboy.com:7000` (컨테이너 외부 포트 7000, 내부 API 3100)

---

## Risks / Follow-ups

### 잔존 리스크
- **동시성 락 데드락 가능성**: `resume_run` 멱등성 처리를 위한 락 구현에서, 비정상 종료 시 락이 해제되지 않아 단일 재개 요청도 블로킹될 수 있습니다. 운영 중 이상 감지 시 락 TTL을 강제 만료시키는 관리자 API 추가가 권장됩니다.
- **`SPOOF_GUARD_PORTS` 미설정 시 기본값 의존**: 환경변수 미설정 시 하드코딩 폴백으로 동작하므로, 배포 체크리스트에 해당 환경변수 명시를 추가해야 합니다.
- **루프 예산 임계치 최적화 미확정**: `loop_budget` 허용 임계치는 현재 보수적 기본값으로 설정되어 있으며, 실제 에이전트 모델별 실행 패턴 데이터를 수집한 후 조정이 필요합니다.

### 후속 작업 (Follow-ups)
- [ ] **Visual Workflow Builder (Idea E)**: ReactFlow 기반 노드 에디터 UI 구현 — 이번 PR에서 안정화된 엔진 위에 편집/검증/버전/preview-run을 UI로 노출
- [ ] **Artifact-first Workspace (Idea D)**: `node_run` 산출물을 Object Store에 1급 데이터로 저장하고 타임라인/검색 API 제공
- [ ] **Dashboard SSE 실시간 업데이트**: `Live Run Constellation` 미니맵(DESIGN_SYSTEM §8 WOW Point) 연동을 위한 SSE/WebSocket 스트림 구현
- [ ] **Agent SDK 표준화 (Idea C)**: `agent_versions` 스키마 확정 및 Marketplace API 1차 릴리스

---

Closes #69

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
