# PLAN

## 1. Design intent and style direction
- **기획 의도**: 지속적으로 코드를 분석하고 개선하는 AI 개발 시스템(Autonomous Developer)의 현재 상태, 품질 점수, 그리고 진행 상황을 투명하게 시각화하여 사용자가 안정감을 느끼고 쉽게 통제할 수 있는 관제 대시보드 경험 제공.
- **디자인 풍**: 모던 대시보드형 (Modern Dashboard), 엔진 상태 모니터링에 최적화된 카드형 UI.
- **시각 원칙**: 
  - 컬러: 시스템 엔진 상태에 따른 직관적 컬러 시스템 적용 (정상 구동: Green, 대기/일시정지: Yellow, 오류/중단/큐 가득참: Red).
  - 여백/패딩: 카드 간 최소 16px 마진, 내부 24px 패딩을 적용하여 텍스트 및 로그의 가독성 확보.
  - 타이포그래피: 코드 조각 및 로그 뷰어 공간에는 모노스페이스(Monospace) 폰트 적용.
- **반응형 원칙**: 모바일 우선(Mobile-first) 설계 적용. 모바일에서는 카드 스택 형태로 수직 배열하고, 태블릿 및 데스크톱 환경에서는 다단 그리드 레이아웃(Grid Layout)으로 자동 확장.

## 2. Technology ruleset
- **플랫폼 분류**: web / api
- **web**: React 기반 라이브러리 및 Vite 환경 활용 (기존 `web/` 디렉토리 아키텍처 연장).
- **api**: FastAPI 기반 비동기 프레임워크 활용 (기존 `api/` 디렉토리 아키텍처 연장).

## 3. Task breakdown with priority

### [P0] REVIEW.md 기반 버그 수정 및 안정화 (고도화 플랜)
> 기존 시스템의 치명적인 UI 버그 및 보안 필터링 실패 이슈를 우선 해결합니다.
- **P0-1. 보안 유틸리티 설정 보완 (XSS 과적합 해결)**: 
  - 변경 대상: `web/src/utils/security.ts`, `web/tests/security.test.ts`
  - 내용: DOMPurify가 `<T>`와 같은 정상적인 제네릭 코드나 문법 요소를 유실시키지 않도록 설정 보완 및 역검증 테스트 케이스 추가.
- **P0-2. 실패하는 프론트엔드 유닛 테스트 수정**: 
  - 변경 대상: `web/src/components/SystemAlertWidget.test.tsx`
  - 내용: XSS 방어 로직으로 태그가 완전히 삭제되는 DOMPurify 동작 변경 사항에 맞춰 Assertion(기대 결과) 수정.
- **P0-3. 예외 상황 UI 피드백 누락 연동**: 
  - 변경 대상: `web/src/components/` 내부 뷰어 영역
  - 내용: 큐 오버플로우로 인해 지시사항 상태가 `dropped` 처리된 경우, 이를 사용자에게 명확히 알리는 경고 토스트/알림 컴포넌트 UI 연동. (API: `GET /api/workflow/instruction/{id}`)
- **P0-4. 장애 상황 연동 E2E 테스트 보강**: 
  - 변경 대상: `api/tests/test_workflow_engine.py` 등 통합 테스트 파일
  - 내용: Redis Lock 실패(Fail-fast) 시 시스템 상태가 에러로 전환되고 로컬 API (포트 3100) 응답에 경고가 올바르게 전파되는지 검증하는 시나리오 추가.

### [P1] Self-Improvement Loop 코어 엔진 구현 (MVP)
> SPEC.md 기반의 4단계 자가 개선 루프 흐름을 지원하는 백엔드 파이프라인을 설계합니다.
- **P1-1. 코어 엔진 파이프라인 설계**: 
  - 변경 대상: `api/app/services/workflow_engine.py` 등
  - 내용: Analyzer → Evaluator → Planner → Executor 로 이어지는 데이터 흐름 및 Quality Score 계산 로직 초안 작성.
- **P1-2. Long-Running Workflow 제어 API 추가**: 
  - 변경 대상: `api/app/api/workflows.py`
  - 내용: 장기 실행 루프 엔진의 상태를 제어하는 Start, Pause, Resume, Stop 및 새로운 지시사항을 삽입하는 Inject Instruction 엔드포인트 구현.
- **P1-3. 루프 안정성 제어 정책(Loop Control) 적용**: 
  - 변경 대상: `api/app/services/loop_simulator.py` 
  - 내용: 코드 퇴화 및 무한 반복 방지를 위한 `max_loop_count`, `quality_threshold`, `budget_limit` 기반 제어 로직 통합.

### [P2] 고도화 및 상태 모니터링 UI 연동 (추가 기능 제한 1개)
- **P2-1. [추가기능] 루프 상태 실시간 모니터링 뷰 구현**:
  - 추가 근거: 루프 엔진의 품질 평가 점수와 현재 동작 단계를 시각적으로 확인해야만 사용자가 루프 상태(Pause/Resume/Stop)를 적절히 제어할 수 있으므로 필수적으로 맞물려야 하는 기능.
  - 변경 대상: `web/src/components/LoopMonitorWidget.tsx` (신규 파일)
  - 내용: 루프 엔진의 현재 Quality Score, 실행 Task, 잔여 반복 횟수 등을 대시보드 내 하나의 카드로 표시.

## 4. MVP scope / out-of-scope

### MVP Scope
- `REVIEW.md` 내에 명시된 모든 보안/오동작 TODO(보안 코드 훼손 버그 수정, 큐 오버플로우 `dropped` 알림 피드백, E2E 검증 로직).
- Analyzer/Evaluator/Planner/Executor 4단계 구조를 거치는 단일화된 엔진 프로세스 모사 및 API 연동.
- 루프 상태 제어를 지원하는 Long-Running API 구축 및 엔진의 진행 상태 모니터링 카드 뷰 연결.
- 로컬 실행 시 충돌 없는 3000번대 포트 활용 (Web: 3000, API: 3100).

### Out-of-scope
- 대규모 소스 코드를 직접 파싱하여 완벽한 추상 구문 트리(AST)로 분석하는 딥 엔진 고도화.
- 실제 거대 언어 모델(LLM)을 연동한 프로덕션 레벨의 코드 리팩토링 및 PR 자동 생성 로직.
- 단기 네트워크 순단에 대응하는 복잡한 Redis Retry 클러스터링 알고리즘 (현재의 안정성을 위한 Fail-fast 정책 유지).

## 5. Completion criteria
- 컴포넌트 유닛 테스트(`SystemAlertWidget.test.tsx`) 및 보안 유틸리티 역검증 테스트 케이스가 오류 없이 통과해야 한다.
- 명령어 큐 가득참 등으로 처리되지 못한 `dropped` 상태 지시사항이 프론트엔드에 명시적인 에러 알림 UI로 표출되어야 한다.
- 개발 환경 구동 시 API는 3100 포트, Web 프론트엔드는 3000 포트에서 충돌 없이 정상 구동되어야 한다.
- 사용자는 대시보드를 통해 Self-Improvement Loop 엔진을 구동하고 일시정지(Pause) 또는 재개(Resume)할 수 있어야 하며, 설정된 `max_loop_count` 도달 시 루프가 안전하게 자동 종료되어야 한다.

## 6. Risks and test strategy
- **Risk 1. XSS 보안 규칙 과적합으로 인한 코드 데이터 훼손**:
  - **Test Strategy**: 정상적인 코드 텍스트(예: 제네릭 활용 객체, 꺾쇠괄호 등)와 악성 XSS 페이로드를 구분하는 독립적인 단위 테스트(Unit Test)를 `security.test.ts`에 충분히 작성하여 잠재적 회귀를 차단한다.
- **Risk 2. 다중 제어 명령으로 인한 상태 꼬임 (Race Condition)**:
  - **Test Strategy**: 백그라운드 엔진 실행 중 Pause/Resume/Stop 등의 신호가 매우 짧은 간격으로 여러 번 인가될 때 스레드 데드락이 발생하지 않는지 검증하기 위한 동시성 스트레스 테스트를 구성한다.
- **Risk 3. 장애 상황 시나리오에 대한 인지 지연**:
  - **Test Strategy**: Redis Lock 획득 실패 시 `UnavailableLockProvider`를 발생시켜 전체 시스템 중단(Fail-fast)을 모의하고, 해당 중단 이벤트가 API(3100 포트) 응답 및 대시보드 알림 위젯까지 정상 전달되는지 종단 간 테스트(E2E)를 수행한다.
