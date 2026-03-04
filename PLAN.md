# PLAN

## 1. Task breakdown with priority

### 우선순위: P0 (Critical - 보안 및 시스템 안정성 확보)
- **API CORS 규칙 강화 (`api/app/main.py`)**
  - `allow_origin_regex` 범위를 점검하여 의도하지 않은 포트 접속을 차단. 3000번대 포트(예: 3100, 3101 등) 및 `manbalboy.com` 도메인 대역만 엄격하게 통과하도록 정규표현식을 수정하여 보안 정책을 강화합니다.
- **분산 환경을 위한 Rate Limiting 마이그레이션 (`api/app/core/config.py`, `api/app/main.py`)**
  - 기존 인메모리 방식(`dict`)의 Rate Limit는 스케일 아웃 시 상태 공유가 불가하므로, 이를 Redis 기반으로 마이그레이션합니다. 이를 통해 다중 워커 환경에서도 SSE 재연결 폭주를 안정적으로 방어할 수 있습니다.
- **Docker 런타임 상태 동적 검증 (`api/app/services/agent_runner.py`)**
  - 작업(Task)을 실행하기 직전 Docker 데몬의 Ping 상태를 가볍게 체크합니다. 데몬이 다운되었을 때 발생할 수 있는 스레드 고갈 및 좀비 컨테이너 누적을 조기에 차단합니다.

### 우선순위: P1 (High - 핵심 기능 및 UX 고도화)
- **Agent Marketplace 스키마 확장 및 API 구축 (`api/app/models/agent.py`, `api/app/schemas/agent.py`, `api/app/api/agents.py`)**
  - 단순 CLI 템플릿 실행을 넘어 Agent의 입출력 스키마, 툴, 프롬프트 정책을 영속성 있게 관리하기 위해 데이터베이스 스키마를 모델링하고 CRUD API를 새롭게 구현합니다.
- **대시보드 KPI 시각화 UI 구현 (`web/src/components/Dashboard.tsx`, `web/src/services/api.ts`)**
  - 단순한 상태 뱃지를 넘어서, 소요 시간(Lead time), 병목 구간 통계, 테스트 통과율 등 실질적인 워크플로우 성과를 파악할 수 있는 KPI 대시보드 시각화 기능을 프론트엔드에 추가합니다.
- **Dev Integration Webhook 연동 엔드포인트 구축 (`api/app/api/webhooks.py` 신설)**
  - 외부 이슈 트래커 및 CI/CD 이벤트(GitHub PR, 배포 프리뷰 이벤트 등)를 수신하고 파싱하여 워크플로우 엔진을 트리거하는 웹훅 처리 API를 신규로 구축합니다.

### 우선순위: P2 (Medium - 테스트 커버리지 및 신뢰성)
- **프론트엔드 KPI 대시보드 렌더링 테스트 (`web/src/components/Dashboard.test.tsx` 신설)**
  - `Dashboard.tsx`, `LiveRunConstellation.tsx` 등 핵심 KPI 뷰에 대해 Jest 및 React Testing Library(RTL)를 활용한 단위 렌더링 테스트 코드를 작성합니다.
- **Webhook 트리거 및 Rate Limiting 동시성 검증 테스트 (`api/tests/test_workflows.py` 보강, `api/tests/test_rate_limit.py` 신설)**
  - Dev Integration 웹훅 이벤트 페이로드 파싱 및 검증 로직에 대한 테스트.
  - 다중 클라이언트 요청이 쏟아지는 동시성 환경에서 Redis Rate Limiting이 정상적으로 429 응답을 반환하는지 검증합니다.

## 2. MVP scope / out-of-scope

**MVP Scope:**
- 기존 워크플로우 엔진 위에 `REVIEW.md`에서 도출된 CORS 설정 정상화, Redis 기반 Rate Limit 전환, Docker Ping 체크 등 코어 보안 및 안정성 패치 우선 적용.
- Agent Marketplace 데이터베이스 영속성(Schema & CRUD) 확보.
- 리드타임과 테스트 통과율 등 워크플로우 모니터링을 위한 프론트엔드 대시보드 KPI 뷰 추가.
- 외부 CI 이벤트를 수신할 수 있는 Webhook 엔드포인트 기초 마련.

**Out-of-scope:**
- 실시간 로그 스트리밍을 SSE(Server-Sent Events)에서 WebSocket 등 타 프로토콜로 전면 교체하는 작업 (현재의 방어 로직 강화에 집중).
- GitHub 이외의 써드파티(예: Jira, Linear)를 위한 전용 웹훅 파서의 완벽한 구현 (현재는 범용 웹훅 수신 인터페이스 규격 확립에 집중).
- 기존 내부 워크플로우 오케스트레이터를 Temporal 또는 LangGraph 같은 외부 도구로 전면 교체하는 마이그레이션.

## 3. Completion criteria

- API 서버의 CORS 정규식이 `http://ssh.manbalboy.com:3100` 등 허용된 3000번대 포트와 `manbalboy.com` 관련 호스트만 엄격하게 통과시킴을 검증.
- Redis Rate Limiting 적용 후, 부하 테스트 툴을 이용한 동시성 검증 시 허용치를 초과한 요청이 상태 코드 429로 정상 차단됨을 확인.
- 작업(Task) 컨테이너 기동 전 Docker 핑 체크가 수행되며, 의도적으로 데몬 권한을 회수한 상태에서 워커가 행(Hang)에 걸리지 않고 즉시 에러로 종료됨을 확인.
- 로컬 `http://localhost:3100` 포트로 실행된 웹 대시보드에서 시스템의 워크플로우 소요 시간, 실패/성공 비율 및 병목 지점이 차트 또는 카드로 시각화됨을 확인.
- 프론트엔드(`Dashboard.test.tsx`) 및 백엔드의 신규 웹훅/Redis 동시성 검증 테스트가 CI 파이프라인에서 모두 성공(Pass)해야 함.

## 4. Risks and test strategy

**Risks:**
- 인메모리에서 Redis로 전환함에 따라 외부 네트워크 혹은 Redis 자체의 응답 지연 시 전체 API Rate Limit 병목이 발생할 수 있음.
- Docker 데몬을 매 작업 전에 확인하는 로직이 짧은 시간 내에 다수 실행될 시 불필요한 IO 부하를 유발할 수 있음.
- 대시보드의 KPI 집계를 위해 전체 Run 데이터를 조회하게 될 경우 API 응답이 느려져 렌더링 퍼포먼스가 하락할 가능성.

**Test Strategy:**
- **동시성 및 부하 테스트**: 다수의 클라이언트 접속을 모사하는 자동화 스크립트를 작성해 Redis Rate Limiting의 차단 동작이 병목 없이 이루어지는지 검증합니다.
- **예외 및 런타임 모의 테스트 (Backend)**: Docker 환경을 모킹(Mocking)하거나 임시 컨테이너 데몬을 중지시킨 상태에서 API를 호출하여, 타임아웃 및 스레드 고갈 방지 예외 처리가 제대로 동작하는지 검증합니다.
- **단위 렌더링 테스트 (Frontend)**: 대규모 Mock 데이터를 대시보드 컴포넌트에 주입하여 지연 시간 없이 상태 변화를 제대로 렌더링하는지와 데이터가 없을 때의 Fallback UI가 나타나는지 RTL 기반으로 테스트합니다.

## 5. Design intent and style direction

- **기획 의도**: 개발 파이프라인의 진행 상황과 성능 지표(KPI)를 실시간으로 투명하게 제공하여, 사용자가 AI 자동화 프로세스를 신뢰하고 병목 구간을 빠르게 파악해 대응할 수 있는 관제(Observability) 중심의 경험을 제공합니다.
- **디자인 풍**: 데이터를 직관적으로 파악할 수 있는 모던 대시보드형 및 카드형 UI. 과도한 애니메이션이나 장식을 배제하여 프로페셔널한 엔지니어링 툴의 느낌을 강조합니다.
- **시각 원칙**:
  - **컬러**: 배경은 무채색/다크 모드 베이스를 적용하여 눈의 피로를 덜고, 성공(Green)/실패(Red)/경고(Yellow)/실행 중(Blue) 등의 명확한 시맨틱 포인트 컬러로 상태를 강하게 대비시킵니다.
  - **패딩/마진**: 넓고 일관성 있는 16px/24px 기준의 여백 시스템을 적용하여, 정보 밀도가 높은 텍스트/로그 영역과 통계 카드 영역을 시각적으로 명확하게 분리합니다.
  - **타이포그래피**: 중요한 KPI 수치는 크고 굵은 산세리프 폰트를 사용하여 시선을 끌고, 에러 로그나 코드 스니펫에는 Monospace 폰트를 사용해 가독성을 확보합니다.
- **반응형 원칙**: 모바일 우선(Mobile-first)을 기반으로 하되 주요 타겟 디바이스가 데스크탑이므로, 데스크탑에서는 CSS Grid를 활용해 다중 패널이 넓게 배치되는 구조로 확장하고, 모바일에서는 각 KPI 카드와 로그 패널이 1열 세로 스택형으로 부드럽게 재배치되도록 구현합니다.

## 6. Technology ruleset

- **플랫폼 분류**: web, api
- **web 기술**: React (Vite 기반), 로컬 프론트엔드 개발 환경은 충돌 방지를 위해 `3100`번대 포트를 사용합니다. (예: `http://localhost:3100`)
- **api 기술**: FastAPI (Python), 워크플로우 엔진 고도화 및 분산 환경 처리를 위해 Redis를 연동합니다. 로컬 백엔드 개발 환경은 `3101` 등 3000번대 포트로 구성합니다.
