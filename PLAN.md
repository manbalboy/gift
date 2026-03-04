# PLAN
        ** 절대 우선순위 ** 
        최소 기능 구현이 미흡합니다. 아래 제시된 디렉토리를 파악하여 아래의 요구사항을 최고 우선순위로 두고 작업을 수행해주세요
        ---
        참고 디렉토리 
        절대경로 
        /home/docker/agentHub/workspaces/main

        상대경로 
        workspaces/main
        --- 
        1.위의 폴더 안의 프로젝트 기능들을 살펴보고 모두 구현해주세요 (비슷 동일한 사용법으로 )
        2.폴더안에 기능을 구현하는게 요구사항이 제일 우선순위가 높습니다. 
        3.아래의 기입된 사항은 제가 미흡하다고 생각하는 부분입니다. 고려해서 수정방향을 잡아주세요 대시보드 역할만하는게 아니라  
          어드민기능까지 내포되어야하는 화면을 구성해야합니다. 


        - 실행이 백그라운드 워커가 아니라 “조회 API 호출 시 1스텝 진행” 구조입니다.
          - run 생성은 큐만 쌓음: create_run:88
          - 실제 실행은 refresh_run에서만 진행: refresh_run:125
          - 그래서 GET /runs/... 류를 안 치면 실행이 안 굴러갑니다: API get_run:199
        - 프론트가 SSE 이벤트 받을 때 다시 getRun/getConstellation 호출해서 실행을 “밀어주는” 구조입니다.
      - App onRunStatus:106
      - 즉 UI/클라이언트가 사실상 실행 트리거 역할을 합니다.
  - 그래프의 edges가 실행 로직에서 사실상 무시됩니다. 노드 배열 순서(sequence)만 사용합니다.
      - sequence 부여:96
      - queued 첫 노드 실행:147
      - constellation 링크도 edge가 아니라 단순 인접 연결: constellation:235
  - 아티팩트가 실제 실행 결과물이 아니라 고정 템플릿 문자열입니다.
      - write_artifact 호출:199
  - 아티팩트 조회 API가 없고 UI도 경로 문자열만 보여줍니다.
      - artifact_path 사용 위치:290
  - agents API는 있으나 Web UI에서 연결되지 않습니다.
      - agents API:1
  - 워크플로우는 run 1번이라도 생기면 수정 불가(409)라 운영 UX가 매우 딱딱합니다.
      - update 제약:146 


그리고 지금 main은 실제 서비스가 돌아가고 있습니다. 설정값 확인하여 ai 를 셋팅하고 테스트를 진행해야합니다. 
같은 환경변수를 사용하여 git에 붙어야합니다. 충돌을 피하기위해서 태그를 다르게 해서 테스트를 진행하세요 
작업 충돌을 피하기위해 6000번 포트로 사용하고 cli 에이전트들도 격리된 환경에서 해주세요 
최소 기능이 main 보다는 더 좋은기능 확장성있는 형태 입니다. 꼭 구현하고 테스트 할수 있는 환경을 만들어주세요 



절대 제약사항은 다음과 같습니다. 
-- ** workspaces/main 안에 파일은 읽기만 해야합니다. 수정이나 삭제 하면안됨 **

## 1. Task breakdown with priority

(본 계획은 SPEC 문서를 바탕으로 REVIEW.md의 버그 및 개선 요구사항을 우선적으로 반영하여 작성되었습니다.)

**P0: 핵심 버그 및 보안 결함 수정**
- `web/src/components/Toast.tsx` 개선:
  - `durationMs` 음수 파라미터 유입 시 기본값(Fallback)으로 처리하는 방어 로직 추가.
  - 긴 텍스트(대량 로그, 에러 스택) 노출 시 UI 레이아웃 깨짐을 방지하기 위해 `word-break: break-all` CSS 속성 추가.
  - 노드 실패 알림 폭주로 인한 화면 가림 현상 방지를 위해 Toast 큐잉(Queueing) 스케줄러를 도입하고, 동시 노출 개수를 제한(예: 최대 3개)하는 로직 구현.
- Webhook 보안 강화 및 검증 (`api/app/api/webhooks.py` 및 관련 테스트):
  - Webhook 수신 엔드포인트에 대한 IP 검증(Spoofing 차단) 및 요청 헤더의 HMAC 암호화 서명 검증 로직 고도화.
  - 유효하지 않은 HMAC 서명 및 비정상 IP 접근을 차단하고 401/403 응답을 반환하는 방어 단위 테스트 작성.

**P1: UI/API 연동 및 워크플로우 안정화**
- Visual Workflow Builder 기능 동기화 (`web/src/components/WorkflowBuilder.tsx` 및 백엔드):
  - ReactFlow 캔버스에서 편집된 노드/엣지 데이터 구조를 백엔드의 `validate_workflow` API 페이로드 규격에 완벽히 맞춰 동기화 및 형변환 처리.
  - 워크플로우 저장 로직 연동 및 드라이런(시뮬레이션) 기능 연결.
- Human Gate 안정성 및 권한 부여 (`api/app/api/workflows.py` 등):
  - Human Gate 승인(Approve) 처리 API 호출 시, 작업자의 권한 검증 로직 및 워크플로우 워커의 실행 컨텍스트 정합성 체크 로직 추가.
  - 장시간 `approval_pending` 상태로 대기한 이후에 Human Gate를 승인했을 때, 엔진이 상태를 잃지 않고 다음 노드로 정상 이행(Resume)되는지 확인하는 통합 테스트 작성.

**P2: 성능 최적화 및 추가 검증**
- 대용량 아티팩트 렌더링 최적화:
  - 수십 MB 크기의 로그나 스크린샷 렌더링 시 브라우저 메모리 초과(Crash)를 막기 위해, 프론트엔드 뷰어에 성능 최적화(Chunk loading 혹은 가상화 기법) 적용.
- 스트림 누수 방지 및 로컬 부하 테스트:
  - 다수 클라이언트의 연결 및 강제 종료가 반복되는 상황에서 SSE 스트림(`active_stream_connections`)이 해제되지 않고 누수되는 여부를 확인하는 로컬 부하 테스트 스크립트 작성.
- Workflow Builder E2E 테스트 보강:
  - 로컬 테스트 포트 `3100`을 활용하여, 캔버스 드래그, 순환 연결 에러 방어 로직 동작, 드라이런 시뮬레이션 성공 여부를 검증하는 Playwright E2E 스크립트 작성.

**고도화 추가 기능 (REVIEW 반영에 따른 인접 기능)**
- **워크플로우 실행 중도 취소(Cancel) 로직 안전성 강화**:
  - **근거**: 현재 Human Gate 대기 상태나 큐잉된 상태에서 문제 발생 시, 사용자가 직접 해당 실행(Run)을 취소할 수 있는 수단이 미비할 경우 워커 리소스와 스트림 연결이 낭비될 수 있습니다.
  - **구현 경계**: 백엔드 `/api/runs/{run_id}/cancel` API 고도화. 실행 중인 노드의 강제 종료(Graceful Shutdown)를 유도하고 DB 상태를 원자적(Atomic)으로 `cancelled` 처리하여 리소스(로컬 스레드 및 SSE 채널)를 안전하게 회수합니다.

## 2. MVP scope / out-of-scope

**MVP Scope**
- Toast 알림 컴포넌트의 비정상 값(음수 타이머) 방어 및 다량의 에러 메시지에 대한 시각적 큐잉 시스템 안정화.
- ReactFlow 기반 워크플로우 에디터의 완벽한 백엔드 API 연동(저장 및 유효성 검사) 및 E2E 테스트.
- 외부 Webhook 요청에 대한 강력한 보안 방어막(IP/HMAC 서명) 구축 및 커버리지 달성.
- Human Gate의 권한 검증 추가 및 상태 재개(Resume) 통합 테스트 완료.
- E2E 테스트 프레임워크 동작 확인(포트 `3100` 환경).

**Out-of-scope**
- n8n과 같이 플러그인 형태로 완전히 자유로운 커스텀 노드를 추가하는 기능 (사전 정의된 노드 타입만 지원).
- Temporal, Kubernetes 등 외부의 거대한 워크플로우 오케스트레이션 엔진으로의 전면 마이그레이션 (현재 FastAPI 내장 엔진으로 요건 충족).
- 세밀한 조직 단위 RBAC(Role-Based Access Control) 시스템 구축 (단일 Secret 기반의 인가로 한정).

## 3. Completion criteria

- 여러 개의 에러가 동시에 발생해도 Toast 알림이 최대 설정 갯수(예: 3개) 이하로만 표시되며 큐를 통해 순차적으로 노출되는가?
- Webhook 수신 엔드포인트에 잘못된 서명이나 인가되지 않은 IP로 요청 시, 올바르게 401/403 HTTP 상태 코드를 반환하며 테스트를 통과하는가?
- Workflow Builder에서 노드 간 연결 및 저장 액션 수행 시, 백엔드 규격에 맞는 페이로드 전송으로 422 에러 없이 성공적으로 데이터베이스에 반영되는가?
- Human Gate(`approval_pending`) 노드에서 오랜 시간 대기 후에도 권한 체크와 함께 Resume API가 정상 작동하여 다음 노드 단계로 진행되는가?
- SSE 스트림 강제 연결 종료 스크립트 실행 후, 활성화된 연결 풀(Connection Pool)이 정상적으로 0으로 반환되며 메모리 누수가 발생하지 않는가?
- `npm run test:e2e` 커맨드로 실행된 Workflow Builder Playwright 테스트가 충돌 없이 100% 통과하는가?

## 4. Risks and test strategy

**Risks**
- **ReactFlow 노드 상태 불일치**: 프론트엔드 UI의 노드 그래프 상태와 백엔드의 DAG(Directed Acyclic Graph) 제약 조건 간 스키마 매핑 과정에서 누락이 발생하여, 사용자가 올바른 워크플로우를 저장하지 못할 위험.
- **스트림 자원 누수 및 메모리 초과**: SSE를 통한 실시간 로그 관측 중 네트워크 단절 처리 미흡으로 메모리 릭이 발생하거나, 프론트엔드에서 수십 MB 규모의 아티팩트를 단번에 렌더링하며 브라우저 크래시를 유발할 위험.
- **테스트 환경 포트 충돌**: 로컬 테스트 환경의 포트 충돌로 인한 CI/CD 파이프라인 상의 플래키(Flaky) 에러 발생.

**Test Strategy**
- **Frontend E2E Test**: Playwright를 이용해 포트 `3100`으로 독립된 환경을 띄우고, 실제 캔버스 드래그, 무한 루프/순환 연결 에러 메시지 팝업, 저장 시뮬레이션 시나리오를 자동화 검증.
- **Backend Unit Test**: `pytest`를 활용하여 HMAC 서명 생성과 IP 변조 시나리오를 모킹(Mocking)해 Webhook 보안 방어 로직의 예외 상황을 꼼꼼히 확인.
- **Load & Integration Test**: Python 스크립트로 SSE 엔드포인트에 다수의 동시 접속을 발생시킨 뒤 강제 종료하여 커넥션 풀을 검증. Human Gate 관련하여 Mock 타임을 주입하여 장기 대기 후 Resume 성공 여부를 통합 테스트로 확인.

## 5. Design intent and style direction

- **기획 의도**: 개발 파이프라인과 AI 에이전트의 작동 흐름을 사용자가 투명하게 관측하고 관리할 수 있도록 한다. 특히 에러나 승인 대기 등 사용자의 액션이 필요한 순간에 알림이 화면을 방해하지 않고 직관적인 인지를 돕도록 설계한다.
- **디자인 풍**: 모던 대시보드(Modern Dashboard) 및 노드/카드형 인터페이스.
- **시각 원칙**:
  - **컬러**: 시스템의 상태(성공, 실패, 대기)를 명확히 알 수 있는 Semantic Color를 활용하며, 시각적 피로를 낮추기 위해 배경색은 차분한 톤으로 구성.
  - **패딩/마진**: 워크플로우 캔버스 영역은 화면의 맥락을 넓게 활용하고, 플로팅 UI(Toast 알림, 노드 속성 패널)에는 충분한 여백(16px~24px)과 은은한 드롭 섀도우를 부여해 레이어 간 계층감을 분리.
  - **타이포그래피**: 로그와 코드를 표시하는 곳은 모노스페이스(Monospace) 폰트를 적용해 가독성을 높이고, 알림이나 본문 텍스트는 산세리프 폰트를 사용하여 `word-break: break-all`로 화면 밖 이탈을 방지.
- **반응형 원칙**: 모바일 우선(Mobile First) 고려. 좁은 화면에서는 속성 창이나 메뉴를 Drawer 형태로 숨겨 캔버스 가시성을 최대한 확보하고, Toast 알림 너비 역시 모바일 뷰포트 폭에 맞게 자동으로 축소 조정.

## 6. Technology ruleset

- **플랫폼 분류**: web 및 api
- **web**: 
  - React 18, Vite, TypeScript 생태계 기반 구성.
  - Visual Node Editor 구현을 위해 ReactFlow 라이브러리 사용.
  - E2E 테스트는 Playwright, 로컬 프리뷰 및 테스트는 `3100` 포트 고정 실행 규칙 적용.
- **api**: 
  - FastAPI (Python) 기반 비동기 웹서버.
  - SQLAlchemy 기반으로 RDBMS(Postgres/SQLite 호환) 구성 및 워크플로우 상태 관리.
  - 보안/유닛 테스트는 `pytest` 활용.
