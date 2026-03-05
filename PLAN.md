# PLAN

## 1. Task breakdown with priority

REVIEW.md에 명시된 기능적 버그, 보안 취약점, 테스트 누락 항목을 최우선(P0, P1)으로 해결하며, 기존 구조와 인접한 휴먼 게이트 아티팩트 저장 기능을 고도화(P2)합니다.

**[P0] 보안 및 치명적 버그 수정**
- **인증 체계 개편 및 토큰 하드코딩 제거:**
  - 대상 파일: `web/src/services/api.ts`, `web/vite.config.ts`, `api/app/core/config.py`, `api/app/api/workflows.py`
  - 내용: `import.meta.env.VITE_HUMAN_GATE_APPROVER_TOKEN` 하드코딩을 제거하고, 서버에서 발급하는 세션 쿠키 혹은 동적 인증 토큰 방식으로 전환하여 보안 강화.
- **휴먼 게이트 철회(Cancel) API 멱등성 적용:**
  - 대상 파일: `api/app/api/workflows.py`, `api/app/services/workflow_engine.py`
  - 내용: `POST /api/approvals/{approval_id}/cancel` 중복 호출 시, 상태가 이미 `approval_pending`이 아니라면 `409` 예외 대신 상태 검증 후 `200 OK`를 반환하도록 로직 수정.
- **SSE 스트림 재연결 다중 생성 버그 수정:**
  - 대상 파일: `web/src/services/api.ts`, `web/src/hooks/useWorkflowRuns.ts`
  - 내용: 네트워크 상태 플래핑 시 `EventSource` 타이머 해제 로직 점검 및 스트림 중복 생성 방지 락(Lock) 구현.

**[P1] 테스트 커버리지 확보**
- **Audit Log 백엔드 유닛 테스트 추가:**
  - 대상 파일: `api/tests/test_workflow_api.py`
  - 내용: `status` 및 `date_range` 쿼리 파라터를 조합한 다형성 검색 필터가 정상 동작하는지 검증하는 `pytest` 케이스 추가.
- **휴먼 게이트 철회 E2E 테스트 보강:**
  - 대상 파일: `web/tests/e2e/human-gate.spec.ts`
  - 내용: Playwright를 이용해 승인 대기 -> 철회 버튼 클릭 -> API 호출 성공 -> UI 대기 상태 복구를 검증.

**[P2] 인접 기능 고도화 (SPEC 기반)**
- **승인/반려/철회 이력의 아티팩트(Artifact) 연동:**
  - 대상 파일: `api/app/services/workflow_engine.py`, `api/app/models/workflow.py`
  - 내용: 휴먼 게이트에서 발생한 결정(승인자, 결정 시간, 사유 등)을 단순 DB 상태 변경에 그치지 않고, 워크스페이스 내 표준 아티팩트(`review.md` 또는 `status.md` 형태)로 기록하여 가시성 및 재현성 확보.

## 2. MVP scope / out-of-scope

**MVP Scope**
- `VITE_HUMAN_GATE_APPROVER_TOKEN`의 클라이언트 노출 완벽 차단 및 인증 플로우 정상화.
- 승인 철회 API의 멱등성 보장을 통한 다중 클릭 대응.
- 프론트엔드 네트워크 오프라인/온라인 전환 시 SSE 연결 안정성 보장.
- 누락된 백엔드 쿼리 필터 로직 검증 및 프론트엔드 철회 E2E 테스트 케이스 100% 작성.
- 휴먼 게이트 결정 내역을 텍스트 기반 아티팩트로 저장.

**Out-of-scope**
- Visual Workflow Builder (ReactFlow 기반 캔버스 에디터) 전체 구현 및 시뮬레이션 런 (Phase 5).
- 외부 CI/CD 배포 파이프라인 트리거 통합 및 이벤트 버스 구축 (Phase 6).

## 3. Completion criteria

- 클라이언트 빌드 산출물 검사 시 어떠한 정적 인가 토큰 값도 노출되지 않아야 함.
- `cancel` API에 동일한 요청을 2회 이상 연속으로 보냈을 때 `409 Conflict` 없이 `200 OK` 응답이 유지되어야 함.
- 브라우저 오프라인/온라인 토글 테스트 시 네트워크 탭에서 연결 요청이 단일 스트림으로 유지되며 메모리 누수가 없어야 함.
- `pytest` 명령을 통한 백엔드 테스트와 `npx playwright test` 프론트엔드 E2E 테스트가 100% 통과(Pass)해야 함.
- 개발 환경 구동 시 프론트엔드는 `http://localhost:3000`, API는 `http://localhost:3001`에서 정상 응답해야 함.

## 4. Risks and test strategy

- **리스크**: 토큰 기반 인증 체계를 변경하는 과정에서 프론트엔드와 백엔드 간 통신이 일시적으로 단절되거나 기존에 구현된 승인/반려 API의 권한이 풀릴 수 있습니다.
  - **테스트 전략**: `pytest` 인증 전용 픽스처(Fixture)를 재정비하여 기존에 작성된 `test_workspace_security.py`가 성공하는지 우선 확인합니다. 프론트엔드에서는 브라우저 인증 환경을 모킹한 E2E 환경에서 "조회 -> 대기 -> 승인/반려/철회"의 전체 사용자 흐름이 끊기지 않는지 확인합니다.
- **리스크**: SSE 연결 재시도 로직 타이머 오류로 인해 엣지 케이스에서 영구적인 끊김 현상이 발생할 수 있습니다.
  - **테스트 전략**: Playwright 브라우저 컨텍스트의 네트워크 제어(Offline -> Online 전환)를 활용해 1초 내에 상태가 3~4회 플래핑(Flapping)되는 상황을 시뮬레이션하고 활성 `EventSource` 개수를 Assert로 확인합니다.

## 5. Design intent and style direction

- **기획 의도**: 개발 및 배포 전 최종 검수 단계에서 사용자가 실수로 승인하거나 여러 번 버튼을 클릭하더라도 시스템이 이를 안전하게 튕겨내고(멱등성) 올바른 정보를 유지함으로써 "안정적이고 통제된 워크플로우 경험"을 제공합니다.
- **디자인 풍**: 엔터프라이즈 워크플로우 대시보드형 (미니멀, 모던).
- **시각 원칙**:
  - **컬러**: 정보 위계를 낮춘 무채색 배경(Gray/White)에, 상태별(Approve: Green, Reject: Red, Cancel: Gray/Yellow) 뱃지와 액션 버튼만 명확한 의미 기반 색상을 부여해 시선을 유도합니다.
  - **패딩/마진**: 정보의 묶음을 명확히 하기 위해 8px 배수 시스템(8/16/24/32) 여백을 일관되게 적용합니다.
  - **타이포**: 실행 로그와 산출물 등 코드/데이터는 모노스페이스 폰트를, UI 내 정보 텍스트와 타이틀은 가독성 높은 기본 산세리프 폰트를 사용해 역할을 구분합니다.
- **반응형 원칙**: 모바일 우선(Mobile-first). 작은 화면에서는 승인 대기열이 개별 카드형 리스트로 나열되며, 데스크탑에서는 테이블 뷰 또는 좌우 스플릿 뷰(리스트와 Diff 아티팩트 분할)로 확장 표시됩니다.

## 6. Technology ruleset

- **플랫폼 분류**: web, api
- **web**: React 기반(Vite 생태계 활용)으로 계획. (로컬 실행 포트: `3000`)
- **api**: FastAPI 기반으로 계획. (로컬 실행 포트: `3001`)
