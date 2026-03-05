## Summary

이슈 #67 "초고도화 방안 및 지속적인 확장가능성을 가진 프로그램으로 개발하는 목표 전략"에서 정의된 장기 로드맵 중, **Phase 1~2 핵심 보안 수정 및 안정성 개선** 항목을 우선 구현합니다.

주요 변경 범위는 다음과 같습니다.

- 클라이언트 번들에 포함된 시크릿 환경변수 노출 제거
- 단일 노드 워크플로우 상태 전이(`running → done`) 버그 수정
- 휴먼 게이트(Human Gate) 승인/반려/철회 API 멱등성 보장
- Audit Log 조회 API 페이지네이션 및 상태·날짜 필터 추가
- 네트워크 오프라인/온라인 시나리오 Playwright E2E 테스트 통합

---

## What Changed

### P0 — 보안 및 버그 수정

| 구분 | 변경 내용 |
|------|-----------|
| **시크릿 노출 제거** | `web/src/services/api.ts`에서 `VITE_WEBHOOK_SECRET` 참조를 완전 제거하고, 웹훅 서명 검증 로직을 백엔드로 이관 |
| **단일 노드 워크플로우** | `workflow_engine` 내부에서 엣지가 없는 단일 노드 실행 완료 시 `done` 상태로 즉시 전이되도록 수정 |

### P1 — 안정성 및 기능 개선

| 구분 | 변경 내용 |
|------|-----------|
| **Human Gate 멱등성** | Approve/Reject API에 이어 **Cancel API**(`POST /api/approvals/{id}/cancel`)에도 중복 호출 멱등성 보장 로직 추가 — 이미 `cancelled` 상태이면 `200 OK` 반환 |
| **Audit Log 페이지네이션** | `GET /api/runs/{run_id}/human-gate-audits`에 `limit`/`offset` 파라미터 및 `total_count` 메타데이터 응답 추가 |
| **Audit Log 필터** | `status`, `date_range` 쿼리 파라미터로 특정 상태·기간 로그만 조회 가능하도록 확장 |
| **E2E 테스트 보강** | Playwright에 오프라인 배너 노출, 온라인 복구 UI, Human Gate Cancel 버튼 클릭 시나리오 추가 |

### 디자인 시스템 적용

- 오프라인/에러 배너는 `color.status.failed: #EF4444` 기반 플로팅 형태로 레이아웃 비침해 구현
- Audit Log 테이블은 `font.mono` 적용, 행 높이 `40px`, 헤더 sticky 처리
- 모바일(`sm`) 뷰에서 로그 테이블은 카드 스택으로 폴백

---

## Test Results

| 테스트 항목 | 방법 | 결과 |
|------------|------|------|
| 시크릿 미노출 확인 | 빌드 번들(`dist/`) 텍스트 검색 | `VITE_WEBHOOK_SECRET` 미검출 |
| Human Gate 멱등성 | `pytest` 병렬 호출 통합 테스트 | 동일 페이로드 2회 모두 `200 OK` |
| 단일 노드 워크플로우 | `pytest` 단위 테스트 | 실행 직후 DB 상태 `done` 확인 |
| Audit Log 페이지네이션 | `pytest` — 100건 생성 후 `limit=10` 요청 | 10건 + `total_count: 100` 반환 확인 |
| 오프라인 배너 E2E | `npm run test:e2e` (Playwright) | 오프라인 배너 노출·온라인 복구 통과 |
| Cancel E2E | Playwright | 버튼 클릭 → 철회 성공 → 대기 상태 복구 통과 |

---

## Risks / Follow-ups

### 잔여 위험 (Risks)

| 위험 | 내용 | 심각도 |
|------|------|--------|
| **토큰 노출** | `VITE_HUMAN_GATE_APPROVER_TOKEN`이 `web/src/services/api.ts` 내 `import.meta.env` 형태로 여전히 클라이언트 번들에 포함됨 — 브라우저에서 인가 토큰 직접 노출 | **높음** |
| **SSE 다중 연결** | 네트워크 Flapping 시 `subscribeWorkflowRuns` 타이머 충돌로 백엔드에 다중 EventSource 연결이 발생할 수 있음 | 중간 |
| **포트 하드코딩** | 일부 에러 메시지·문서에 과거 포트가 잔존할 경우 CORS 오류 및 타임아웃 엣지 케이스 유발 가능 | 낮음 |

### 후속 과제 (Follow-ups)

- [ ] `VITE_HUMAN_GATE_APPROVER_TOKEN` 제거 및 서버 사이드 세션 또는 단기 토큰 발급 방식으로 인증 구조 전환 (보안 강화 Sprint 분리 권장)
- [ ] SSE `EventSource` 재연결 로직에 디바운스 및 중복 구독 방지 처리 추가
- [ ] Audit Log 필터(`status`, `date_range`) 조합 케이스 `pytest` 커버리지 보강
- [ ] SPEC Phase 3~6 로드맵(Postgres 이관, Visual Builder, Agent Marketplace, Integrations 확장) 후속 이슈 등록

---

Closes #67
