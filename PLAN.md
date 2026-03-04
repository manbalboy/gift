```markdown
# PLAN

## 1. Task breakdown with priority

*   **P0 (Critical - REVIEW.md 필수 반영 및 버그 수정)**
    *   **DAG Fallback 예외 처리 수정**: `api/app/services/workflow_engine.py` 내 `_build_predecessors` 로직을 수정하여 엣지가 없는 독립 노드의 강제 순차 실행을 방지하고, 검증 단계에서 사전 차단하거나 병렬 처리를 지원하도록 변경.
    *   **Webhook 예외 처리 강화**: `api/app/api/webhooks.py` 웹훅 수신부에서 잘못된 포맷의 `workflow_id` 요청에 대해 `422 Unprocessable Entity` 응답 로직 추가.
    *   **Human Gate 인가(Authorization) 도입**: `api/app/api/workflows.py` 및 관련 서비스에 단순 토큰 검증을 넘어 사용자 Role(예: reviewer, admin) 기반의 세밀한 권한 검증 로직 반영.
    *   **SSE 좀비 커넥션 방지**: 워크플로우 강제 취소 시, 연결된 서버-클라이언트 간 SSE 스트리밍 커넥션 풀이 즉각적으로 해제되도록 연결 관리 로직 보완.
*   **P1 (High - 안정성 확보 및 테스트 보강)**
    *   **프론트엔드 E2E 테스트**: `web/tests/e2e/` 디렉토리에 Playwright를 활용하여 Human Gate의 대기(Pending) -> 승인/반려 -> 재개(Resume) 통합 시나리오 테스트 작성.
    *   **백엔드 통합/스트레스 테스트**: `api/tests/` 디렉토리에 워커 헬스체크 및 Dead Letter Queue(DLQ) 에러 복원 처리에 관한 백엔드 테스트 코드 보강.
    *   **로컬 실행 환경 포트 고정**: 프론트엔드(`3100`), 백엔드 API(`3101`) 포트 기반 구동 스크립트 및 환경 변수 정비.
*   **P2 (Medium - 핵심 스펙 확장)**
    *   **Workflow Engine v2 코어 이관**: `workflow_id` 기반 정의 실행 및 `node_runs` 저장 체계(DB) 연동.
    *   **Visual Workflow Builder**: UI(ReactFlow)에 노드/엣지 렌더링 및 검증 API 연결.
    *   **Artifact-first Workspace**: 실행 결과물을 로그 중심에서 아티팩트(마크다운, 이미지, JSON 등) 단위로 수집 및 뷰어 연동.

## 2. MVP scope / out-of-scope

*   **MVP Scope**
    *   `REVIEW.md`에 명시된 모든 기능적 버그, 보안 우려사항, 엣지 케이스 완벽 해결.
    *   안전한 Human Gate 동작(정상 권한자만 승인 가능, UI 상에서 원활한 파이프라인 재개 관측).
    *   안정적인 워크플로우 엔진 기반(의도치 않은 노드 병합 방지, 메모리 누수가 없는 쾌적한 SSE 환경).
    *   프론트엔드 포트 `3100`, API 포트 `3101`에서 구동 및 E2E 테스트 검증 완료.
*   **Out-of-scope**
    *   n8n처럼 완벽한 커스텀 노드를 즉석에서 생성하는 범용 워크플로우 에디터 구축 (사전 정의된 노드 타입 배치 위주로 한정).
    *   Temporal 등 외부 워크플로우 오케스트레이터의 전면 도입 (기존 내장 엔진을 최적화하는 데 집중).
    *   대규모 멀티 테넌시 클라우드 배포 (단일 워크스페이스 내의 컨테이너 기반 검증에 집중).

## 3. Completion criteria

*   `api/app/services/workflow_engine.py`가 수정되어, 연결 없는 노드 배치 시 강제로 순차 실행되지 않아야 함 (사전 예외 발생 혹은 개별 병렬 큐 진입).
*   유효하지 않은 `workflow_id`를 포함한 Webhook 요청 발송 시, 서버가 명확하게 HTTP 422 상태 코드를 반환해야 함.
*   인가되지 않은 사용자 계정 토큰으로 Human Gate 승인 엔드포인트(`api/app/api/workflows.py`) 호출 시 403 에러로 차단되어야 함.
*   워크플로우 실행 취소 API 호출 후, API 서버의 연결된 활성 SSE 스트림 수가 0으로 정리되는지 로깅 또는 테스트로 증명 가능해야 함.
*   대시보드 UI(`3100` 포트)와 API 서버(`3101` 포트) 간 통신을 기반으로 한 Playwright E2E 테스트가 100% 통과해야 함 (Human Gate 재개 플로우 포함).
*   워커 헬스체크 및 DLQ 관련 백엔드 단위/통합 테스트가 작성되고 통과해야 함.

## 4. Risks and test strategy

*   **Risks**
    *   SSE 스트림 연결 해제 로직 추가 시, 파이썬 FastAPI의 비동기(`asyncio`) 제너레이터 종료 처리가 미흡할 경우 오히려 예기치 않은 서버 크래시를 유발할 수 있습니다.
    *   인가 로직(Role 기반 검증)이 추가되면서, 기존 통합 테스트 중 별도의 권한 모킹(Mocking) 없이 작성된 케이스들이 연쇄적으로 실패할 가능성이 있습니다.
*   **Test Strategy**
    *   **SSE 독립 테스트**: 더미 워크플로우를 무한 스트리밍 상태로 띄워둔 후, Cancel 요청 시 `asyncio.CancelledError`가 정상 포착되고 제너레이터가 안전하게 종료되는지 확인하는 백엔드 단위 테스트를 작성합니다.
    *   **인가 및 검증 테스트 보강**: 기존 API 단위 테스트에 `Role` 기반 권한 객체를 주입(Dependency Override)하여 테스트가 원활히 동작하도록 수정합니다. Webhook 422 에러 반환을 확인하는 Request 단위 테스트를 추가합니다.
    *   **E2E 통합 검증**: `web/tests/e2e/` 내에 Playwright 스크립트를 구성하여, `3100`(Front) 및 `3101`(API) 포트가 바인딩된 상태에서 실제 브라우저 기반 Human Gate 승인 흐름을 자동화 테스트로 증명합니다.

## 5. Design intent and style direction

*   **기획 의도**: 복잡한 에이전트 자동화 파이프라인(SDLC)을 투명하게 시각화하고, 개발자(사용자)가 불안감 없이 특정 단계(QA, Review 등)에서 개입하여 안전하게 프로세스를 통제할 수 있다는 신뢰를 주는 경험.
*   **디자인 풍**: 고밀도의 데이터를 전문적으로 다루는 개발자 친화적인 **모던 다크 대시보드형** 스타일.
*   **시각 원칙**:
    *   **컬러**: 배경은 딥 다크 그레이/블랙 기반으로 시각적 피로도를 낮추고, 상태 인디케이터(대기-주황, 성공-녹색, 실패-빨강)는 채도를 높인 액센트 컬러를 사용하여 직관성을 극대화합니다.
    *   **패딩/마진**: 시스템 로그, 노드 리스트 등은 8px~16px 단위의 조밀한 패딩을 사용하여 정보 밀도를 높입니다. 반면 캔버스의 노드 간 간격은 최소 24px 이상으로 넉넉히 주어 복잡성을 줄입니다.
    *   **타이포**: 실행 로그와 코드 스니펫 영역은 Monospace 폰트를 엄격히 적용하고, 그 외 UI 헤딩/버튼은 가독성 높은 Sans-serif 폰트로 일관되게 구분합니다.
*   **반응형 원칙**: **모바일 우선(Mobile-first) 규칙 적용**. 모바일 환경에서는 무거운 시각적 노드 캔버스 대신 세로형 상태 리스트 및 카드 UI로 폴백(Fallback) 처리하여, 관리자가 이동 중에도 긴급한 Human Gate Action(승인/반려 버튼 클릭)을 원활하게 수행할 수 있도록 구성합니다. 데스크탑 뷰어에서는 풀스크린 기반의 와이드 캔버스로 확장합니다.

## 6. Technology ruleset

*   **플랫폼 분류**: web / api
*   **web**: React 기반 라이브러리(기존 Vite/React 설정 유지), 상태 관리를 위한 훅 구조, 시각화를 위한 ReactFlow 도입, UI 스타일링을 위한 TailwindCSS (포트: `3100`).
*   **api**: FastAPI 기반 비동기 서버 구조, SQLAlchemy(Postgres/SQLite), 상태 기반 SSE 응답 관리, Playwright E2E/Pytest 통합 테스트 프레임워크 활용 (포트: `3101`).

## 7. 고도화 플랜 (Enhancement Plan)

*   `REVIEW.md`의 보안 및 엣지 케이스 수정과 자연스럽게 연계하여 아래의 사용자 경험(UX) 개선을 진행합니다.
*   **1) 인가 실패 시 안내 모달 고도화**
    *   **근거**: `REVIEW.md`의 인가(Authorization) 로직이 백엔드에 도입되면, 권한 없는 일반 사용자가 Human Gate 승인 시 403 에러를 맞닥뜨리게 됩니다. 단순 에러 메시지(토스트) 출력보다 "필요 권한(reviewer/admin) 안내 및 워크스페이스 관리자 문의"를 유도하는 모달을 띄워 사용자 경험의 일관성을 부드럽게 유지합니다.
    *   **경계**: 권한 관리(RBAC) UI 자체를 새로 만드는 것이 아니라, 에러 응답 코드를 프론트엔드에서 Catch하여 사용자 친화적인 메시지 다이얼로그로만 매핑합니다.
*   **2) SSE 연결 상태 시각화 인디케이터 추가**
    *   **근거**: `REVIEW.md`의 엣지 케이스(Zombie Connection 방지) 수정에 맞추어, 클라이언트 단에서도 현재 SSE 스트림의 연결/재연결/끊김 상태를 파악할 수 있도록 상단 GNB 영역에 작은 '상태등(Live Status Indicator)' UI를 추가합니다. 실시간 통신 상태의 투명성을 높입니다.
    *   **경계**: 별도의 폴링 메커니즘을 추가하는 것이 아닌, 기존 EventSource 객체의 상태(readyState) 변화 이벤트 리스너만을 활용하여 UI 색상을 변경합니다.
```
