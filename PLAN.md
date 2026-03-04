> [!IMPORTANT]
> 최우선 1차 목표: `ex-code` 내부 코드를 분석해 현재 프로젝트에 모든 기능을 구현한다.

```markdown
# PLAN

## 1. Task breakdown with priority

### 우선순위 높음 (P0) - REVIEW.md 버그 및 보안 수정
- [ ] **[Backend] DAG Fallback 예외 처리 수정**: `api/app/services/workflow_engine.py` 내 `_build_predecessors` 함수 수정. 엣지가 없는 노드의 경우 순차 실행으로 강제 Fallback하는 로직을 제거하고, 독립 노드 병렬 실행 처리 또는 그래프 검증 단계에서 차단하도록 변경.
- [ ] **[Backend] Webhook `workflow_id` 검증 강화**: `api/app/api/webhooks.py` 웹훅 수신부 수정. 잘못된 포맷의 `workflow_id` 수신 시 무시(Silent Fail)하지 않고 명시적인 `422 Unprocessable Entity` 에러 반환.
- [ ] **[Backend] Human Gate 인가(Authorization) 로직 추가**: `api/app/api/workflows.py` 및 관련 서비스의 승인 처리 엔드포인트 수정. 단순 토큰 검증을 넘어 사용자의 Role(예: reviewer, admin) 또는 워크스페이스 권한을 대조하는 세밀한 인가 로직 구현.

### 우선순위 보통 (P1) - 테스트 커버리지 보강
- [ ] **[Frontend] Human Gate E2E 통합 테스트 추가**: 프론트엔드 대시보드 상에서 Human Gate 노드 실행이 멈추고(Pending), 사용자가 승인/취소 버튼을 클릭하여 파이프라인이 재개(Resume)되는 전체 흐름에 대한 Playwright E2E 시나리오 테스트 작성 (`web/tests/e2e/`).
- [ ] **[Backend] 헬스체크 및 DLQ 단위 테스트 추가**: 상태 기반 워커 헬스체크 및 Dead Letter Queue(DLQ) 복원 처리에 관한 백엔드 통합/스트레스 테스트(pytest) 보강 (`api/tests/`).

### 우선순위 보통 (P2) - 고도화 플랜 (추가 기능)
- [ ] **[Backend] SSE 커넥션 레이스 컨디션 방어 (방어적 프로그래밍)**: `api/app/api/workflows.py` (또는 관련 SSE 엔드포인트) 스트리밍 연결 해제 로직 보완. 워크플로우 강제 취소 시 스트림 제너레이터 연결 풀이 즉각적으로 클리어되도록 처리하여 Zombie Connection 방지. (근거: 다중 클라이언트의 일관된 상태 동기화 및 엣지 케이스 안정성 보장)

## 2. MVP scope / out-of-scope

### MVP Scope
- `REVIEW.md`에서 제기된 기능적 버그(DAG Fallback) 및 엣지 케이스(Silent Fail)의 완벽한 해결.
- 보안 취약점(Human Gate 권한 미비) 대응 및 Role 기반 인가 적용.
- 누락된 핵심 E2E 테스트(Human Gate 승인 플로우) 및 워커 장애 복구 테스트(DLQ) 구현.

### Out-of-scope
- 새로운 외부 연동(예: Slack, Jira 웹훅 추가 등)은 이번 수정 범위에 포함하지 않음.
- Visual Workflow Builder (ReactFlow)의 전면적인 UI/UX 디자인 개편 (기존 톤앤매너 유지).
- 복잡한 클라우드 인프라(AWS EKS 등) 스펙 변경 (기존의 로컬/Docker 기반 운영 기준 유지).

## 3. Completion criteria
- `workflow_engine.py` 수정 후, 엣지가 없는 노드 배치 시 비정상적인 순차 실행이 발생하지 않으며 독립 실행 또는 그래프 유효성 검증 에러가 정상 작동해야 함.
- 유효하지 않은 `workflow_id` 웹훅 요청에 대해 HTTP 422 Unprocessable Entity 에러가 명확히 반환되어야 함.
- 권한이 없는 사용자로 Human Gate 승인 요청 시 HTTP 403 Forbidden 등으로 인가(Authorization) 차단됨을 확인해야 함.
- Playwright E2E 테스트(Human Gate Resume 플로우)가 완전하게 작성되어 CI 및 로컬에서 통과해야 함.
- 백엔드 pytest 테스트 스위트에서 워커 헬스체크 및 DLQ 복원 관련 커버리지가 확보되고 모두 통과해야 함.

## 4. Risks and test strategy

### Risks
- 워크플로우 파이프라인 엔진(`workflow_engine.py`)의 연결 로직 수정으로 인해 정상적으로 연결된 기존 파이프라인의 실행 흐름에 부수 효과가 생길 수 있음.
- Human Gate 인가 로직 도입으로 인해 테스트 환경의 기존 자동화 스크립트나 임시 계정이 권한 부족 오류를 겪을 수 있음.

### Test Strategy
- **유닛/통합 테스트 (Pytest)**: 워크플로우 엔진의 엣지 케이스(빈 엣지, 잘못된 ID 등)를 검증하는 단위 테스트를 작성하여 기존 DAG 파싱 모델이 깨지지 않음을 보증. 권한 기반의 API 엔드포인트 보호 테스트 추가.
- **E2E 테스트 (Playwright)**: 워크플로우 생성 후 Human Gate 노드가 올바르게 멈추고 대시보드를 통해 승인/반려되어 재개되는 전체 사용자 여정을 실제 브라우저 환경에서 검증.
- 로컬 개발 환경에서 백엔드 `pytest` 및 프론트엔드 `npx playwright test` 명령을 활용하여 완전한 회귀 테스트(Regression Test) 수행.

## 5. Design intent and style direction

- **기획 의도**: 개발 조직이 신뢰할 수 있는 탄탄하고 예측 가능한 워크플로우 엔진 기반을 제공. 보안(승인 인가)과 예외 상황(잘못된 요청 및 엣지 케이스)에 대한 피드백을 강화하여 파이프라인 통제력을 높임.
- **디자인 풍**: 대시보드형 (기존 ReactFlow 노드 기반 UI 유지). 복잡성을 줄이고 시스템 상태와 대기(Pending) 요소를 직관적으로 파악할 수 있는 미니멀하고 모던한 스타일.
- **시각 원칙**:
  - 컬러: 성공(Green), 실패/경고(Red/Yellow), 대기 및 승인(Blue/Purple)의 명확한 상태 피드백 컬러셋 유지.
  - 패딩/마진: 시스템 로그 및 상태 뷰에서 시각적 계층을 뚜렷이 분리할 수 있도록 카드 내 넉넉한 여백 제공.
  - 타이포그래피: 에러 및 코드 블록, 로그 출력에 가독성 높은 산세리프 폰트 적용.
- **반응형 원칙**: 모바일 우선(Mobile-first) 규칙을 기본으로 하되, 노드 에디터 및 승인 워크플로우 특성을 감안해 데스크톱 화면에서의 정보 탐색과 뷰어 최적화에 맞춘 점진적 향상(Progressive Enhancement) 추구.

## 6. Technology ruleset

- **플랫폼 분류**: web, api
- **web**: React 및 Vite 기반 프론트엔드 환경으로 계획.
- **api**: FastAPI 기반 백엔드 아키텍처(Pydantic 모델 활용)로 계획.
- 실행 가이드에서 사용되는 기본 로컬 개발 포트는 **3000**(Web) 및 **3001**(API)과 같은 3000번대 포트를 기준으로 작성.
```
