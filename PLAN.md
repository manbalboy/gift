> [!IMPORTANT]
> 우선순위: `ex-code` 내부 코드를 분석해 현재 프로젝트에 모든 기능을 구현한다.

# PLAN

## 1. Task breakdown with priority

### P0 (Highest Priority) - 엔진 코어 안정화 및 Workflow v2 기반 마련
- [ ] **Lock 메커니즘 개선 및 멱등성 보장 (REVIEW 반영)**: `api/app/services/workflow_engine.py` 및 `api/app/api/workflows.py` 내 `resume` API 호출 시 중복 스케줄링 방지를 위한 락(Lock) 체계 재검토. 멱등성을 보장하여 다중 요청 시 단일 스레드만 실행되도록 수정.
- [ ] **보안 설정 동적 주입 (REVIEW 반영)**: `api/app/core/config.py` 및 `api/app/api/dependencies.py` 수정. `_enforce_localhost_spoof_guard`의 검증 대역을 하드코딩에서 `settings.spoof_guard_ports` 환경 변수로 주입받도록 리팩토링.
- [ ] **Graceful Failure 로직 추가 (REVIEW 반영)**: 장기 방치된 `paused` 워크플로우를 재개할 때 임시 데이터나 아티팩트 유실 시 크래시를 방지하고 `failed` 상태로 안전하게 전이하도록 예외 처리 구현.
- [ ] **Workflow Engine v2 구현**: `workflow_id` 기반 그래프 실행, 노드 단위 실행(`node_runs`) 기록 및 재시도, `ExecutorRegistry` 연동. 기본 호환을 위한 `default_linear_v1` 폴백 처리 적용.

### P1 (High Priority) - 자율 운영 기반 구축 (Autopilot & Agent SDK)
- [ ] **Autopilot Control Plane 도입**: 24시간 루프 실행을 위한 지시 주입(Instruction Inbox), 중단/재개(Cancel/Pause/Resume), 예산(Budget) 및 체크포인트 스케줄러 구현.
- [ ] **Agent SDK & Marketplace 표준화**: Agent Spec, 버전(semver), 폴백, CLI Runner 어댑터 표준화 및 시스템 연동.

### P2 (Medium Priority) - 시각화 및 아티팩트 관리
- [ ] **Artifact-first Workspace 전환**: 결과물을 1급 데이터로 관리하기 위해 Object Store 연동 및 메타데이터 DB 저장, 타임라인/검색 API 제공.
- [ ] **Visual Workflow Builder 구현**: 웹에서 노드/엣지를 시각적으로 편집할 수 있는 빌더(React Flow 등 활용) 추가 및 검증 로직 연결.
- [ ] **통합 이벤트 버스 (Integrations Hub)**: PR/CI/Deploy 이벤트 기반 자동 트리거 및 중복 방지(Dedupe) Rules Engine 적용.

## 2. MVP scope / out-of-scope

### MVP Scope
- `resume` 동작 동시성 버그 수정 및 멱등성 락 제어 (단일 스레드 보장)
- 스푸핑 가드 포트 설정의 환경변수화 (`settings.spoof_guard_ports`)
- 데이터가 유실된 `paused` 워크플로우 재개 시의 안전한 에러 핸들링 (Graceful Failure)
- `workflow_id` 기반 노드 실행 엔진 및 `node_runs` 저장 체계 (Engine v2)
- CLI Agent의 템플릿 표준화 (Agent Spec/Version)
- React 기반 웹 애플리케이션 내 시각적 워크플로우 빌더 기본 편집/검증

### Out-of-scope
- 대규모 분산 큐(Temporal/LangGraph 등 외부 엔진 직접 연동은 1차 MVP에서 제외하고 내장 엔진 활용에 집중)
- 쿠버네티스(EKS) 프로비저닝 자동화 스크립트 작성
- 사용자별 권한 제어(IAM) 및 복잡한 팀 워크스페이스 격리 (단일 환경 워크스페이스 기준)
- 무한 루프 환경에서의 완벽한 AI 자동 복구(Self-healing) 로직 (초기엔 Budget 제한으로 통제)

## 3. Completion criteria
- 다중 `resume` 요청을 동시에 보내도 워크플로우 락킹을 통해 단 1번만 스케줄링 및 실행되어야 함.
- 환경 변수 조작만으로 스푸핑 방어 포트 대역을 유연하게 변경할 수 있어야 함.
- 만료된 `paused` 워크플로우의 재개 시도 시, 서버 데드락이나 크래시가 발생하지 않고 상태가 `failed`로 정상 변경되어야 함.
- 워크플로우 실행 시 노드별 단위 실행 정보(`node_runs`)가 DB에 안정적으로 기록되어야 함.
- 브라우저를 통해 웹 빌더에 접속하여 노드 시각화, 추가 및 연결 검증이 정상 작동해야 함.
- 추가/수정된 기능에 대한 모든 단위 테스트(Unit Test) 및 통합 테스트(Integration Test)가 성공해야 함.

## 4. Risks and test strategy

### Risks
- **동시성 엣지 케이스 및 데드락 (Race Condition)**: 엔진 내 다중 스레드 환경에서 데이터 무결성이 깨지거나 단일 재개 요청조차 영구 블로킹될 가능성.
- **초장기 자동화 비용 폭주**: 장기 방치나 무한 루프로 인한 리소스 및 토큰 비용 급증 위험.

### Test strategy
- **단위 테스트 (Unit Test)**:
  - `api/tests/test_workflow_engine.py`에 `timeout_override` 적용 유무에 따른 명시적인 단위 테스트 추가.
  - 임시 디렉토리 유실 상태 모의(Mocking) 후 `resume` 시도 시 상태 전이(Graceful Failure) 검증.
- **통합 테스트 (Integration Test)**:
  - 파이썬 `concurrent.futures`를 활용하여 `POST /runs/{run_id}/resume` API로 대규모 동시 요청(예: 로컬 `3100` 포트 테스트 환경)을 발생시켜, 중복 실행 방지 및 단일 스레드 처리를 증명하는 통합 테스트 작성.
- 환경변수에 따른 스푸핑 포트 설정 변경 및 접근 제어 테스트 케이스 작성.
- E2E 테스트 시 외부 노출 포트는 요구사항에 맞게 `7000-7099` 범위를 사용하되, 로컬 개발/테스트용 서버 포트는 `3000`번대(예: `3100`)를 활용.

## 5. Design intent and style direction

- **기획 의도**: 사용자가 아이디어를 제공하면 AI가 코딩부터 테스트/리뷰까지 24시간 자율적으로 고도화하며, 사용자는 투명한 과정 속에서 시작/종료 제어만 수행하는 완전 자동화 개발자 플랫폼(Autopilot Developer Hub) 환경 경험 제공.
- **디자인 풍**: 모던 대시보드 및 다이어그램 기반의 에디터형 디자인(React Flow 방식). 개발자에게 친숙한 테마와 시각적 노이즈를 최소화한 미니멀리즘 접근.
- **시각 원칙**:
  - 실행 상태별 명확한 컬러 시스템 적용(성공: Green, 진행: Blue, 실패: Red, 대기/정지: Gray).
  - 긴 로그 텍스트와 노드 그래프가 복잡하게 얽히지 않도록 충분한 패딩(Padding)과 마진(Margin) 유지.
  - 터미널 출력 및 코드가 노출되는 영역은 모노스페이스(Monospace) 타이포그래피 적용.
- **반응형 원칙**: 모바일 우선 규칙(Mobile-First)을 따르되, 넓은 캔버스가 필요한 워크플로우 빌더는 모바일 환경에서 뷰어(읽기/이동) 위주로 제공하고, 세부 노드 편집은 데스크톱 환경에 최적화.

## 6. Technology ruleset

- **플랫폼 분류**: api / web
- **Web (Frontend)**: React 기반 프레임워크(예: Vite + React)를 활용하여 시각적 워크플로우 빌더 및 대시보드 구축. 노드 에디터는 `React Flow` 활용 권장. 로컬 실행 포트는 `3000` 사용.
- **API (Backend)**: FastAPI 기반으로 서버 구축 및 엔진 최적화 구현. 데이터 영속화는 기존 체계(Postgres/SQLite) 유지. 로컬 실행 포트는 `3100` 사용.
- **실행 환경 및 프리뷰**: 실무 개발/테스트 구동용 로컬 포트는 웹/API 모두 `3000`번대(`3000`, `3100`)만 사용하며, 최종 PR 기반의 Docker Preview 도커 컨테이너는 `7000-7099` 범위를 매핑하여 동작.
