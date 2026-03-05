# REVIEW

## Functional bugs
- 프론트엔드 대시보드 폼(`web/src/App.tsx`)에서 프리셋 텍스트를 반복적으로 클릭하여 입력할 때, 불필요한 여백과 개행 문자가 계속해서 누적되는 버그가 있습니다. 텍스트 파싱 로직의 정규식을 최적화하여 텍스트가 삽입될 때 레이아웃이 깨지거나 불필요한 공백이 생기지 않도록 수정이 필요합니다.
- 워크플로우 빌더 UI(`web/src/components/WorkflowBuilder.tsx`)에서 노드 간 연결이 끊어진 단절 그래프(Disconnected graph)나 다중 진입점(Multi-entry)이 존재하는 등 비정상적인 구성 상태임에도 서버로 저장 API 요청이 전송되는 문제가 있습니다. 클라이언트 측에서 이를 사전에 차단하고 사용자에게 피드백을 주는 검증 로직이 누락되어 있습니다.

## Security concerns
- API 라우팅 단계에서 뷰어 토큰(Viewer Token)에 대한 인증 절차가 미흡합니다. 정상적인 프록시를 거치지 않고 직접 로컬 백엔드 서버(예: `http://localhost:3100`)로 우회 접근할 경우, 권한이 없는 사용자나 비정상적인 접근이 허용될 위험이 있습니다. `api/app/api/dependencies.py` 등의 미들웨어에서 강력한 토큰 검증 로직을 구현해야 합니다.
- 워크플로우 실행 엔진이 LLM 기반 에이전트의 환각이나 판단 오류로 인해 무한 루프에 빠질 경우, 시스템 리소스 및 외부 API 호출 예산을 빠르게 고갈시킬 수 있는 보안 및 운영상 취약점이 존재합니다. 엔진 런타임에 노드 실행 횟수를 카운팅하고, 임계치를 초과하면 즉시 실행을 중단(Pause)하는 보호 장치가 필수적입니다.

## Missing tests / weak test coverage
- 프론트엔드의 폼 프리셋 텍스트 처리 정규식 로직에 대한 단위 테스트(`web/src/App.test.tsx`)가 누락되어 있습니다. 영문, 국문, 멀티라인 형태 및 특수 기호 등 다양한 입력 엣지 케이스를 다루는 파라미터화된 단위 테스트가 추가되어야 합니다.
- 워크플로우 빌더 UI에서 비정상적인 그래프를 구성하고 저장을 시도할 때, 사전 차단 로직과 에러 피드백(Toast)이 정상적으로 노출되는지 확인하는 프론트엔드 E2E 테스트(`web/tests/e2e/WorkflowBuilder.spec.ts`)가 부족합니다.
- 백엔드 워크플로우 엔진의 유효성 검증 테스트(`api/tests/test_workflow_engine.py`)가 최신 요구사항을 반영하지 못하고 있습니다. 단절된 그래프를 허용했던 기존 사양을 제거하고, 비정상 그래프 데이터 수신 시 `400` 혹은 `422` 에러 상태 코드를 명확히 반환하는지 검증하는 테스트로 전면 개편해야 합니다.

## Edge cases
- 네트워크 지연이나 LLM 제공 서버의 응답 지연으로 인해 워크플로우 엔진 내의 단일 노드가 무한정 대기 상태에 빠지며 스레드를 영구 점유하는 상황이 발생할 수 있습니다. 무한 반복 횟수 제한과 더불어, 노드별 최대 실행 시간(Timeout) 초과 시 강제 일시 정지(Pause) 시키는 비동기 타임아웃 방어 로직이 마련되어야 합니다.
- 시스템 전반에서 동시다발적으로 에러(예: 폼 입력 에러, 빌더 유효성 에러, 네트워크 에러 등)가 발생할 때 사용자에게 노출되는 알림이 파편화될 수 있습니다. 이를 방지하기 위해 전역 상태를 기반으로 동작하는 공통 토스트 UI(`web/src/components/common/Toast.tsx`)를 고도화하여 일관된 톤앤매너로 메시지를 렌더링해야 합니다.
- 로컬 재현 및 테스트 시 포트 충돌: 백엔드 API 서버를 띄워 로컬에서 테스트하거나 cURL 등으로 직접 호출을 재현할 때는 환경 충돌을 피하기 위해 반드시 `3100`번대 포트를 사용하여 호출해야 합니다 (예: `curl -H "Authorization: Bearer <token>" http://localhost:3100/api/runs`).

## TODO
- [ ] `web/src/App.tsx`의 폼 프리셋 텍스트 입력 정규식 최적화 및 공백/개행 누적 버그 수정
- [ ] `web/src/App.test.tsx`에 폼 프리셋 텍스트 입력의 다양한 엣지 케이스를 검증하는 단위 테스트 추가
- [ ] `api/app/api/dependencies.py` 전역 API 라우팅에 뷰어 토큰(Viewer Token) 필수 검증 로직 추가
- [ ] `api/app/services/workflow_engine.py`에 워크플로우 노드 무한 루프 감지 및 강제 일시 정지(Pause) 로직 구현
- [ ] `web/src/components/WorkflowBuilder.tsx` 캔버스에 단절 그래프 및 다중 진입점 사전 차단 클라이언트 검증 추가
- [ ] `web/tests/e2e/WorkflowBuilder.spec.ts`에 빌더 UI 사전 유효성 검사 및 에러 노출 E2E 테스트 추가
- [ ] `api/tests/test_workflow_engine.py`의 그래프 유효성 검증 로직 테스트 전면 개편 (단절 허용 코드 제거 및 에러 응답 검증)
- [ ] `web/src/components/common/Toast.tsx`를 고도화하여 일관된 전역 에러 피드백(토스트 UI) 렌더링 환경 구축
- [ ] `api/app/services/workflow_engine.py`에 단일 노드 무한 응답 지연을 방어하기 위한 Timeout 강제 Pause 로직 추가
