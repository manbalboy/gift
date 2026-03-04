# PLAN

## 1. Task breakdown with priority

현재 저장소 상태를 분석한 결과, `api/app/` 하위 디렉터리(api, core, db, models, schemas, services)와 `web/` 디렉터리가 생성되어 있으나 실제 소스 코드가 없는 초기 스캐폴딩 상태입니다. 이를 바탕으로 아래와 같이 개발 작업을 세분화합니다.

- **[P0] API 인프라 및 DB 초기화 (FastAPI + SQLite)**
  - 대상 파일: `api/app/main.py`, `api/app/core/config.py`, `api/app/db/session.py`
  - 작업 내용: FastAPI 애플리케이션 초기화, CORS 설정(`manbalboy.com` 및 `localhost` 허용), MVP용 SQLite 데이터베이스 연결 및 ORM 구성.
- **[P0] Workflow Engine 기본 스키마 및 CRUD API 구현**
  - 대상 파일: `api/app/models/workflow.py`, `api/app/schemas/workflow.py`, `api/app/api/endpoints/workflows.py`
  - 작업 내용: `workflow_definitions`, `workflow_runs`, `node_runs` 엔티티 설계 및 저장/조회/검증을 위한 API 라우터 구현.
- **[P0] Frontend 기본 환경 구성 및 Visual Builder 초기화 (React)**
  - 대상 파일: `web/package.json`, `web/src/App.tsx`, `web/src/components/WorkflowBuilder.tsx`
  - 작업 내용: React 및 React Flow를 설정하여 노드/엣지 기반의 워크플로우 Visual Builder 캔버스 UI 기초 구현.
- **[P1] Agent SDK 및 Marketplace 연동 뼈대 구현**
  - 대상 파일: `api/app/services/agent_runner.py`, `api/app/schemas/agent.py`
  - 작업 내용: CLI 템플릿 실행기(CLI를 활용하는 작업자 호출 방식)와 입출력 인터페이스 정의, 워크플로우 엔진과의 연결.
- **[P1] Workspace 산출물 저장(Artifacts) 로직 구현**
  - 대상 파일: `api/app/services/workspace.py`
  - 작업 내용: 노드 실행 완료 후 생성된 산출물(PRD, 코드, 리뷰 등)을 특정 디렉터리에 기록하고 상태를 업데이트하는 로직 추가.
- **[P2] 대시보드 KPI 및 상태 표시 UI 구현**
  - 대상 파일: `web/src/components/Dashboard.tsx`, `web/src/services/api.ts`
  - 작업 내용: 파이프라인 진행 상태(queued/running/done/failed/review_needed 등) 요약 카드 및 로그 뷰어 컴포넌트 추가.

## 2. MVP scope / out-of-scope

**MVP Scope (포함 범위)**
- FastAPI 기반의 워크플로우 정의 관리 및 저장/조회 API (SQLite 활용)
- React Flow 기반의 시각적 워크플로우 에디터 (웹 화면에서 노드 배치 및 연결)
- 고정 파이프라인(Level 1 SDLC: Idea → Plan → Code → Test → PR) 형태의 JSON 템플릿 제공 및 실행 엔진 연동
- 웹 브라우저를 통한 실행 로그 스트리밍 확인 및 노드별 진행 상태 모니터링
- `manbalboy.com` 및 로컬 환경을 위한 CORS 정책 적용

**Out-of-scope (제외 범위)**
- Temporal 등 외부 분산/장기 실행 전용 워크플로우 엔진의 직접적인 연동 (MVP 이후 단계로 연기)
- 복잡한 조건 분기 및 동적 루프 등 고급 워크플로우 제어 로직 (순차적 방향성 실행 우선)
- 완벽한 사용자 권한 및 인증(SSO, RBAC 등) 제어 기능
- 외부 CI/CD 플랫폼으로의 직접 트리거 연동 (현재는 내부 워커 실행 중심)

## 3. Completion criteria

- `api/app/main.py`를 통해 FastAPI 서버가 오류 없이 구동되어야 함.
- React 기반 웹 애플리케이션이 지정된 3000번대 포트에서 정상적으로 실행되며 브라우저 접속이 가능해야 함.
- Visual Workflow Builder 화면에서 노드를 생성하고 엣지로 연결한 뒤, 해당 워크플로우의 JSON 구조가 백엔드 DB에 정상적으로 저장되고 다시 렌더링되어야 함.
- API 단에서 테스트 워크플로우 실행을 요청했을 때, 워크플로우 및 노드의 상태(queued → running → done) 변화가 DB에 정확히 기록되어야 함.
- 프론트엔드와 API 간의 통신이 3000번대 포트 환경 내에서 CORS 에러 없이 이루어져야 함.

## 4. Risks and test strategy

**Risks (위험 요소)**
- FastAPI 백엔드와 React 프론트엔드 간의 상태 동기화 지연.
- CLI 기반의 AI Agent 호출(워커 프로세스) 시 발생하는 타임아웃 또는 예기치 않은 시스템 에러 처리 미흡.

**Test Strategy (테스트 전략)**
- **Unit Test**: `pytest`를 활용하여 `api/tests` 하위에 워크플로우 스키마 검증, 상태 전환 로직, Agent 호출부 로직의 단위 테스트 작성.
- **Integration Test**: API 엔드포인트 단에서 워크플로우 생성→실행→조회 시나리오가 올바르게 작동하는지 검증.
- **UI Test**: React Flow 캔버스에서의 노드 조작이 의도한 JSON 모델로 변환되는지 E2E 테스트 또는 렌더링 검증.
- 웹 서비스 실행 포트(예: 3000) 접근 시 CORS 규칙 및 지정된 도메인(`manbalboy.com`) 허용 여부를 점검.

## 5. Design intent and style direction

- **기획 의도**: 복잡하게 얽힌 AI 개발 파이프라인(SDLC)의 각 단계를 투명하게 시각화하고, 시스템 및 에이전트 간의 협업 과정을 사용자가 한눈에 이해하고 제어할 수 있는 "DevFlow Agent Hub" 경험 제공.
- **디자인 풍**: 개발자 친화적인 대시보드 및 노드 에디터형 UI (다크 테마 기반의 모던, 미니멀 스타일).
- **시각 원칙**:
  - **컬러**: 어두운 배경을 기본으로 하여 시인성을 높이고, 상태를 명확히 구분하는 시맨틱 컬러(성공: Green, 진행: Blue, 대기/수동: Yellow, 실패: Red)를 포인트 컬러로 활용.
  - **패딩/마진**: 제한된 캔버스 공간의 효율적 활용을 위해 밀도 있는 컴포넌트 배치를 지향하며, 패널 간격은 16px/24px 그리드 시스템을 준수.
  - **타이포그래피**: 캔버스의 코드, 로그, 변수 영역은 가독성이 뛰어난 Monospace 폰트를 사용하고, 레이블 및 일반 텍스트 영역은 Sans-serif 폰트를 사용하여 정보 계층을 분리.
- **반응형 원칙**: 모바일 우선(Mobile-first) 원칙을 적용하여 기본 컴포넌트를 설계하되, 핵심 기능인 워크플로우 캔버스 에디터 화면은 데스크톱 및 태블릿의 가로 폭(Landscape) 최적화를 병행하여 원활한 편집 환경 제공.

## 6. Technology ruleset

- **플랫폼 분류**: api 및 web
- **api**: FastAPI 기반의 Python 애플리케이션으로 계획. CLI 호출 기반 워커를 제어하고 DB와 상호작용. (필요시 3001 등 3000번대 포트 사용)
- **web**: React 기반 라이브러리 및 React Flow 프레임워크를 활용하여 구축. 웹 실행 및 접근 가이드는 `3000`번대 포트를 기준으로 작성.
