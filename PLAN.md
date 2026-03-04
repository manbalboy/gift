# PLAN

## 1. Task breakdown with priority

- **[P0] API / Backend (FastAPI)**
  - Workflow Engine 구조 개편 (`workflow_id` 기반 실행 전환 및 `node_runs` 스키마 적용).
  - Agent Marketplace 스펙(입출력, 툴, 프롬프트) 표준화 및 Agent SDK 구현.
  - API 서버 시작 시점 Docker 데몬 핑(Ping) 헬스체크 로직 추가.
  - `HostRunner` 실행 차단 및 로컬 개발 전용 환경 변수 기반의 명시적 활성화 방어 코드 도입.
- **[P0] Security & Infrastructure**
  - `DockerRunner` 볼륨 마운트 시 전체 워크스페이스 루트 대신 개별 태스크에 할당된 샌드박스 전용 하위 디렉터리만 마운트하도록 권한 격리 강화 (`-v {task_specific_dir}:/workspace/workspaces:rw`).
- **[P1] Web / Frontend (React / React Flow)**
  - React Flow를 활용한 Visual Workflow Builder 노드 에디터 및 설정 UI 개발.
  - Run 상태, 리드타임, 테스트 통과율, 병목 지점을 시각화하는 KPI 대시보드 확장.
  - 실시간 로그 스트리밍(SSE/WS) 및 상태 갱신 연동.
- **[P2] Dev Integration**
  - 기존 GitHub Issues 트리거를 PR, CI 결과, 배포 프리뷰 웹훅 이벤트로 확장.

## 2. MVP scope / out-of-scope

- **MVP Scope (In-scope)**
  - 고정 파이프라인에서 벗어난 사용자 정의 워크플로우 저장 및 검증, 실행(FastAPI 기반 엔진).
  - React를 활용한 워크플로우 시각화 및 편집 인터페이스(Visual Builder).
  - Docker 기반의 고립된 샌드박스 스크립트 실행 및 결과물(Artifacts) 누적 저장.
  - 식별된 주요 보안 결함(디렉터리 트래버설 취약점, 무분별한 호스트 실행기 노출) 해결 적용.
- **Out-of-scope**
  - Temporal, LangGraph 등 외부의 무거운 오케스트레이션 프레임워크 전면 도입 (현재는 백엔드 워커 확장 구조에 집중).
  - Jira, Linear 등 외부 서드파티 이슈 트래커 양방향 동기화.
  - Kubernetes 기반의 동적 파드 프로비저닝 워커 환경 (단일 데몬 Docker 컨테이너로 한정).

## 3. Completion criteria

- 사용자가 Visual Builder(웹)에서 노드를 연결하여 워크플로우를 구성하고, 이를 성공적으로 저장/실행할 수 있다.
- 모든 API 실행 단위(Run)는 격리된 특정 워크스페이스 하위 디렉터리 컨텍스트 내에서만 작동하며 외부 디렉터리 침범이 불가능하다.
- 애플리케이션 시작 시 Docker 엔진 비활성 상태를 자동으로 감지하여 초기화 실패 오류를 명확히 뱉어낸다.
- 새로운 워크플로우 엔진이 각 단계별(Plan, Code, Test 등) 로그와 산출물을 상태별(진행 중, 성공, 실패, 승인 대기)로 누락 없이 기록한다.
- 회귀 및 통합 테스트(Docker 격리 검증, 락 폴백 모의 테스트)가 모두 통과한다.

## 4. Risks and test strategy

- **Risks**
  - 분산 락 환경(Redis) 장애 발생 시, 다중 노드 아키텍처에서 로컬 락으로 우회하며 발생할 수 있는 동시성 충돌(Race Condition).
  - 스트리밍 연결 해제 시 클라이언트 측 오류나 네트워크 불안정으로 인한 재연결 폭주(Reconnection Storm)에 따른 자원 고갈.
- **Test Strategy**
  - **E2E Integration Test**: 실제 Docker 데몬 위에서 컨테이너 스폰, 권한 드롭(`--cap-drop ALL`), 샌드박싱 적용 여부 및 프로세스 타임아웃 롤백(`docker rm -f`) 동작 검증.
  - **Mocking Recovery Test**: Redis TTL 강제 만료 및 락 해제 실패 상황을 모킹하여, 다른 워커 인스턴스가 락을 획득하고 워크플로우를 이어받을 수 있는지 복구 통합 테스트 추가.
  - **Unit Test**: Visual Builder 렌더링, API 스키마 검증, Agent SDK의 프롬프트 입출력 파싱 검증.

## 5. Design intent and style direction

- **기획 의도**: 복잡한 소프트웨어 생명주기(SDLC)를 파편화된 도구가 아닌 하나의 플랫폼에서 직관적인 노드 흐름으로 이해하고 통제할 수 있는 "AI 개발 오케스트레이션 경험"을 제공합니다.
- **디자인 풍**: 개발자 친화적인 **모던 테크니컬 대시보드형**. 장식적 요소를 배제하고 정보 밀도와 가시성에 집중한 IDE 라이크(IDE-like) 스타일.
- **시각 원칙**:
  - **컬러**: 다크 모드(Dark Mode)를 기본으로 하며, 실행 상태를 명확히 구분하는 시맨틱 컬러(초록/정상, 빨강/에러, 파랑/진행중, 주황/대기)를 액센트로 활용합니다.
  - **패딩/마진**: 넓고 유연한 캔버스 영역(워크플로우 에디터)을 확보하되, 사이드 패널과 로그 뷰어는 8px 배수의 컴팩트한 그리드로 구성하여 스크롤 낭비를 줄입니다.
  - **타이포**: 코드 스니펫 및 터미널 로그에는 Monospace 폰트를 사용하고, 시스템 UI 요소에는 가독성 높은 현대적 Sans-Serif 타이포그래피를 적용합니다.
- **반응형 원칙**: 워크플로우 생성 및 코드 리뷰의 복잡도를 고려해 **데스크톱(PC) 웹 뷰를 최우선**으로 설계합니다. 모바일 화면에서는 노드 편집을 제한하고, 실행 상태 모니터링 및 단순 승인(Approve/Reject) 인터페이스에 집중합니다.

## 6. Technology ruleset

- **플랫폼 분류**: web / api
- 웹(Frontend)은 **React (Vite/Next.js)** 와 React Flow 라이브러리를 기반으로 계획하며, 로컬 실행 포트는 `3000`을 사용합니다.
- API(Backend)는 **FastAPI** 기반으로 비동기 처리 및 워크플로우 엔진을 계획하며, 로컬 실행 포트는 `3001`을 사용합니다. (실행 가이드 기준 3000번대 포트 할당)

## 7. 고도화 플랜

- **TODO 반영 항목**
  - 개별 태스크 실행 환경 완전 격리: `DockerRunner` 볼륨 마운트 경로를 개별 샌드박스 디렉터리(`-v {task_specific_dir}:/workspace/workspaces:rw`)로 제한.
  - 컨테이너 제어 완결성 검증: 실제 Docker 데몬 구동 하에 컨테이너 스폰 및 롤백 라이프사이클을 추적하는 Integration Test Code 추가.
  - 다중 노드 락 아키텍처 보강: Redis 장애 시 `LocalLock` 동작이 단일 인스턴스에만 국한됨을 인지하고, 다중 서버 분산 환경 충돌 방지 대책을 아키텍처 문서에 명시.
  - 안전한 러너(Runner) 통제: `HostRunner`를 철저히 차단하거나, 로컬 전용 개발 환경 변수를 주입했을 때만 켜지도록 방어 로직 적용.
  - 사전 장애 차단: API 구동 라이프사이클 훅에 Docker Daemon Health Check(Ping) 로직 편입.

- **추가 확장 기능**
  - **기능 1: SSE 스트림 재연결 폭주 방어 (Rate Limiting) 미들웨어 적용**
    - **근거**: REVIEW.md에 엣지 케이스로 명시된 바와 같이, 외부 네트워크 불안정으로 인해 브라우저 등 클라이언트가 비정상적인 재연결을 시도할 경우 백엔드 프로세스가 고갈되는 폭주 현상(Reconnection Storm)이 생길 수 있습니다. 이를 근본적으로 차단하기 위한 시스템 안정성 확보가 필요합니다.
    - **구현 경계**: 실시간 로그를 전달하는 FastAPI SSE 엔드포인트 단에 인메모리 방식의 IP/세션 기반 Rate Limiting(예: 1초당 재연결 한계 설정)을 부여하여, 한도를 초과하면 HTTP 429(Too Many Requests)를 반환하도록 방어 계층만 추가합니다. (복잡한 Redis 기반 Rate Limiting은 초기 MVP에서 제외하여 복잡도를 낮춤)
