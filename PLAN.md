# PLAN

## 1. Task breakdown with priority

### 우선순위 1: REVIEW 피드백 반영 (프론트엔드 모니터링 안정성 보강)
> **목적**: 장기 실행되는 Loop Engine의 방대한 상태 로그를 UI에서 안정적으로 모니터링하기 위해 기존 SystemAlertWidget의 렌더링 및 보안 결함을 수정합니다.
- **Task 1-1 [web]**: `web/src/utils/security.test.ts`에 XSS 페이로드 및 시스템 시크릿 키가 혼합된 복합 악성 데이터 주입 방어 테스트 추가.
- **Task 1-2 [web]**: `web/src/utils/alertHighlighter.test.ts`에 URL 후행에 다중 구두점 및 괄호가 포함된 엣지 케이스(`http://test.com/api?v=1.0.`) 파싱 테스트 추가.
- **Task 1-3 [web]**: `web/src/components/SystemAlertWidget.tsx` 가변 높이(Dynamic Height) 렌더링 개선. `ResizeObserver` 또는 검증된 가상화 라이브러리(`@tanstack/react-virtual` 등)를 도입하여 높이 계산 오차에 의한 스크롤 튐 버그를 수정하고, `visualViewport` 미지원 특수 환경에 대한 예외 처리 보강.
- **Task 1-4 [web]**: 3100번 포트(`PORT=3100`)를 사용하는 프론트엔드 로컬 개발 환경에서, 동적 높이를 가진 대량의 더미 로그가 연속 스트리밍될 때 UI 프레임 드랍이나 렌더링 지연이 발생하는지 검증 테스트 수행.

### 우선순위 2: Self-Improvement Loop Engine 초안 설계 및 구현 (고도화 플랜)
> **근거**: 전체 Loop Engine(Analyzer, Evaluator 등)의 실무 구현은 범위가 방대합니다. 따라서 `SystemAlertWidget`의 가변 높이 스크롤 최적화를 테스트하기 위한 대량의 실제 데이터 소스로 활용함과 동시에, Issue #71의 루프엔진 초안(MVP) 요구사항을 충족하기 위해 핵심 제어 뼈대만 자연스럽게 연계하여 구현합니다.
> **구현 경계**: 실제 코드를 수정하고 판단하는 AI 로직은 제외하며, 4단계 상태 전이(순환)와 모니터링용 이벤트 생성을 담당하는 스텁(Stub) 레이어까지만 구현합니다.
- **Task 2-1 [api]**: Loop Engine 상태 제어 API 라우터 구현 (`/api/loop/start`, `pause`, `stop`, `status`). 루프 사이클 시작과 상태 변경 명령을 수신하는 FastAPI 컨트롤러 뼈대 구축.
- **Task 2-2 [api]**: Loop Engine 컴포넌트(Analyzer, Evaluator, Planner, Executor)의 사이클 흐름을 시뮬레이션하는 비동기 워커 스텁 작성. 각 단계 전환 시 상세 상태 로그를 생성하여 브로드캐스트.
- **Task 2-3 [api/web]**: 생성된 Loop Engine의 모의 상태 로그 및 점수(Quality Score 등) 지표를 프론트엔드의 `SystemAlertWidget`으로 스트리밍하여 연동 확인.

### 변경 파일 후보 및 영향 범위
- `web/src/utils/security.test.ts`: 방어 검증 로직 추가 (영향 범위: 테스트 한정)
- `web/src/utils/alertHighlighter.test.ts`: 구두점/괄호 파싱 엣지 케이스 추가 (영향 범위: 테스트 한정)
- `web/src/components/SystemAlertWidget.tsx`: 스크롤 위치 계산 및 가상화 구조 교체 (영향 범위: 시스템 로그가 표출되는 대시보드 UI 영역 및 레이아웃 렌더링 성능)
- `api/app/api/loop_engine.py` (신규): Loop 제어용 API 엔드포인트 라우터 (영향 범위: 백엔드 API 라우팅 계층 신규 확장)
- `api/app/services/loop_simulator.py` (신규): 루프 상태 전이 및 더미 로그 스트리밍을 수행하는 스텁 비즈니스 로직 (영향 범위: 시스템 알림 생성 도메인 연동)

## 2. MVP scope / out-of-scope

### MVP Scope
- SystemAlertWidget의 URL 파서 우회 방어 및 보안 엣지 케이스 단위 테스트 보강.
- SystemAlertWidget의 가상화 스크롤을 가변 높이 아이템 대응 구조로 변경하여, 수만 건의 로그에서도 렌더링 안정성 확보.
- Self-Improvement Loop Engine의 라이프사이클(시작, 일시정지, 종료)을 제어하는 FastAPI 컨트롤러 뼈대 구현.
- 루프 엔진의 각 단계(Analyzer -> Evaluator -> Planner -> Executor)를 순회하며 발생하는 상태 변화를 SystemAlertWidget UI에 스트리밍하여 프론트엔드 로그 출력 성능 검증과 결합.

### Out-of-scope
- Loop Engine 내의 실제 AI 프롬프트 체인 호출, 소스 코드 자동 수정, Pull Request 자동 생성 등 실무 개발 자동화 파트.
- Long-Running 상태와 이력(기억)을 영구 보존하기 위한 분산 메모리 DB 아키텍처 도입.
- 기존 대시보드 레이아웃을 완전히 벗어나는 Loop Engine 전용 대규모 신규 화면 구축 (기존 모니터링 UI 및 위젯을 최대한 재활용).

## 3. Completion criteria
- `security.test.ts` 및 `alertHighlighter.test.ts`에 새로 추가된 모든 엣지 케이스 테스트가 Pass 할 것.
- `SystemAlertWidget`에 1만 건 이상의 가변 높이 로그가 유입되는 환경에서 가상화 스크롤이 매끄럽게 동작하고, 리스트 공백이나 스크롤 위치 점핑 현상이 없을 것.
- Backend API (`/api/loop/start` 등) 호출 시, 엔진 스텁이 작동하며 4단계 순환 동작 로그를 실시간으로 스트리밍하여 UI에 노출시킬 수 있을 것.
- **Deployment**: 변경 사항을 포함한 전체 시스템이 Docker 컨테이너 환경에서 정상 구동될 것.
- **Preview**: 할당된 Preview 외부 노출 포트(7000~7099) 및 기준 호스트(`http://ssh.manbalboy.com:7000`)를 통해 접속 가능하며, CORS 정책이 `manbalboy.com` 및 `localhost` 계열로 제한 유지될 것.

## 4. Risks and test strategy
- **Risk 1**: 브라우저 환경 및 `ResizeObserver` 성능 차이에 따른 가상화 렌더링 계산 오버헤드로 프레임 드랍 발생 가능성.
  - **Strategy**: 가변 아이템 캐싱 기법 및 렌더링 디바운스/쓰로틀링을 적용하고, 개발 포트(3100) 환경에서 스트레스 테스트 봇을 통해 화면 부하를 중점적으로 체크합니다.
- **Risk 2**: Loop Engine 스텁이 과도한 빈도로 이벤트를 방출 시 FastAPI 서버 혹은 브라우저 메모리 누수 발생.
  - **Strategy**: 상태 이벤트 방출 주기를 제어하고, UI에서 일정 개수 이상의 오래된 로그는 메모리에서 안전하게 정리(GC)되도록 Windowing 정책을 보강합니다.

## 5. Design intent and style direction
- **기획 의도**: 지속 발전하는 자율형 AI(Self-Improvement Loop Engine)의 동작 상태, 판단 근거, 그리고 엔진 내부의 시스템 알림을 개발자가 투명하고 직관적으로 인지할 수 있도록, 끊김 없고 가벼운 모니터링 뷰어 경험을 제공한다.
- **디자인 풍**: 모던 개발자 도구 및 터미널 콘솔(CLI)을 모티브로 한 대시보드형 로그 뷰어. 불필요한 장식과 그래픽 요소를 배제한 **미니멀 스타일**.
- **시각 원칙**: 
  - **컬러**: 어두운 배경(Dark Theme)에 가독성 높은 텍스트 하이라이트를 적용하고, 진행 상태 및 심각도에 따른 포인트 컬러(Red, Yellow, Green, Blue)를 절제하여 사용.
  - **패딩/마진**: 방대한 로그 데이터의 정보 밀도를 극대화하기 위해 여백을 타이트하게 가져가는 컴팩트한 간격(Dense Layout) 유지.
  - **타이포그래피**: 디버깅 로그와 상태 스니펫의 정렬 및 가독성 확보를 위해 시스템 기본 Monospace 폰트 적극 활용.
- **반응형 원칙**: 모바일 우선(Mobile First). 모바일 환경에서도 로그 텍스트의 가로 스크롤 혹은 자연스러운 줄바꿈(Word-wrap)을 보장하고, 텍스트가 줄바꿈되어 늘어난 높이에도 레이아웃이 유연하게 확장되도록 지원.

## 6. Technology ruleset
- **플랫폼 분류**: web, api
- **web**: React 및 Vite 환경 기반. 가상화 렌더링 지원을 위해 React 생태계의 표준화된 구현체(직접 구현 또는 `@tanstack/react-virtual` 등)를 채택하여 고성능 DOM 관리를 계획.
- **api**: FastAPI 기반. 비동기 Task 처리, 루프 상태 관리 라우터, 그리고 프론트엔드 연동을 위한 이벤트 스트리밍(SSE 또는 WebSockets) 구조로 계획.
