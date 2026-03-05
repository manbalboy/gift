# PLAN

## 1. Task breakdown with priority

| 우선순위 | 작업 항목 (Task) | 상세 내용 및 범위 (Scope) | 변경 파일 후보 및 영향 범위 |
| :--- | :--- | :--- | :--- |
| **P0-1** | Workflow Engine v2 고도화 | `workflow_id` 기반 DAG(Directed Acyclic Graph) 그래프 실행 로직 구현.<br>노드 단위(`node_runs`) 재시도 및 상태 저장 처리.<br>단절된 노드(Disconnected Graph) 거부 및 엣지 유효성 강제. | `api/app/api/workflows.py`<br>`api/app/services/workflow_engine.py` |
| **P0-2** | (REVIEW 반영) 테스트 충돌 수정 | 단절 그래프 정책 변경에 맞춰 실패하는 `test_engine_runs_independent_nodes_without_forced_sequential_fallback` 테스트 코드를 유효성 실패(400/422 에러)를 확인하는 테스트로 전면 수정. | `api/tests/test_workflow_engine.py` |
| **P0-3** | Autopilot Control Plane | 24시간 장기 실행을 위한 지시 주입(Instruction Inbox) 및 중단/재개(Cancel/Pause/Resume) API 구현.<br>워크플로우 진행을 관리하는 백로그 및 스케줄러 루프 도입. | `api/app/api/runs.py`<br>`api/app/services/agent_runner.py` |
| **P0-4** | (REVIEW 반영) Human Gate 버그 픽스 | `handleRejectReasonPreset` 내 후행 공백 제거 및 개행 문자 판단 논리(`/\n$/`) 오류 수정하여, 프리셋 버튼 연속 클릭 시 단일 개행이 올바르게 추가되도록 UI 버그 픽스. | `web/src/App.tsx` |
| **P0-5** | (REVIEW 반영) 프리셋 병합 단위 테스트 | 수정된 폼 텍스트 프리셋 병합 로직에 대한 Jest 단위 테스트 케이스 보강. | `web/src/App.test.tsx` |
| **P1-1** | Agent SDK & Marketplace 표준화 | CLI 템플릿 기반의 기존 에이전트를 규격화(버전, 입출력 스키마, 폴백 규칙).<br>에이전트 스펙 등록 및 테스트 런 API 구현. | `api/app/models/agent.py`<br>`api/app/api/agents.py` |
| **P1-2** | Artifact-first Workspace 구축 | 산출물(아티팩트)을 메타데이터와 결합하여 Postgres 및 Object Store에 저장.<br>대용량 아티팩트 처리를 위한 Rate & Size Limiting 적용(DoS 방어 목적). | `api/app/services/workspace.py`<br>`api/app/api/artifacts.py` |
| **P1-3** | Visual Workflow Builder 고도화 | ReactFlow 캔버스를 이용해 노드 배치 및 엣지 연결 시각화.<br>편집 내용에 대한 클라이언트 및 서버 측 실시간 검증 (Validation) 도입. | `web/src/components/WorkflowBuilder/`<br>`web/src/App.tsx` |
| **P1-4** | (REVIEW 반영) Builder E2E 테스트 보강 | 다중 Entry 및 단절된 노드를 캔버스에 구성한 후 저장 시도 시 UI 상에 적절한 에러 모달 또는 토스트가 노출되는지 검증하는 E2E 테스트 케이스 추가. | `web/tests/e2e/WorkflowBuilder.spec.ts` (신규 또는 병합) |
| **P2-1** | Integrations & Event Bus | GitHub PR, CI 체크, Deploy 훅 이벤트를 통합 처리하는 룰 엔진 및 재처리 시스템 도입. | `api/app/api/webhooks.py`<br>`api/app/services/event_bus.py` |
| **P2-2** | (REVIEW 반영) 인프라/보안 통제 점검 | Preview(3000번대 포트 등) 및 아티팩트 저장소로 향하는 로컬 우회 접근 시 일회성 뷰어 토큰(One-time Viewer Token) 인증 레이어가 정상 작동하여 접근을 차단하는지 미들웨어 및 서버 설정 재점검. | `api/scripts/nginx/sse_proxy.conf`<br>`api/app/main.py` |

## 2. MVP scope / out-of-scope

**MVP Scope**
- 기존 MVP(FastAPI + 단순 CLI 러너) 아키텍처를 기반으로 한 Workflow Engine v2 (DAG 지원) 및 내구성 있는 실행 체계 구축.
- 사용자가 중간에 지시사항을 주입하고 실행을 제어(Pause/Resume/Cancel)할 수 있는 Autopilot Control Plane 적용.
- 산출물을 1급 데이터로 관리하는 Artifact-first Workspace 기반 구현 (RDB 및 파일 스토리지 활용).
- ReactFlow를 적용하여 워크플로우를 시각적으로 편집하고 오류를 파악할 수 있는 Visual Builder 기본 기능 (단절 노드 방지 등).
- **TODO 필수 반영**: `REVIEW.md`에 지적된 API 테스트 충돌 수정, 프론트엔드 프리셋 개행 버그 수정, 엣지 케이스 E2E/단위 테스트 보강, 로컬 포트 우회 접근 차단 점검.
- 로컬 실행 시 Preview 노출 포트는 지정된 범위(7000-7099)를 따르며, 인증은 기존의 토큰 방식을 엄격하게 상속함.

**Out-of-Scope**
- 외부 상용 워크플로우 런타임(Temporal, LangGraph 등)의 전면 도입 (MVP 단계에서는 FastAPI 내장 엔진과 RDB를 활용한 구현으로 갈음).
- Redis 기반의 분산 스트림 및 본격적인 멀티 노드 큐 확장 구성 (초기 릴리즈 후 P3 확장 목표로 이관).
- 에이전트 마켓플레이스 결제 및 복잡한 과금 시스템.

## 3. Completion criteria

1. **기능 구현 요건**: 
   - 사용자가 대시보드에서 `workflow_id`를 선택하여 새로운 아이디어를 주입할 수 있으며, 시스템이 이를 24시간 백그라운드 루프로 수행할 수 있어야 함.
   - 단절된 노드가 포함된 워크플로우는 저장 시 서버에서 400/422 상태 코드로 거부되어야 함.
   - 웹 대시보드에서 Human Gate 거절 사유 프리셋을 연속으로 클릭해도 빈 줄이 과도하게 누적되지 않고 정상 병합되어야 함.
2. **테스트 요건**: 
   - `api/tests/test_workflow_engine.py` 테스트가 모두 Pass 상태로 통과해야 함.
   - `web/src/App.test.tsx`의 텍스트 병합 단위 테스트가 누락 없이 작성되고 통과해야 함.
   - Playwright E2E 엣지 케이스 시나리오 (다중 Entry/단절 노드) 테스트가 정상적으로 에러 UI를 캐치해야 함.
3. **보안 및 환경 요건**: 
   - Nginx를 우회하는 로컬 직접 접근 시에도 백엔드의 뷰어 토큰 기반 접근 제어가 동작함을 인프라 테스트로 증명해야 함.
   - 1회 실행 사이클의 산출물이 Docker 컨테이너(포트 7000~7099) 형태로 정상 배포 가능해야 함.

## 4. Risks and test strategy

- **Risks**:
  - 초장기 자동 루프로 인한 무한 반복 및 LLM API 비용 초과 발생 (Agentic Loop Risk).
  - 50MB 이상의 극단적 대용량 아티팩트를 처리하는 과정에서 백엔드 네트워크 대역폭 점유 또는 메모리 누수에 따른 브라우저 크래시.
  - Preview 환경에 대한 3100번대 로컬 포트 직접 스캐닝 및 인증 우회 보안 취약점.
- **Test Strategy**:
  - LLM 비용 초과 리스크를 억제하기 위해 엔진 내부에 '예산(Budget)' 및 '루프 제한(Loop Threshold)' 속성을 두고, 이를 초과할 경우 즉시 Run을 일시 중지(Pause)하는 보호 테스트를 작성.
  - 대용량 아티팩트에 대비한 Rate Limiting 및 Size 상한선을 API 단위 테스트를 통해 검증하고, 스트리밍 단절 후 백오프(Backoff) 시 UI 블로킹이 없는지 부하 테스트 병행.
  - Nginx 프록시를 생략한 로컬 직접 호스트 호출 시나리오를 구성하여, 미들웨어 인증 객체가 예외 없이 401/403을 반환하는지 통합 보안 테스트 실시.

## 5. Design intent and style direction

- **기획 의도**: 사람이 아이디어를 던지면 백그라운드에서 지속적으로 분석, 계획, 구현, 리뷰를 반복 고도화하는 "자동화된 개발자 팀" 경험 제공. 중간중간 필요한 결정(Human Gate 승인 등)과 지시 변경만 사용자가 개입하여 피로도를 낮춤.
- **디자인 풍**: B2B 대시보드형의 미니멀하고 모던한 UI. 불필요한 장식은 배제하고, 워크플로우 상태 파악과 산출물(Artifact) 내용 확인에 집중할 수 있는 넓고 구조화된 캔버스/카드형 디자인을 채택.
- **시각 원칙**: 
  - 타이포그래피: 본문은 가독성이 높은 고딕/Sans-serif 계열을 사용하되, 코드 및 로그, 노드 ID 등의 시스템 정보는 Mono(고정폭) 폰트를 엄격히 적용하여 구분을 명확히 함.
  - 컬러 팔레트: 동작 상태를 나타내는 신호등 컬러(성공: Green, 실패: Red, 대기/재시도: Yellow, 진행: Blue)를 바탕으로, 배경은 중립적인 무채색(Dark/Light 모드 대응)을 사용하여 콘텐츠 집중도를 높임.
  - 패딩 및 여백: 빽빽한 로그 화면에서도 시인성을 확보할 수 있도록 구획 간(Margin) 여백은 넓게, 데이터 간(Padding)은 컴팩트하게 조정.
- **반응형 원칙**: 기본적으로 모바일 우선(Mobile-first) 구조를 따르나, 시각적 워크플로우 빌더(ReactFlow) 화면의 특성상 편집 모드는 데스크톱/태블릿 등 넓은 화면에 최적화함. 모바일 환경에서는 뷰어 모드 및 하단에서 올라오는 Sheet 형태의 모달을 활용하여 정보 가독성을 보장함.

## 6. Technology ruleset

- **플랫폼 분류**: `api` (백엔드 워크플로우 엔진) 및 `web` (프론트엔드 대시보드 빌더).
- **api (Backend)**: 
  - 언어 및 프레임워크: Python 3.10+ 기반 FastAPI.
  - 데이터베이스: Postgres 기반 (로컬 및 테스트 환경은 SQLite 호환성 유지) 및 SQLAlchemy를 활용한 ORM 스키마 정의.
  - 테스트: `pytest` 중심의 단위 및 통합 테스트 작성.
- **web (Frontend)**: 
  - 라이브러리/프레임워크: React (TypeScript) 및 Vite 번들러 환경.
  - 주요 도구: `ReactFlow`를 활용한 DAG 노드/엣지 드로잉.
  - 테스트: `Jest` (단위/로직 테스트) 및 `Playwright` (E2E 테스트).
  - 통신: REST API 및 장기 실행 상태 수신을 위한 SSE(Server-Sent Events) 스트리밍 적용.
