# PLAN

## 1. Task breakdown with priority

### P0 (Critical - MVP 핵심 및 리뷰 버그 수정)
- **CORS 및 보안 규칙 수정 (`api/app/main.py`)**: SPEC에 맞춰 CORS 허용 포트를 `7000-7099` 대역으로 변경. 기존의 복잡한 정규식(ReDoS 위험)을 개선하여 더욱 엄격하고 안전한 도메인 매칭(예: `manbalboy.com` 및 서브도메인, 로컬 환경 등)을 적용.
- **Workflow 상태 보상(Compensation) 데몬 추가**: API 서버 비정상 종료 시 장기 `running` 상태 노드가 영원히 방치되는 문제를 해결. 서버 재시작 시(또는 백그라운드 스케줄러를 통해) 해당 노드를 `failed` (또는 재시도 대상)로 복원하는 초기화 프로세스 구현.
- **긴 명령어 실행 구조 개선 (`api/app/services/agent_runner.py`)**: `bash -lc` 호출 시 운영체제의 `Argument list too long` 한계로 인해 긴 프롬프트나 코드가 실패하는 엣지 케이스를 수정. 명령어를 임시 `.sh` 파일로 저장한 후 파일 경로를 기반으로 실행하도록 워커 실행 구조 개선.
- **Workflow Engine 정식화**: Orchestrator의 고정 플로우 의존을 탈피하고 `workflow_id` 기반 동적 노드 실행 체계 완성. `node_runs` 이력 저장.
- **Agent SDK 표준화**: 입출력 스키마, 도구 제약, 실패 전략 등을 포함한 역할별 에이전트(Planner, Coder, Reviewer 등) Spec 정립.

### P1 (High - 기능 강화 및 UI 연동)
- **Visual Workflow Builder 연동**: `web/` 영역에 React Flow 라이브러리를 적용하여, 워크플로우를 시각적 노드 및 엣지로 편집하고 렌더링하는 UI 구성.
- **테스트 커버리지 확충 (`api/tests/`)**: 
  - 상태 복구(Compensation) 데몬의 정상 작동 여부를 단언(Assert)하는 테스트.
  - `with_for_update()` 등 락 획득 시 타임아웃/데드락 엣지 케이스에 대한 Pytest 작성.
- **상태 및 KPI 대시보드 고도화**: 재작업률, 리드타임, 타임라인 중심의 모니터링 뷰 추가. 노드 상태(Review Needed 등) 확장 적용.

### P2 (Medium - 확장성)
- **분산 환경 락 아키텍처 검토**: 단일 프로세스 `threading.Lock`에서 향후 다중 프로세스(Gunicorn 컨테이너 환경 등)로의 확장을 대비한 DB Row Lock 병목 전가 해소 및 Redis 분산 락 고도화 기획.
- **Dev Integration 확대**: GitHub 웹훅 외의 통합 트리거(PR/CI 배포 이벤트) 연동.

## 2. MVP scope / out-of-scope

**MVP Scope:**
- Workflow Engine (DB를 통한 동적 워크플로우 파이프라인 진행 및 상태 보상 메커니즘 구축).
- CORS 정책 개선 (Preview 7000~7099 대역 반영 및 보안 정규식 적용).
- 임시 파일 실행 기반의 견고한 AgentRunner 구동.
- Level 1 수준의 SDLC 템플릿 (Idea -> Plan -> Code -> Test -> PR).
- React Flow 기반 기초 Visual Workflow Builder 렌더링.

**Out-of-Scope:**
- 복잡한 외부 이슈 트래커(Jira, Linear) 연동 시스템 구현.
- 완전한 분산 처리(Multi-node 스케일아웃)를 위한 인프라 스택 (Redis 전면 도입 등은 MVP에서 배제하고 현재의 단일 DB 구조에서 구현).
- Temporal 혹은 LangGraph 코어 전면 전환 (FastAPI 워커 구조를 고도화하는 방향 유지).

## 3. Completion criteria
- 모든 P0 티켓 완료 (CORS 수정, 상태 보상 데몬, 긴 명령어 스크립트 실행 등).
- 서버 강제 재시작 후 기존 `running` 노드가 자동으로 복원됨을 E2E 환경에서 확인.
- 워커 실행 시 매우 긴 명령어/payload가 임시 파일을 통해 무리 없이 성공 처리됨.
- `api/tests` 디렉토리 내 추가 작성된 Pytest(보상 로직, 예외 타임아웃)가 100% 통과.
- `web/` 애플리케이션의 3000번대 포트 구동 및 React Flow를 통한 워크플로우 시각화 정상 노출 확인.

## 4. Risks and test strategy

**Risks:**
- 동적 상태 보상 로직 적용 시, 타이밍 이슈로 인해 정상 실행 중인 노드가 복원 처리되는 오작동 가능성.
- React Flow와의 상태 동기화 시 비동기 갱신 지연으로 인한 프론트엔드 상태 불일치 현상.

**Test Strategy:**
- **Unit Test**: AgentRunner가 임시 파일을 생성하여 명령어 실행 후 안전하게 삭제하는 라이프사이클을 테스트. 보상 스크립트의 조건 필터링 정확도 확인.
- **Integration Test**: DB 트랜잭션 도중 예외가 발생하거나 `with_for_update` 대기 지연이 나타날 때 적절히 Rollback 되고 타임아웃 에러를 발생시키는지 격리 테스트 구축.
- **E2E Test**: GitHub 웹훅 모의 트리거를 통해 생성된 Issue가 코드 실행 및 상태 갱신을 거쳐 최종 아티팩트를 Workspace에 기록하기까지의 전 과정을 자동화 검증.

## 5. Design intent and style direction
- **기획 의도**: 복잡한 AI 에이전트들의 협업 파이프라인을 비개발자도 직관적으로 파악할 수 있고, 문제 노드를 투명하게 모니터링하여 개입(Human-in-the-loop)할 수 있는 생산적인 개발 허브 제공.
- **디자인 풍**: 모던하고 기술적인(Tech-focused) 대시보드 스타일. 노드 연결형 시각화(Node-based canvas) 뷰.
- **시각 원칙**: 핵심 상태를 명확히 구별하는 컬러 팔레트 (Success: Green, Progress: Blue, Failed: Red, Blocked/Warning: Yellow/Orange) 적용. 타이포그래피는 깔끔한 산세리프(San-serif)를 사용해 가독성 확보. 컴포넌트는 적절한 여백과 섀도우 처리로 부유감 있게 배치.
- **반응형 원칙**: 캔버스 및 대시보드 뷰포트 특성상 데스크톱/태블릿(가로형) 환경을 최우선으로 고려하며, 모바일 화면에서는 카드 형태의 정보 요약 뷰로 자동 전환되도록 반응형 구현.

## 6. Technology ruleset
- **플랫폼 분류**: api / web
- **web**: React (TypeScript 및 Vite 기반 빌드 도구)를 기반으로 구축하며, 노드 시각화 UI 구현체로 `React Flow` 라이브러리를 적극 활용.
- **api**: FastAPI 기반 프레임워크와 SQLAlchemy 데이터베이스 레이어 활용. CLI 명령어 수행 워커는 Python의 내장 `subprocess`를 통해 임시 `.sh` 스크립트를 실행하는 구조로 설계. 포트는 Preview 목적의 노출 시 `7000-7099` 대역만을 활용.
