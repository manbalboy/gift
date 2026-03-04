# PLAN

## 1. Task breakdown with priority

### Priority 0 (Critical: 안정성 확보 및 버그 픽스 - REVIEW.md 기반)
- **상태 동기화 및 최적화 (`web/src/App.tsx`, `web/src/components/Toast.tsx`)**
  - Toast 렌더링 상태와 `dedupedToastKeysRef` 동기화 및 큐(Queue) 로직 안정성 확보.
  - 윈도우 리사이즈 이벤트에 디바운스(Debounce)/쓰로틀(Throttle) 적용 및 명확한 언마운트 클린업.
- **모바일 사용성 및 UI 개선 (`web/src/styles/app.css`)**
  - 모바일 뷰포트에서 긴 텍스트 알림 확장 시 레이아웃 점핑을 방지하는 부드러운 `transition` 및 `max-height` 애니메이션 적용.
  - 여러 개의 알림이 누적되었을 때 시야 확보를 위한 '일괄 닫기(Clear All)' 기능 구현.
- **보안 검증**
  - 전체 소스 코드에서 XSS 위험이 있는 `dangerouslySetInnerHTML` 사용을 검증하고 원천 배제 조치.
- **테스트 커버리지 보강 (`web/tests/`, `web/src/`)**
  - `App.test.tsx`에 `jest.useFakeTimers()`를 도입하여 동시성 웹훅 유입에 대한 단위 테스트 추가.
  - `Toast.test.tsx`에 뷰포트 모킹을 통한 모바일 화면 동작(말줄임, 분기 등) 테스트 구현.
  - 포트 3100 타겟(`npm run dev -- --port 3100`) 환경에서 Playwright 기반 시각적 회귀 및 리사이징 테스트(`toast-layering.spec.ts`) 시나리오 강화.

### Priority 1 (DevFlow 핵심 아키텍처 구성 - SPEC.md 기반)
- **Workflow Engine 고도화 (API)**
  - 기존 고정 파이프라인을 `workflow_id` 기반 실행 엔진으로 전환.
  - `node_runs` 실행 이력을 저장하여 재시도, 재개(Resume), Human-in-the-loop 관측 기반 마련.
- **Visual Workflow Builder (Web)**
  - React Flow를 도입하여 노드 팔레트, 드래그 앤 드롭 연결, 노드 속성 패널을 갖춘 시각적 편집 UI 구현.
- **Workspace 데이터 저장소 정규화 (API/DB)**
  - JSON/SQLite 구조에서 확장하여 Postgres 기반(또는 초기 파일 기반 정규화)으로 Run, Artifacts 스키마 저장.

### Priority 2 (Agent 추상화 및 생태계 확장)
- **Agent SDK 및 Marketplace 패키징**
  - Planner, Coder, Reviewer 등 에이전트 역할을 분리하고 입출력 스키마, 툴셋, 프롬프트를 표준 명세화.
- **Dashboard 메트릭 고도화**
  - 리드타임, 재작업률, 실패율 등 KPI 지표 추가 및 SSE/WebSocket 기반 실시간 로그 스트림 연결.

## 2. MVP scope / out-of-scope

### MVP Scope
- `REVIEW.md`에 명시된 Web 화면 내 Toast 컴포넌트의 모든 렌더링 버그 수정 및 최적화, 보안 이슈 제거.
- 테스트 환경(포트 3100 기반 E2E 및 Fake Timers 기반 유닛 테스트) 완비.
- 알림 편의성을 위한 '일괄 닫기' UI 제공.
- 백엔드의 FastAPI 기반 노드 실행 이력(`node_runs`) 관리 API.
- 웹의 React Flow 기반 단일 워크플로우 Visual Builder (노드 배치 및 설정 패널 기초 구현).

### Out-of-scope
- Temporal 또는 LangGraph 같은 완전한 외부 분산 오케스트레이션 엔진 전면 교체 (현재는 기존 Worker 연장선에서 구현).
- GitHub 외 Linear 연동 등 복잡한 서드파티 통합.
- 다중 사용자 권한 모델 (Role-Based Access Control).

## 3. Completion criteria
- 모든 TODO 항목(리사이징 최적화, 애니메이션 부드러움, `dangerouslySetInnerHTML` 배제)이 적용되고 수동 테스트 시 레이아웃 깨짐 현상이 없어야 함.
- Playwright E2E 테스트가 로컬 포트 3100 환경에서 동적 리사이즈 및 초고속 이벤트 발생 시나리오를 100% 통과해야 함.
- React Flow 에디터에서 워크플로우 노드를 생성하고 연결 데이터를 JSON으로 안정적으로 추출/저장할 수 있어야 함.

## 4. Risks and test strategy
- **위험 요소**: 
  - 밀리초 단위로 웹훅 알림 다수 유입 시 React 생명주기 경합으로 인한 메모리 누수나 UI 프리징 위험.
  - Visual Builder 도입 시, 상태 트리(노드/엣지 데이터) 관리가 비대해져 성능 저하 발생 가능성.
- **테스트 전략**:
  - **단위 테스트**: `jest.useFakeTimers()`를 통한 이벤트 큐 밀어내기 및 경합 조건 극한 모의(Mocking) 테스트 병행.
  - **E2E 테스트**: Playwright 스크립트로 3100 포트를 겨냥해 뷰포트 사이즈를 쉴 새 없이 변경하는 브라우저 조작을 수행하며 렌더링 붕괴 및 시각적 회귀를 검증.

## 5. Design intent and style direction
- **기획 의도**: 워크플로우 진행 상태와 시스템 에러/성공 피드백을 사용자에게 실시간으로 직관적이고 끊김 없이 전달하여, 자동화 시스템에 대한 신뢰감을 형성합니다.
- **디자인 풍**: 개발자 친화적인 모던 대시보드형 (노드 에디터 중심, 명확한 정보 위계의 카드형 배너).
- **시각 원칙**: 
  - 다크/라이트 모드 대응이 자연스러운 무채색 기반 중립적 컬러 구성.
  - 여유로운 패딩/마진(최소 16px 이상)으로 밀집도 완화 및 가독성 확보.
  - 알림 및 상태 노드에 명확한 시스템 컬러(Info, Success, Warning, Error)를 포인트로 적용.
- **반응형 원칙**: 
  - 모바일 우선(Mobile-First) 디자인 원칙 준수. 화면 크기 축소 시 컨텐츠는 수직 스택으로 재배열되며, 텍스트 확장 등의 인터랙션 시 반드시 부드러운 애니메이션을 동반합니다.

## 6. Technology ruleset
- **플랫폼 분류**: web, api
- **web**: React 기반(Vite 번들러 빌드), 워크플로우 에디터를 위해 React Flow 활용. 스타일링은 기존 CSS 체계 사용.
- **api**: FastAPI 기반으로 기존 워커 프로세스와 연동 구조 유지.

## 7. 고도화 플랜 (REVIEW 반영)
기존 버그 수정(상태 관리 문제, 모바일 레이아웃 개선)과 자연스럽게 연결되는 인접 편의 기능들을 고도화 플랜으로 제안합니다.

- **알림 스와이프 투 디스미스(Swipe to dismiss) 제스처 지원**
  - **근거**: 모바일 환경에서 '일괄 닫기(Clear All)' 버튼을 누르기 전, 원하지 않는 특정 알림만 개별적으로 닫고 싶을 때 버튼 클릭보다 좌우 스와이프 제스처가 훨씬 직관적인 사용자 경험을 제공합니다.
  - **구현 경계**: 모바일 뷰포트에서 터치 시작/이동/종료 이벤트를 감지하여 특정 임계치(Threshold) 이상 이동 시 해당 Toast 컴포넌트를 언마운트 처리.
- **이벤트/알림 필터링 토글 UI**
  - **근거**: 다중 에이전트 작업 시 초고속 다중 알림 발생이라는 엣지 케이스를 컴포넌트 내부 렌더링 최적화뿐 아니라 논리적으로도 방어하기 위해, 중요하지 않은 중간 진행 단계 이벤트 등을 사용자가 직접 끄고 켤 수 있게 합니다.
  - **구현 경계**: 대시보드 환경설정 영역에 간단한 스위치 컴포넌트를 배치하여 특정 타입(예: info, debug)의 Toast를 노출하지 않도록 클라이언트 측 렌더링 로직에서 필터링 적용.
