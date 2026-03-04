# PLAN

## 1. Task breakdown with priority
### [P0] 버그 픽스 및 보안 취약점 조치 (REVIEW 피드백 반영)
- **변경 파일 후보**: `api/app/main.py`, `api/app/services/workspace.py`
- **영향 범위**: 전역 CORS 접근 정책 및 시스템 파일 쓰기 권한.
- **작업 내용**:
  - `manbalboy.com` 서브도메인 및 포트 허용을 위한 정규식 정책 수정.
  - Workspace 경로 생성 시 `../` 등 Path Traversal 공격 방어 로직 추가.

### [P0] 워크플로우 실행 엔진 실질화 (REVIEW 피드백 반영)
- **변경 파일 후보**: `api/app/services/agent_runner.py`, `api/app/services/workflow_engine.py`
- **영향 범위**: 워크플로우 노드 실행의 상태 전이 및 실제 에이전트 커맨드 실행 흐름.
- **작업 내용**:
  - Mock(시간 대기) 로직 제거 및 실제 `bash -lc` Subprocess 호출 파이프라인 구현.
  - 여러 사용자의 폴링 요청이 발생할 때 Race Condition을 방지하기 위한 DB Row Lock(`with_for_update`) 적용.

### [P1] 유효성 검사 및 테스트 커버리지 확대 (REVIEW 피드백 반영)
- **변경 파일 후보**: `api/app/schemas/workflow.py`, `api/tests/test_workflow_api.py`, `web/src/components/WorkflowBuilder.test.tsx` (신규)
- **영향 범위**: 워크플로우 그래프 무결성 보장 및 UI 컴포넌트 렌더링 신뢰성.
- **작업 내용**:
  - 노드 1개 이상 및 순환 참조 방지를 위한 Pydantic Validator 작성 및 관련 백엔드 테스트 추가.
  - 프론트엔드 React Flow UI의 렌더링 및 엣지/노드 변경에 대한 Jest 기반 유닛 테스트 셋업.

### [P2] DevFlow 고유 워크플로우 UI 개선 (SPEC 반영)
- **변경 파일 후보**: `web/src/components/WorkflowBuilder.tsx`, `web/src/components/Dashboard.tsx`
- **영향 범위**: 사용자 대시보드 및 노드 시각화 환경.
- **작업 내용**:
  - 노드별 성공/실패 상태 색상 매핑 및 실시간 진행 상태 모니터링 기능 고도화.

---

## 2. MVP scope / out-of-scope

**MVP scope (포함 대상)**
- `manbalboy.com` 및 서브도메인 환경에서의 자유로운 API 통신 허용.
- 백엔드 기반 CLI 워커의 실제 실행 및 출력 아티팩트의 안전한 파일 시스템 저장 처리.
- 순환 참조나 빈 그래프가 철저히 배제된 무결성 높은 그래프 구조 데이터만 DB 저장.
- 상태 중복 트리거 및 DB 상태 불일치를 방지하는 안전한 상태 전이 및 폴링.

**Out-of-scope (제외 대상)**
- 백엔드 엔진을 Temporal이나 LangGraph 같은 무거운 외부 오케스트레이터 프레임워크로 전면 전환하는 대규모 작업 (현재 FastAPI 기반 자체 엔진 유지).
- 다중 조직/팀 단위에 대응하는 복잡한 권한 및 계정 체계(RBAC) 도입.

---

## 3. Completion criteria
- `http://ssh.manbalboy.com:7000` 등 다양한 서브도메인 및 포트 Origin에서 API 호출 시 CORS 에러가 발생하지 않아야 함.
- 인위적으로 `../../etc/passwd` 와 같은 조작된 노드 ID로 아티팩트 저장 요청 시, 시스템 단에서 400 에러 코드로 즉시 차단되어야 함.
- 빈 노드 구성, 순환 참조가 포함된 워크플로우 생성 요청 시 Pydantic 유효성 검사를 통해 422 상태 코드가 반환되어야 함.
- AgentRunner가 실제 CLI 스크립트 기반으로 동작하여 유의미한 터미널 출력(stdout) 및 종료 코드를 반환하고 파일에 로깅해야 함.
- 브라우저 여러 탭에서 동시 폴링을 요청해도 단일 실행 건에 대해 중복된 Subprocess 워커가 트리거되지 않아야 함.
- 프론트엔드 `WorkflowBuilder` 컴포넌트 렌더링 및 주요 액션을 검증하는 Jest 테스트가 정상 통과되어야 함.

---

## 4. Risks and test strategy
**Risks**:
- **시스템 자원 초과**: 실제 CLI Subprocess를 통한 실행으로 전환 시 무한 대기에 빠지는 비정상 프로세스가 쌓여 서버의 메모리/CPU를 고갈시킬 수 있음.
- **데이터베이스 락 지연**: `with_for_update` 도입으로 트랜잭션 점유 범위가 길어질 경우, 대시보드 상태 갱신 API 조회가 전반적으로 타임아웃에 빠질 위험 존재.

**Test strategy**:
- **보안/단위 테스트**: Pytest를 이용해 CORS 정책, Path Traversal 필터링 로직, 그래프 순환 참조 차단 케이스를 검증하는 단위 테스트 추가.
- **동시성 부하 테스트**: Pytest 비동기 픽스처(`pytest-asyncio`)를 활용한 병렬 요청 시뮬레이션을 통해 DB Lock 상태에서의 경합 안전성 검증.
- **프론트엔드 유닛 테스트**: Jest 및 React Testing Library(RTL)로 워크플로우 캔버스 초기 렌더링 및 노드 데이터 적용 시점 동작 검증.

---

## 5. Design intent and style direction
- **기획 의도**: 개발 및 자동화 파이프라인(AI 에이전트, 테스트 등)을 눈으로 확인하고 직관적으로 연결 및 제어할 수 있는 개발 워크플로우 통제 센터 경험 제공.
- **디자인 풍**: 대시보드형(Dashboard), 모던(Modern), 미니멀(Minimal). 노드 흐름과 실행 상태 데이터에 온전히 집중할 수 있는 깔끔한 카드형 인터페이스 지향.
- **시각 원칙**:
  - 상태별 직관적 인지가 가능한 시맨틱 컬러 사용 (대기: 회색, 진행: 파랑, 성공: 초록, 실패: 빨강).
  - 넉넉한 여백(Padding/Margin)을 부여하여 복잡한 노드 맵에서도 컴포넌트 간 정보 위계를 뚜렷하게 분리.
  - 가독성을 최우선으로 하는 시스템 산세리프 폰트 기반의 뚜렷한 타이포그래피. 가벼운 Vanilla CSS 토큰 사용.
- **반응형 원칙**: 기본 프레임워크는 모바일 우선(Mobile First) 규칙을 따르되, 넓은 뷰포트가 필요한 캔버스 영역의 특성상 데스크톱 환경에 최적화된 줌(Zoom)과 패닝(Panning) UI/UX를 중점 지원.

---

## 6. Technology ruleset
- **플랫폼 분류**: web / api
- **web**: React (TypeScript, Vite) 프레임워크 기반 컴포넌트 구성. React Flow 라이브러리를 이용한 시각적 그래프 UI 렌더링. 스타일링은 Vanilla CSS 사용.
- **api**: FastAPI 기반 백엔드 서비스. Python 비동기 기능을 활용한 Subprocess 워커 실행 및 SQLite/PostgreSQL 데이터베이스 연동.

---

## 7. 고도화 플랜 (Enhancement Plan)
본 단계는 `REVIEW.md`에 명시된 TODO 항목(CORS 보완, Path 보안 강화, Race Condition 방지, 에이전트 Mock 제거, 스키마 유효성 검사, UI 단위 테스트)의 필수 반영을 전제로, 현재 구조와 자연스럽게 연결되는 인접 기능 확장 계획입니다.

- **[REVIEW TODO 최우선 반영]**:
  - `manbalboy.com` 정규식 보강, Path Traversal 보안 패치, 엔진 Race Condition 방어 체계, AgentRunner 실 기동 처리 및 유효성 검사를 P0/P1 코어 태스크로 편입 및 조치.
- **추가 기능 1: 프로세스 타임아웃(Timeout) 및 강제 종료 로직 (안전 장치 추가)**
  - **근거**: AgentRunner가 더 이상 Mock이 아닌 실제 Subprocess로 동작함에 따라, 무한 루프 스크립트나 외부 네트워크 행(Hang)에 걸린 프로세스가 서버 자원을 영구 점유할 위험이 실재합니다. 이를 예방하기 위한 통제 기능이 필수적으로 동반되어야 합니다.
  - **구현 경계**: 워크플로우 노드별 최대 실행 허용 시간(예: 300초)을 정의하고, 지정된 초과 시 Python `subprocess`에 kill 시그널을 보내 강제 종료 후 상태를 `failed(timeout)`으로 처리하는 백엔드 엔진 내 기능까지만 제한적 구현.
- **추가 기능 2: 워커 로그 SSE 기반 실시간 스트리밍 뷰잉 (사용성 및 부하 개선)**
  - **근거**: 상태 Race Condition 제어를 위해 DB 락을 도입하면 잦은 폴링(Polling) 조회는 성능 저하의 주범이 됩니다. 폴링 의존도를 낮추고 진행 중인 프로세스의 텍스트 출력(stdout) 가시성을 높이기 위해 서버에서 단방향 스트리밍(SSE)으로 로그를 밀어주는 구조적 개선이 가장 자연스러운 인접 요구사항입니다.
  - **구현 경계**: `api/app/main.py`에 SSE 전용 로그 엔드포인트(`/api/workflows/runs/{run_id}/logs/stream`)를 추가하고 프론트엔드에서 `EventSource`를 사용해 로그 터미널 창 영역만 실시간으로 업데이트하는 수준으로 작업.

---

### 실행 가이드 (참고용)
- **API Server 구동**: `cd api && uvicorn app.main:app --host 0.0.0.0 --port 3000 --reload`
- **Web Frontend 구동**: `cd web && npm run dev -- --port 3001`
