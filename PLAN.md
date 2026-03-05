# PLAN

## 1. Task breakdown with priority

### P0 (Critical - 버그 수정 및 핵심 테스트 보완)
- **Task 1: XSS 필터 정규식 교정 및 렌더링 방식 개선**
  - 대상 파일: `web/src/utils/security.ts`
  - 내용: 강제 태그 삭제 정규식을 제거하고 DOMPurify를 활용하여 악성 스크립트를 무효화하되, `<T>` 등 제네릭 문법이나 정상적인 꺾쇠괄호 텍스트가 HTML 엔티티(`&lt;`, `&gt;`)로 안전하게 변환되어 화면에 렌더링되도록 수정합니다.
- **Task 2: 프론트엔드 역검증 유닛 테스트 복구**
  - 대상 파일: `web/src/components/SystemAlertWidget.test.tsx` (또는 관련 XSS 검증 테스트 파일)
  - 내용: Task 1의 변경 사항에 맞추어 악성 텍스트가 강제 삭제되지 않고 텍스트 형태로 안전하게 표시되는지 검증하도록 테스트 케이스를 수정 및 통과시킵니다.
- **Task 3: 큐 오버플로우 시 클라이언트 경고 UI 연동**
  - 대상 파일: `web/src/components/` 내 알림 관련 컴포넌트, `web/src/hooks/`
  - 내용: 루프 엔진 큐가 가득 차 지시사항이 `dropped` 상태로 전환될 때, API 응답 혹은 이벤트를 감지하여 사용자에게 명시적으로 알려주는 경고 알림(Toast UI 등)을 연동합니다.
- **Task 4: Redis Lock Fail-fast 에러 전파 E2E 테스트 추가**
  - 대상 파일: `api/tests/test_workflow_engine.py` 등 통합 테스트 모듈
  - 내용: Redis Lock 획득 실패 시 전체 시스템이 에러 상태로 전환되고, 3100번 포트 API를 통해 해당 경고가 올바르게 전파되는지 확인하는 종단 간(E2E) 테스트를 추가합니다.

### P1 (High - 동시성 제어 검증)
- **Task 5: 다중 상태 제어 신호 동시성 스트레스 테스트 구축**
  - 대상 파일: `api/tests/test_loop_engine_api.py` (또는 신규 E2E 테스트 모듈)
  - 내용: 엔진 실행 중 Pause, Resume, Stop 등 상태 제어 신호가 짧은 간격(예: 0.1초)으로 여러 번 인가될 때 발생할 수 있는 스레드 데드락이나 상태 꼬임을 방지하기 위한 동시성 스트레스 테스트를 작성합니다.

### P2 (Medium - 상태 모니터링 고도화)
- **Task 6: LoopMonitorWidget.tsx 대시보드 컴포넌트 개발**
  - 대상 파일: `web/src/components/LoopMonitorWidget.tsx`, `web/src/App.tsx`
  - 내용: 엔진의 Quality Score, 잔여 반복 횟수(max_loop_count), 현재 실행 중인 Task 등을 실시간으로 시각화하여 사용자가 직관적으로 루프 상태를 모니터링할 수 있는 UI 컴포넌트를 구현합니다.

---

## 2. MVP scope / out-of-scope

### MVP Scope
- 프론트엔드 보안 유틸리티의 XSS 필터 로직 정상화 및 제네릭 타입 문법의 화면 표시 보장
- 시스템 명령 큐 한도 초과(Dropped) 발생 시 클라이언트 UI에 명시적 에러 피드백 노출
- 백엔드 분산 락(Redis) 획득 실패 시 API 레벨의 빠른 에러 전파(Fail-fast) 및 관련 E2E 테스트 확보
- 다중 제어 명령(Start/Pause/Stop)에 대한 시스템 상태 전이의 안정성 스트레스 테스트 확보
- 사용자가 직관적으로 확인할 수 있는 핵심 루프 모니터링 대시보드 컴포넌트(LoopMonitorWidget) 기본 기능 연동

### Out-of-scope
- 새로운 AI 엔진 연동 및 기존 프롬프트 파이프라인의 전면 구조 변경
- 복잡한 사용자 역할 기반 접근 제어(RBAC) 및 계정 인증 시스템 도입
- 멀티 클러스터 환경에서의 복합 분산 락 아키텍처 도입 (현재는 단일 Redis 노드/Lock 기준)

---

## 3. Completion criteria
- `web/src/utils/security.ts` 수정 사항이 프론트엔드 유닛 테스트 패키지(`npm run test`)를 100% 통과해야 합니다.
- 제네릭 코드(`<T>`)와 같은 정상 텍스트가 화면 출력 시 삭제되지 않고 보존되어야 합니다.
- 큐 오버플로우 이벤트 발생 시, 프론트엔드 브라우저 화면에 즉각적으로 Toast 형태의 경고 메시지가 표시되어야 합니다.
- 백엔드 API 테스트 시나리오에서 Redis Lock 점유 시나리오 실행 시, HTTP 상태 코드를 포함한 에러 전파 테스트가 통과(Exit Code 0)해야 합니다.
- 다중 신호 동시성 테스트에서 데드락 없이 최종 엔진 상태가 일관성 있게 유지됨을 증명해야 합니다.
- `LoopMonitorWidget.tsx` 위젯이 정상 마운트되고, 목업(Mock) API 또는 실제 API 응답을 통해 수신된 Quality Score와 진행 상태가 화면에 렌더링되어야 합니다.

---

## 4. Risks and test strategy

### Risks
- 보안 정규식 완화로 인해 미처 방어하지 못한 새로운 유형의 XSS 취약점이 발생할 가능성.
- 상태 제어 신호에 대한 스트레스 테스트가 CI/CD 환경의 자원 상태에 따라 간헐적으로 실패(Flaky test)할 가능성.
- 짧은 주기로 루프 상태를 갱신하는 모니터링 위젯으로 인한 프론트엔드 브라우저 렌더링 성능 저하.

### Test strategy
- **보안 역검증 보완**: 정상적인 코드 조각(`<img src="..." />`, `Array<string>`)과 악의적 페이로드(`<script>alert(1)</script>`)를 병행 입력하여 기능과 보안이 모두 동작하는지 교차 검증하는 단위 테스트를 작성합니다.
- **Fail-fast API 검증**: Redis Lock 객체를 의도적으로 선점한 상태에서 워크플로우 실행 API를 호출해 응답 지연 없이 즉각적인 실패 메시지가 반환되는지 확인합니다.
- **동시성 부하 테스트**: Python의 비동기 워커 구조를 활용하여 여러 제어 명령을 비동기적으로 동시에 발송하고, 엔진의 내부 상태 머신(State Machine)이 꼬이지 않는지 Assertion으로 확인합니다.

---

## 5. Design intent and style direction
- **기획 의도**: 지속해서 코드를 개선하는 자율형 개발 AI(Self-Improvement Loop Engine)의 동작 과정을 투명하게 시각화하고, 명령 누락과 같은 시스템적 예외 상황을 즉각적으로 인지할 수 있는 신뢰성 높은 제어 환경을 제공합니다.
- **디자인 풍**: 모던 대시보드형 (Modern Dashboard). 복잡한 로그 데이터와 핵심 메트릭 지표를 깔끔하게 분리하여 가독성을 높입니다.
- **시각 원칙**:
  - 컬러: 어두운 배경의 개발자 친화적 다크 모드(Dark Mode)를 베이스로 하며, 에러/경고 피드백은 눈에 띄는 주황색 및 붉은색 포인트 컬러를 사용하여 경각심을 부여합니다.
  - 패딩/마진: 정보 위젯(Card) 간 16px~24px 수준의 넉넉한 여백을 배치하여 화면의 복잡도를 낮춥니다.
  - 타이포그래피: 코드 스니펫 및 터미널 로그 출력부는 Monospace 계열을 적용하고, Quality Score 등 대시보드 핵심 수치는 두껍고 명시적인 Sans-serif 폰트를 사용합니다.
- **반응형 원칙**: 모바일 우선 규칙(Mobile First)을 적용하여 좁은 화면에서는 핵심 지표가 상단에, 제어 컨트롤러와 로그가 하단에 1 Column으로 배치되며 확장 시 다단 Grid 배치로 자연스럽게 전환됩니다.

---

## 6. Technology ruleset
- **플랫폼 분류**: web / api
- **프레임워크 규칙 (web)**: React 기반 프레임워크를 사용하며 컴포넌트 구조로 UI를 설계합니다.
- **프레임워크 규칙 (api)**: FastAPI를 기반으로 엔진 제어 및 모니터링용 비동기 REST API 포인트를 구성합니다.
- **포트 규칙**: 프론트엔드 개발 서버는 3000번대 포트를 사용하고, 백엔드 API 서버는 3100번 포트를 사용합니다. (배포 시 Preview 환경은 7000번대 할당)
