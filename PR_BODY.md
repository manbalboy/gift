## Summary

이번 PR은 DevFlow Agent Hub의 **Human Gate(휴먼 게이트) 기능 안정화 및 보안 강화**를 핵심으로 합니다. `ex-code` 내부 구현을 분석하여 기존 프로젝트에 누락된 기능을 통합하고, 워크플로우 런 상태 전이 버그, SSE 스트림 누수, API 멱등성 결함, 인증 토큰 하드코딩 취약점을 전면 해소하였습니다. 이를 통해 SPEC에서 정의한 **아이디어 B(Human Gate + Resume)** 의 P0 요건을 충족하는 신뢰성 높은 제어 경험을 제공합니다.

---

```markdown
## Summary

DevFlow Agent Hub의 Human Gate 기능 안정화, 보안 강화, 테스트 커버리지 확충을 목적으로 합니다.
`ex-code` 레포지토리의 구현을 분석하여 현재 프로젝트에 누락된 전체 기능을 이식하고,
SPEC 아이디어 B(Human Gate + Resume) P0 완료 기준을 충족합니다.

- 워크플로우 런 상태 전이 버그 (`queued` → `waiting`) 수정
- SSE 스트림 다중 생성 및 메모리 누수 해소
- 승인 철회 API 멱등성 확보
- `VITE_HUMAN_GATE_APPROVER_TOKEN` 하드코딩 제거 및 동적 인증 파이프라인 전환
- 백엔드/프론트엔드 테스트 전면 보강 및 결정 이력 아티팩트화

---

## What Changed

### Backend (FastAPI · API: 3101)

- **Human Gate 세션 쿠키 기반 인증 추가**
  - `VITE_HUMAN_GATE_APPROVER_TOKEN` 하드코딩 완전 제거
  - 정적 빌드 산출물을 통한 평문 토큰 노출 취약점 해소
  - 동적 세션 기반 인증 파이프라인으로 전환

- **승인/취소 요청 권한 검증 로직 통합**
  - `POST /api/approvals/{approval_id}/approve` — 세션 검증 후 상태 전이
  - `POST /api/approvals/{approval_id}/cancel` — 멱등성 보장 (중복 요청 시 `200 OK`)
  - 오케스트레이터 상태 전이 버그 수정: Human Gate 진입 시 `queued` → `waiting` 정상 전이

- **Audit Log 다형성 필터 API 강화**
  - `status`, `date_range` 쿼리 파라미터 지원 추가
  - `test_workflow_api.py`에 단위 테스트 케이스 추가 및 100% 통과 확인

- **결정 이력 아티팩트화**
  - Human Gate 완료 시 `status.md` 아티팩트를 워크스페이스 디렉토리에 자동 저장
  - 승인자, 결정 사유, 타임스탬프 포함

### Frontend (React + Vite · UI: 3100)

- **SSE 스트림 누수 수정 (`useWorkflowRuns.ts`)**
  - 네트워크 플래핑(Flapping) 환경에서 다중 `EventSource` 생성 방지를 위한 Lock 추가
  - 컴포넌트 언마운트 시 `EventSource` 명시적 종료 처리 보강
  - 단일 SSE 스트림 유지 및 데이터 정확성 확보

- **Human Gate UI 개선**
  - 승인 대기 상태(`waiting`)를 Warning 계열 색상(`#F59E0B`)으로 명시 표기
  - 승인/반려/철회 버튼 동시 클릭 방어 처리 (레이스 컨디션 방지)
  - 모바일 우선(Mobile First) 반응형 카드 스택 뷰 적용

- **E2E 테스트 추가 (`web/tests/e2e/human-gate.spec.ts`)**
  - Human Gate 대기 항목 승인 철회 액션 및 UI 복원 시나리오 Playwright 테스트 추가
  - 프론트엔드 포트 3100 기준 전체 통과 확인

---

## Test Results

| 구분 | 테스트 유형 | 결과 |
|------|------------|------|
| Backend | `test_workflow_api.py` (단위 테스트 — 상태 전이, 멱등성, Audit Log 필터) | ✅ 100% PASS |
| Backend | 동시성 테스트 (다중 스레드 승인/철회 API 호출) | ✅ 레이스 컨디션 없음 |
| Backend | 아티팩트 무결성 통합 테스트 (`status.md` 생성 검증) | ✅ PASS |
| Frontend | Playwright E2E — `human-gate.spec.ts` (승인 철회 + UI 복원) | ✅ PASS |
| Frontend | SSE 재연결 테스트 (네트워크 오프라인/온라인 반복) | ✅ 단일 스트림 유지 확인 |
| Security | 빌드 산출물 내 `VITE_HUMAN_GATE_APPROVER_TOKEN` 잔존 여부 확인 | ✅ 미존재 확인 |

> 로컬 검증 환경: UI `http://localhost:3100`, API `http://localhost:3101`

---

## Risks / Follow-ups

### 잔존 리스크

- **리버스 프록시 SSE 타임아웃**: 로컬(3100번대 포트) 외 실제 배포 환경(Nginx 등)에서 SSE 장기 연결 시 프록시 타임아웃 엣지 케이스가 미검증 상태. 추가 점검 필요.
- **네트워크 이벤트 유실**: 불안정한 네트워크 환경에서 SSE 단절-복구 구간의 이벤트가 일시 유실될 가능성이 잔존. 클라이언트 재동기화 로직 보강 고려 필요.

### Follow-ups (후속 과제)

- [ ] `status.md` 아티팩트 데이터를 활용한 대시보드 Audit Log 검색 기능 설계 구체화
- [ ] 장기 미처리 Human Gate 대기 건에 대한 만료/재개(Resume) 알림 정책 기획
- [ ] Visual Workflow Builder(ReactFlow) 편집 캔버스 전면 구현 (SPEC 아이디어 C — Phase 5)
- [ ] Temporal 기반 외부 분산 오케스트레이터 도입 검토 (SPEC 아이디어 A — Phase 1 이후)

---

Closes #67
```

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
