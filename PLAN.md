# PLAN

## 1. Task breakdown with priority

### 우선순위: 최상 (REVIEW TODO 반영 및 고도화 플랜)
1. **프론트엔드 폼 개행 누적 버그 수정 및 단위 테스트**
   - **변경 파일 후보:** `web/src/App.tsx`, `web/src/App.test.tsx`
   - **영향 범위:** Dashboard 내부 Reject Reason 및 지시 주입 폼 UI.
   - **설명:** 프리셋 기능 클릭 시 발생하는 `handleRejectReasonPreset`의 개행 문자 및 후행 공백 누적 버그를 정규식 최적화로 해결하고, `App.test.tsx`에 해당 로직의 단위 테스트를 추가합니다.
2. **단절 그래프 차단 로직 보완 및 E2E 테스트 개편**
   - **변경 파일 후보:** `api/tests/test_workflow_engine.py`, `web/tests/e2e/WorkflowBuilder.spec.ts`
   - **영향 범위:** API 워크플로우 검증 로직, 프론트엔드 ReactFlow 캔버스 저장.
   - **설명:** 기존 단절 그래프 허용 테스트를 삭제 및 전면 개편하여 400/422 유효성 에러를 검증하도록 수정합니다. 또한 `WorkflowBuilder.spec.ts`에 단절 및 다중 진입점 저장 시도 시 UI 에러(토스트) 노출을 검증하는 E2E 테스트를 보강합니다.
3. **로컬 미들웨어 뷰어 토큰 인증 강화**
   - **변경 파일 후보:** `api/app/main.py`, `api/app/api/dependencies.py`
   - **영향 범위:** API 전역 라우팅(엔드포인트 미들웨어).
   - **설명:** 프록시를 우회하여 로컬 포트(예: 3100)로 API 서버 직접 접근 시 발생할 수 있는 보안 취약점을 막기 위해 뷰어 토큰(Viewer Token) 검증 로직을 엄격하게 적용하는 방어 코드를 구현합니다.
4. **Agentic Loop(무한 루프) 방지 시스템 구축 (인접 고도화 기능 1)**
   - **변경 파일 후보:** `api/app/services/workflow_engine.py`
   - **영향 범위:** 엔진 실행 라이프사이클 및 Control Plane 상태 관리.
   - **근거 및 구현 경계:** REVIEW의 Edge Case에서 지적된 "초장기 실행 중 특정 노드의 무한 반복 예산 초과 현상"을 막기 위해, 노드 실행 시 최대 반복 횟수를 카운팅하고 초과 시 엔진을 강제로 일시 정지(Pause)시키는 방어 로직을 추가합니다.
5. **빌더 UI 사전 유효성 검사 차단 (인접 고도화 기능 2)**
   - **변경 파일 후보:** `web/src/components/WorkflowBuilder.tsx` (혹은 관련 컴포넌트)
   - **영향 범위:** 프론트엔드 워크플로우 편집 UI 저장 액션.
   - **근거 및 구현 경계:** 다중 진입점과 불안전 그래프 상태가 백엔드로 전송되지 않도록 클라이언트 캔버스에서 저장 이벤트 발생 시 엣지와 노드를 검증하여, 불량 그래프 전송을 원천 차단하는 클라이언트 사이드 룰을 적용합니다.

### 우선순위: 상 (Engine v2 & Control Plane)
1. **Workflow Engine v2 (FastAPI)**
   - **변경 파일 후보:** `api/app/models/workflow.py`, `api/app/services/agent_runner.py`
   - **설명:** 고정된 Orchestrator를 탈피해 `workflow_id` 기반 DAG 실행 구조로 변경하고, `node_runs` 기록을 통해 Node 단위 재시도와 재개를 지원하는 코어 파이프라인으로 전환합니다.
2. **Autopilot Control Plane (FastAPI)**
   - **변경 파일 후보:** `api/app/api/runs.py`, `api/app/services/run_manager.py` (신규 분리 가능)
   - **설명:** 사용자 지시(Instruction) 삽입, 작업 큐 스케줄러 보강 및 엔진 런타임에 중단(cancel), 일시정지(pause) 명령을 주입하는 메커니즘을 구현합니다.

### 우선순위: 중 (Workspace & UI 확장)
- **Artifact-first Workspace:** `api/app/models/artifact.py` 등을 추가하여 단순 로그가 아닌 산출물 자체를 스토리지 및 DB에 1급 객체로 다루고 타임라인에서 검색/활용하게 합니다.
- **Agent SDK 표준화:** `api/app/api/agents.py`를 정비하여 에이전트 CLI 템플릿의 입출력 버전을 관리하고 폴백 체계를 확립합니다.
- **Visual Builder 제품화:** 백엔드의 검증 API와 Web의 ReactFlow UI를 매끄럽게 연동하여 시각적인 템플릿 확장을 촉진합니다.

## 2. MVP scope / out-of-scope

### MVP Scope
- **API (FastAPI):** Workflow Engine v2(DAG 지원, 400/422 유효성 검사), 장기 실행 제어 및 무한 루프 예산 제한 메커니즘 도입, 뷰어 토큰 권한 검증 미들웨어 구축.
- **Web (React):** 대시보드 오류 해결(입력 폼 개행 버그 수정, 뷰어 토큰 연동), 워크플로우 빌더 UI(단절 그래프 사전 차단 및 시각적 에러 검증 로직 반영).
- 실행 환경 가이드 시 3000번대 포트(예: Web 3000, API 3100)를 사용.

### Out-of-scope
- 외부 스토리지(S3 등) 직접 연동 (로컬 스토리지로 MVP 대체).
- 외부 CI/CD 및 사내 메신저(Slack, MS Teams 등) 통합 이벤트 버스 구축.
- 사용자의 역할별 접근 권한(RBAC) 등 복잡한 소셜 로그인 시스템 연동.

## 3. Completion criteria
- `REVIEW.md`에 명시된 텍스트 폼 버그가 수정되고, `App.test.tsx` 단위 테스트를 통과한다.
- 기존의 독립적 노드 실행 허용 테스트(`test_workflow_engine.py`)가 400/422 응답 검증으로 전면 수정되어 통과한다.
- 로컬에서 3000번대 포트를 통해 직접 API에 우회 접근 시 인증 토큰 에러(401/403)가 정상 반환된다.
- 단절 그래프 시각화 화면에서 저장 시도 시 UI 에러 피드백을 검증하는 E2E 테스트(`WorkflowBuilder.spec.ts`)를 통과한다.
- 엔진 v2가 장기 실행 중 무한 루프 감지 시 자체적으로 일시 정지(Pause) 상태로 전환된다.

## 4. Risks and test strategy

- **Risks:** 
  - 엔진 구조 개편 및 무한 루프 제한 메커니즘 추가에 따라, 정상적으로 장기 대기가 필요한 AI 호출도 조기 종료(False Positive)될 가능성이 있습니다.
  - 기존 Job 실행 구조를 전환하면서 하위 호환성 문제가 발생할 수 있습니다.
- **Test strategy:**
  - `pytest` 환경에서 엔진 모킹을 통해 400/422 에러, 루프 조기 종료 등 엣지 케이스 시나리오를 방어적으로 작성합니다.
  - 프론트엔드는 Playwright를 이용하여 부적절한 노드 엣지 연결 시 사용자에게 올바른 토스트 알림이 렌더링되는지 시각적 렌더링 검사를 수행합니다.
  - 로컬 구동 시 지정된 3000번대 포트 환경에 대한 직접 호출 스크립트를 만들어 보안 미들웨어의 토큰 필터링 우회 방어 로직을 통합 테스트로 점검합니다.

## 5. Design intent and style direction

- **기획 의도:** 24시간 작동하며 복잡한 명령을 자동 고도화하는 플랫폼이 오작동(단절, 무한 루프) 시 사용자에게 즉각적이고 명확한 피드백을 전달하여 시스템 신뢰도를 극대화합니다.
- **디자인 풍:** 데이터 밀도가 높고 기능이 직관적으로 드러나는 엔지니어링 대시보드 & 모던 툴 인터페이스 스타일.
- **시각 원칙:** 
  - 컬러: 고대비의 어두운 무채색 테마를 베이스로 하며 상태별 색상(정상: Green, 경고 및 일시정지: Yellow/Orange, 에러/단절: Red)을 엄격히 분리하여 사용합니다.
  - 패딩/마진: 화면 밀도를 높이고(Medium/Small 여백 유지) 계층 간 시각적 구분을 명확히 설계합니다.
  - 타이포그래피: 코드 리뷰 및 로그의 시인성 확보를 위해 Monospace 폰트와 깔끔한 Sans-serif 폰트를 혼용합니다.
- **반응형 원칙:** 복잡한 그래프 편집 조작이 수반되므로 데스크탑 최적화 해상도를 우선 지원합니다 (모바일 기기는 상태 관측 중심의 뷰어로 한정).

## 6. Technology ruleset

- **플랫폼 분류:** web / api
- **web:** React 프레임워크를 기반으로 구축 (Vite, ReactFlow, Playwright, Jest 등을 활용하여 컴포넌트 개발 및 검증).
- **api:** FastAPI 기반 아키텍처로 비동기(ASync) 런타임과 SQLAlchemy + PostgreSQL 연동, Pytest 기반의 견고한 시스템 구현.
