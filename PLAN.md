```markdown
# PLAN

## 1. Task breakdown with priority

### 우선순위: P0 (핵심 기능 및 치명적 버그 수정)
- [x] (API) **Workflow Engine v2 코어 전환**: 고정 Orchestrator를 `workflow_id` 기반 정의 실행으로 전환, `node_runs` 기록 저장 및 fallback(`default_linear_v1`) 지원 (Phase 1).
- [x] (API) **SSE 스트림 동시성 확보**: `_stream_workflow_runs_events` 내 전역 변수(`active_stream_connections`)에 Threading Lock 적용.
- [x] (API) **보안 강화 (IP Spoofing 방어)**: `_extract_client_key` 로직에 Trusted Proxy 검증 및 안전한 클라이언트 IP 추출 알고리즘 도입.
- [x] (API) **무결성 보호**: 실행(`Run`) 이력이 있는 Workflow의 수정(`PUT`) 요청 차단 또는 버전 관리 로직 구현 및 테스트 추가.
- [x] (API) **Agent SDK & Marketplace 기반**: Agent Spec/버전/폴백 명세, CLI 어댑터 표준화 (Phase 2).
- [x] (API/Web) **Human Gate & Resume API**: 테스트/리뷰 단계의 승인/수정/거절(approval) API 구현 및 상태(pending, resume) 관리.

### 우선순위: P1 (주요 UI/UX 개선 및 아티팩트 관리)
- [ ] (Web/API) **Visual Workflow Builder 기본 구현**: ReactFlow를 활용한 노드/엣지 편집기 캔버스 구현 및 서버 측 validate API 연동 (Phase 5).
- [ ] (Web) **Toast UI 안정성 개선**: `durationMs` 음수 입력 방어 코드 추가, 긴 문자열 오버플로우 방지(`word-break: break-all`, `overflow-wrap: anywhere` 등) 적용.
- [ ] (Web) **UI/UX 엣지케이스 방어**: 비정상 종료 시 리소스 누수 방지, 객체 직렬화 오류 대비 fallback UI 처리.
- [ ] (Web) **E2E 테스트 강화**: 브라우저 환경에서 `WorkflowBuilder` 캔버스 노드 조작 및 시각화 검증을 위한 Playwright E2E 테스트 추가.
- [ ] (API/Web) **Artifact-first Workspace 구축**: 산출물(리포트, 스크린샷, diff 등) 중심의 레지스트리 및 UI 타임라인/뷰어 연동.

### 우선순위: P2 (고도화 및 추가 개선)
- [ ] (Web) **Toast 알림 고도화**: 알림 화면 가림 방지를 위한 최대 노출 개수 제한 및 큐잉(Queueing) 스케줄링 로직 구현.
- [ ] (Web) **디버깅 편의성 강화**: 에러/디버깅 객체 출력을 원클릭으로 복사할 수 있는 클립보드(Copy to Clipboard) 액션 버튼 UI 추가.
- [ ] (API) **Dev Integrations 확장**: GitHub PR/CI/Deploy 이벤트 기반 트리거 룰 엔진 연동.

## 2. MVP scope / out-of-scope

**MVP Scope**
- FastAPI 기반 Workflow Engine v2 (저장소의 `workflows.json` → DB 점진 이관 및 노드 단위 실행/재시도 체계 확립).
- React(Vite) 기반 워크플로우 에디터(Visual Workflow Builder)의 핵심 기능(노드 추가/검증/저장).
- 리뷰 지적 사항인 API 보안/동시성 버그 수정 및 무결성 보장(실행 이력 있는 워크플로우 수정 제한).
- React UI(Toast)의 타이머/오버플로우 안정성 확보 및 개선(큐잉, 복사 버튼), WorkflowBuilder 캔버스 Playwright E2E 테스트 작성.
- 아티팩트 및 Human Gate(승인/대기) 상태의 기본 구조 및 API.

**Out-of-scope**
- 분산 처리/큐 시스템(Temporal, Redis Streams 등)의 전면 도입 (MVP 이후의 스케일아웃 단계에서 고려).
- 에디터 내의 복잡한 시뮬레이션 드라이런(Dry-run) 실행 시나리오의 완벽한 재현.
- 워크플로우 빌더의 모바일 완벽 대응 (MVP 단계에서는 뷰어 수준 유지, 편집은 데스크톱 뷰포트 기준 최적화).
- Agent Marketplace의 외부 결제/과금 시스템 연동.

## 3. Completion criteria

- **API 신뢰성**: FastAPI 서버(`api/` 디렉토리) 구동 시 다중 클라이언트 SSE 연결/해제 과정에서 카운터가 어긋나지 않으며, `x-forwarded-for` 변조 시에도 정확한 IP 또는 차단이 이루어짐을 pytest로 증명한다.
- **데이터 무결성**: 이미 실행 이력이 존재하는 `workflow_id`에 대해 수정(PUT) API 호출 시 400/409 에러 응답 혹은 새로운 버전으로 분기 처리됨을 확인한다.
- **웹 UI 상호작용**: 로컬 3000번대 포트(예: Web 3000, API 3001)에서 구동되는 대시보드에서 ReactFlow 빌더 캔버스 접근, 노드 추가 및 연결, 저장 API 연동이 정상적으로 동작함을 Playwright E2E 시나리오가 통과하는 것으로 검증한다.
- **UI 컴포넌트 강건성**: `Toast` 알림에 악의적인 긴 텍스트나 음수 타이머가 주입되어도 레이아웃이 깨지거나 즉각 언마운트되지 않으며, 다수의 알림 발생 시 최대 개수에 맞춰 큐잉 처리됨을 테스트로 확인한다.
- **기능 동작**: `workflow_id` 기반으로 Worker가 Job을 수행하고 그 단계별 내역이 `node_runs` 기록으로 DB/저장소에 남으며, 실패 또는 승인 대기 시 상태 전이가 정상적으로 이뤄져야 한다.

## 4. Risks and test strategy

- **동시성 및 레이스 컨디션 리스크 (API)**: FastAPI SSE 제너레이터 내 전역 상태 및 자원 해제 문제 발생 가능성.
  - *대응 전략*: 스레드 `Lock`을 명시적으로 적용하고, `pytest-asyncio` 및 멀티스레드 부하 테스트 도구를 사용해 스트림 연결/종료 반복 시 자원 누수를 검증.
- **UI 복잡도 및 레이아웃 파괴 리스크 (Web)**: ReactFlow 기반 워크플로우 에디터의 복잡한 DOM 구조와 Toast 컴포넌트의 모바일 뷰 렌더링 문제.
  - *대응 전략*: Playwright E2E 테스트(기존 `toast-layering.spec.ts` 확장 및 신규 작성)로 데스크톱 캔버스 조작과 모바일 뷰포트에서의 텍스트/알림 말림 현상을 시각적 회귀(Visual Regression) 수준으로 검증.
- **보안 및 무결성 침해 리스크 (API)**: 프록시 우회 및 운영 중인 파이프라인 무단 수정.
  - *대응 전략*: 신뢰할 수 있는 프록시 대역(Trusted Proxy)을 설정에 추가하고 가짜 IP 헤더 주입 테스트 스크립트를 작성하여 403/429 발생 여부를 검증. 수정 불가 상태 워크플로우에 대한 통합 테스트(Integration Test) 추가 작성.

## 5. Design intent and style direction

- **기획 의도**: 개발 파이프라인 및 에이전트 워크플로우를 단순 로그 나열이 아닌 시각적인 노드/엣지 흐름과 실물 아티팩트 중심으로 전환하여, 사용자가 개발/리뷰 진행 상황을 한눈에 파악하고 개입(승인/수정)할 수 있는 생산적인 플랫폼 경험을 제공한다.
- **디자인 풍**: 모던 대시보드형 및 노드 기반 에디터(n8n, Node-RED 스타일). 군더더기 없는 미니멀하고 클린한 UI.
- **시각 원칙**:
  - 상태(Success, Pending, Failed)를 직관적으로 나타내는 뚜렷한 포인트 컬러.
  - 노드 간 복잡성을 덜기 위한 넉넉한 여백(마진/패딩)과 명확한 테두리.
  - 코드, 산출물(Artifact) 중심의 모노스페이스 타이포그래피 혼용으로 개발 툴 느낌 부여.
- **반응형 원칙**: 모바일 우선(Mobile-first) 접근을 기본으로 하여 대시보드 및 결과물 뷰어는 모바일에서 편하게 볼 수 있도록 구성하되, 핵심 편집 UI인 시각적 워크플로우 캔버스는 데스크톱 및 태블릿 해상도에 최적화하여 조작감을 보장한다.

## 6. Technology ruleset

- **플랫폼 분류**: web, api
- **web (프론트엔드)**: React (Vite, TypeScript 환경). ReactFlow를 활용하여 워크플로우 빌더 구현. 상태 관리는 기존의 구조(React Hooks 등)를 따름. UI 컴포넌트는 CSS/테마 토큰 규칙을 준수하여 작성.
- **api (백엔드)**: FastAPI (Python 3.x). SQLAlchemy 등 ORM 기반 구조. 이벤트 버스와 로깅은 동시성(Threading/AsyncIO) 제어를 염두에 두고 작성. HTTP 포트는 로컬 개발 시 3000번대(예: 3001)를 기준으로 설정.
```
