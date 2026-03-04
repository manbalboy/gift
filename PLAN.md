# PLAN

## 1. Task breakdown with priority

- **[P0] Web UI 버그 수정 및 예외 처리 (REVIEW 반영)**
  - `web/src/components/Toast.tsx`: 모바일 터치(`onTouchStart`, `onTouchMove`) 중 자동 닫힘 타이머 일시 정지 로직 추가.
  - `web/src/components/Toast.tsx`: `item.message`가 Object/Array인 경우 `[object Object]` 노출을 방지하고 `JSON.stringify()` 등을 활용해 데이터 파싱 규칙 적용.
  - `web/src/components/Toast.tsx`: `durationMs`가 `0`일 때 즉시 닫히지 않고 영구 유지되도록 예외 처리 구현.
- **[P0] E2E 테스트 안정화 및 시나리오 추가 (REVIEW 반영)**
  - `web/tests/e2e/toast-layering.spec.ts`: `.toast-stack` 내의 자식 요소 렌더링 이후에 가시성을 단언(Assert)하도록 타이밍 수정.
  - `web/tests/e2e/toast-layering.spec.ts`: API 모킹 범위를 세분화하여, 의도된 422 에러 응답이 정상적으로 반환되고 엣지 케이스를 검증하도록 수정.
  - `web/tests/e2e/toast-layering.spec.ts`: 브라우저 환경에서 Hover/Focus에 의한 타이머 일시 정지 및 재개 동작 E2E 테스트 케이스 신규 작성.
- **[P1] Workflow Engine v2 기반 구조 도입 (SPEC 반영)**
  - `api/app/main.py`, `api/app/api/workflows.py`: `workflow_id` 기반 정의 실행 로직으로 엔진 개선 (node_runs 데이터 저장소 연결 포함).
  - `web/src/components/WorkflowBuilder.tsx`: ReactFlow 기반 노드/엣지 UI 시각화 및 검증 기능 기본 연동.

## 2. MVP scope / out-of-scope

- **MVP Scope**
  - 기존 `Toast` 알림 시스템의 모바일 터치 이슈 해결 및 에러 객체 렌더링 안정화.
  - 관련 E2E 테스트 (Playwright) 실패 항목 수정 및 누락된 타이머 관련 테스트 케이스 보강.
  - API 서버의 Workflow 실행 엔진 기반을 마련하고 UI에서 빌더 캔버스 기초 연동.
  - 프론트엔드 웹 앱 로컬 개발 구동 (실행 가이드에 따라 `3000`번대 포트 사용).
- **Out-of-scope**
  - 에이전트 마켓플레이스 및 SDK의 전체 플러그인 생태계 개발 (SPEC의 아이디어 E 전체 스펙).
  - 전체 시스템의 분산 큐 및 쿠버네티스(EKS) 전환 등 인프라 스케일아웃 적용.

## 3. Completion criteria

- `npm run test:e2e` 실행 시 Playwright 테스트 케이스가 100% 성공해야 함.
- 모바일 기기(또는 에뮬레이터)에서 Toast 터치 시 알림이 닫히지 않고 정상적으로 내용이 표출됨을 확인함.
- 객체 형태의 알림 메시지를 주입했을 때, 브라우저 화면에 에러 객체 내용이 문자열 형태로 가시성 있게 노출되어야 함.
- API 및 Web의 변경 사항이 CI를 통과하고 PR 리뷰에서 승인 가능한 코드 퀄리티를 달성함.

## 4. Risks and test strategy

- **Risks**
  - 타이머 기반의 Toast 닫힘 로직은 터치 이벤트와의 중첩 시 브라우저별 이벤트 루프에 따라 예기치 않게 만료될 위험성이 존재함.
  - 포괄적인 API 모킹 구조가 다른 테스트에 부작용을 미칠 수 있음.
- **Test Strategy**
  - **단위/통합 테스트**: Jest 환경에서 `durationMs=0` 설정 및 복잡한 Array/Object 객체 전달 시 렌더링되는 마크업(DOM) 구조를 상세 단언(Assert).
  - **E2E 테스트**: Playwright 모바일 뷰포트 설정을 통해 실제 터치 및 스와이프 이벤트를 발생시키고, 타이머 정지 여부를 프레임 단위로 검증. 모킹은 특정 URL 패턴과 메서드에만 정확히 일치하도록 좁은 범위(Scope)로 제한 적용.

## 5. Design intent and style direction

- **기획 의도**: 워크플로우 실행 엔진의 상태와 오류를 사용자에게 직관적으로 피드백하고, 조작 중에는 정보가 사라지지 않도록 하여 심리적 안정감을 제공한다.
- **디자인 풍**: 개발자 친화적인 대시보드형, 모던하고 깔끔한 카드형 알림 컴포넌트 디자인.
- **시각 원칙**: 다크 모드를 기본으로 지원하며, 에러나 시스템 알림은 명확한 컬러 뱃지와 적절한 패딩/마진을 통해 가독성을 높인다.
- **반응형 원칙**: 모바일 우선(Mobile-first) 규칙을 적용하여 화면 크기가 작은 환경에서도 타임라인과 알림 스택이 겹치지 않고 온전히 표시되도록 한다.

## 6. Technology ruleset

- **플랫폼 분류**: web 및 api
- **web**: React 프레임워크(Vite 환경) 기반으로 계획.
- **api**: FastAPI 기반으로 계획.
- 로컬 웹 서비스 실행 가이드는 `3000`번대 포트(예: `3000`)를 명시하여 사용. (단, 도커 배포 환경 및 프리뷰는 7000번대 포트 터널링 적용)

## 7. 고도화 플랜

REVIEW.md의 TODO 항목들을 반영하여 아래와 같은 인접 고도화 계획을 추가합니다.

- **Toast 알림 스택 렌더링 최적화 큐잉(Queueing) 처리**
  - **근거**: 객체 메시지 파싱 강화 및 `durationMs=0` 영구 노출 알림이 늘어날 경우, 모바일 화면을 알림 카드들이 과도하게 가리게 됩니다.
  - **구현 경계**: `Toast` 알림 최대 표시 개수(예: 3개)를 제한하고 초과분은 대기열(Queue)에 보관해 순차 노출하는 스케줄링 기능을 도입합니다. (`web/src/hooks` 등의 상태 관리 기반)
- **에러 스니펫 복사(Copy to Clipboard) 액션 추가**
  - **근거**: `JSON.stringify()`로 노출되는 상세 에러 객체의 경우, 디버깅을 위해 이 내용을 원클릭으로 쉽게 복사할 수 있어야 합니다.
  - **구현 경계**: 알림 카드 내부에 가벼운 '복사' 버튼 아이콘을 배치하여 시스템 클립보드 API를 호출하도록 설계합니다. 톤앤매너 유지를 위해 미니멀하게 구성합니다.
