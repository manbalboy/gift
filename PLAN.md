# PLAN

## 1. Task breakdown with priority

### P0 (Critical) - 시스템 안정성 및 핵심 워크플로우 개선
- **API CORS 설정 강화 (`api/app/main.py`)**: `manbalboy.com` (서브도메인, 포트 포함) 및 `localhost`에 대한 정밀한 정규식 기반 CORS 허용 로직 적용. 악의적인 유사 도메인 방어.
- **Path Traversal 방어 (`api/app/services/workspace.py`)**: 워크스페이스 경로 및 파일명, 아티팩트 처리 시 `../` 등 악의적 디렉토리 탐색 문자열 필터링 및 절대 경로 이탈 방지 검증 로직 구현.
- **Workflow Engine 동시성 제어 (`api/app/services/workflow_engine.py`)**: 다중 폴링(여러 탭 등) 시 Race Condition 방지를 위해 DB 트랜잭션에 `with_for_update` Row Lock 적용. 단일 워커만 실행되도록 보장.
- **실제 Subprocess 워커 연동 및 안전장치 (`api/app/services/agent_runner.py`)**: 기존 Mock 동작을 제거하고, `bash -lc`를 이용한 실제 에이전트 CLI 프로세스 호출 파이프라인 연동. 무한 루프나 외부 API 행(Hang) 방지를 위한 프로세스 실행 타임아웃(Timeout) 및 강제 종료(Kill Signal) 안전장치 추가.
- **워크플로우 그래프 무결성 검증 (`api/app/schemas/workflow.py`)**: 노드 최소 1개 이상 조건 및 순환 참조(Cycle)를 탐지하여 차단하는 Pydantic Validator 추가.

### P1 (High) - 테스트 커버리지 및 UI 안정성 확보
- **백엔드 검증 테스트 작성 (`api/tests/`)**: 
  - `test_workspace_security.py` 신설하여 Path Traversal 방어 테스트 집중 검증.
  - `test_workflow_api.py`에 빈 노드, 순환 참조 차단 예외 처리 테스트 추가.
  - `test_workflow_engine.py`에 병렬 요청 시 동시성 락(Race condition 방어) 작동 및 워커 타임아웃, 프로세스 강제 종료 검증 테스트 구현.
- **프론트엔드 UI 컴포넌트 유닛 테스트 (`web/src/components/WorkflowBuilder.test.tsx`)**: React Flow 기반 캔버스 렌더링, 노드 상태(running, done, failed 등) 변화 매핑 및 시각적 피드백 검증을 위한 Jest 기반 UI 유닛 테스트 작성.

### P2 (Medium) - 고도화 및 운영성 개선
- **에이전트 워커 강제 종료 시 상태 보상 및 추적 로직**: OOM이나 시스템 재시작, 타임아웃 등으로 워커 프로세스 강제 종료 시, DB 상태가 영원히 `running`에 머물지 않도록 보상 트랜잭션을 통해 상태를 `failed`로 변경하고, 타임아웃 또는 종료 사유를 로그와 노드 실행 이력에 명확히 기록.

## 2. MVP scope / out-of-scope

### In-Scope (MVP)
- 시스템 무한 대기, Race Condition, 경로 탐색(Path Traversal), CORS 등 보안 및 기능적 치명타(REVIEW.md 대상)의 완벽한 해결.
- CLI 에이전트를 호출하는 실제 워커 연동과 이를 멈추게 하지 않는 프로세스 타임아웃 안전망 구축.
- 그래프 순환 참조를 사전 차단하는 워크플로우 데이터 무결성 확보.
- 프론트엔드(WorkflowBuilder) 노드 렌더링의 단위 테스트 커버리지 확보.
- 로컬 및 지정된 프리뷰 환경(포트 7000-7099)에 맞춘 접근 허용 제어.

### Out-of-Scope
- Temporal 또는 LangGraph 등 신규 외부 워크플로우 오케스트레이션 엔진 전면 교체 (기존 엔진의 DB Lock 및 타임아웃 처리 보강으로 MVP 목적 달성).
- 복잡한 사용자 역할 기반 접근 제어(RBAC) 및 인증 체계의 신규 도입 (보안은 Path Traversal 및 CORS 방어에 집중).
- 웹소켓(WS/SSE) 기반 실시간 로그 스트리밍 전면 구현 (우선 현재의 폴링 안정화 및 동시성 제어를 목표로 함).
- 프론트엔드 전체 시스템의 E2E 테스트 구성 (요청된 `WorkflowBuilder.test.tsx` 작성까지만 커버).

## 3. Completion criteria
- `api/app/main.py`의 CORS 설정이 `manbalboy.com` 및 `localhost` 계열 도메인과 특수 포트 변형을 완벽히 허용하며, 악의적 변형(예: `amanbalboy.com`)은 차단함.
- `api/app/services/workspace.py`에서 파일 오퍼레이션 수행 시 `../../etc/passwd`와 같은 경로를 입력하면 400 에러를 반환하고 파일 시스템 접근을 거부함.
- 동일한 워크플로우 Run ID에 대해 다중 요청이 쏟아져도 DB Row Lock에 의해 단 한 번만 `bash -lc`가 실행됨.
- 의도적으로 무한 루프 스크립트를 워커에 주입했을 때, 설정된 타임아웃 임계치 도달 시 워커가 강제 종료되고 노드 상태가 `failed`로 기록됨.
- 노드가 없거나 A->B->A 형태의 순환 참조를 가진 워크플로우를 저장/실행 요청 시 422 상태 코드로 방어됨.
- 백엔드(Pytest)의 모든 보안, 동시성, API 예외 테스트가 성공하며, 프론트엔드(Jest)의 워크플로우 빌더 렌더링 테스트가 통과함.

## 4. Risks and test strategy

### Risks
- **서브프로세스 관리 및 좀비 프로세스**: `bash -lc`로 실행된 에이전트 자식 프로세스가 타임아웃 시그널을 무시하거나 자식의 자식을 낳아 좀비 프로세스로 남을 위험이 있습니다. 
  - *해결 방안*: Python `subprocess` 호출 시 프로세스 그룹(PGID)을 생성하여 타임아웃 발생 시 해당 그룹 전체에 강제 종료 시그널(SIGKILL)을 전파하도록 구현합니다.
- **CORS 정규식의 엣지 케이스 취약점**: 정규식이 너무 엄격하여 프리뷰 환경의 포트 통신이 막히거나, 오리진 끝의 슬래시(`/`) 여부 등에 따라 API 호출이 실패할 수 있습니다.
  - *해결 방안*: 여러 오리진 시나리오를 망라한 Pytest 파라미터화(parameterize) 테스트를 작성하여 정규식을 철저히 검증합니다.

### Test Strategy
- **보안/엣지 케이스 단위 테스트**: CORS 허용 리스트 정규식과 Path Traversal 공격 패턴 문자열을 다양하게 주입하는 백엔드 단위 테스트 작성.
- **비동기 동시성 부하 테스트**: `pytest-asyncio`를 활용하여 동일 워크플로우 ID에 대한 비동기 병렬 트리거를 발생시킨 후, 최종적으로 DB 락이 정상 작동하여 단 1개의 상태만 진행 중인지 단언(Assert)합니다.
- **프로세스 제어 모의 테스트**: 백엔드 워커 테스트에서 `sleep 10`과 같이 지연이 긴 프로세스를 호출하고, 시스템 타임아웃을 1초로 짧게 설정하여 Exception 발생 및 자원 회수를 확인합니다.
- **UI 상태 렌더링 테스트**: `web/src/components/WorkflowBuilder.test.tsx`에서 React Testing Library를 사용하여 가상의 노드 데이터 주입 시 시각적 상태(예: 에러 뱃지, 로딩 스피너)가 정확히 DOM에 매핑되는지 검증합니다.

## 5. Design intent and style direction
- **기획 의도**: 복잡한 AI 에이전트 체인과 SDLC 개발 단계를 사용자가 투명하게 관측하고 안심하고 위임할 수 있는 "신뢰성 높은 중앙 관제소" 경험을 제공합니다. 오류가 발생하거나 중단되더라도 언제든 안전하게 추적 가능해야 합니다.
- **디자인 풍**: 모던 대시보드형 (Modern Dashboard), 개발자와 관리자 모두에게 친화적인 다크/라이트 테마 기반의 노드 에디터 및 카드형 레이아웃 스타일.
- **시각 원칙**: 
  - **컬러**: 실행 상태(Running, Failed, Done, Review Needed)를 즉각 인지할 수 있도록 명도/채도 대비가 뚜렷한 포인트 컬러 사용 (Red/Green/Yellow). 배경은 눈의 피로도를 최소화하는 무채색(Slate/Zinc 계열) 채택.
  - **패딩/마진**: 시각적 노이즈를 줄이고 데이터 가독성을 높이기 위해 넉넉한 화이트스페이스(여백) 적용 및 노드 간 간격 확보.
  - **타이포그래피**: 시스템 가독성이 뛰어난 산세리프(San-serif) 폰트를 기본으로 하되, 터미널 로그, 코드 스니펫, 에이전트 출력물 등에는 고정폭(Monospace) 폰트를 엄격히 분리 적용.
- **반응형 원칙**: 워크플로우 캔버스(빌더) 영역은 데스크탑 환경(폭 1024px 이상)을 최우선으로 최적화하여 넓은 뷰포트에서 조작 편의를 제공하고, 모바일 해상도에서는 편집 기능을 숨기거나 읽기 전용(Read-only) 리스트/카드 뷰로 스택(Stack) 폴백(Fallback)을 지원합니다.

## 6. Technology ruleset
- **플랫폼 분류**: web, api
- **프론트엔드 (web)**: 
  - React, TypeScript, Vite 기반으로 구현합니다.
  - 시각적 노드 에디터는 `reactflow` 라이브러리를 핵심 기반으로 사용합니다.
  - 로컬 실행 시 개발 포트는 3000번대(예: 3000)를 사용합니다.
  - 테스트는 Jest와 React Testing Library 구조를 채택합니다.
- **백엔드 (api)**: 
  - FastAPI (Python) 기반으로 설계 및 구현합니다.
  - 서브프로세스 제어 시 Python `subprocess` 표준 라이브러리를 활용하고 그룹 프로세스 관리를 연계합니다.
  - 트랜잭션 및 Row Lock 동시성 제어는 SQLAlchemy의 기능(`with_for_update`)을 활용합니다.
  - 테스트 프레임워크는 Pytest 및 `pytest-asyncio`를 사용합니다.
