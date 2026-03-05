# REVIEW

## Functional bugs
- **Human Gate 프리셋 개행 처리 오류**: 대시보드의 `handleRejectReasonPreset` 로직에서 후행 공백 및 개행 문자를 판별하는 정규식(`/\n$/`) 처리 등 논리적 오류가 존재하여, 프리셋 버튼을 연속으로 클릭할 경우 입력 폼에 불필요한 빈 줄이 과도하게 누적되는 UI 버그가 존재합니다.

## Security concerns
- **로컬 우회 직접 접근 인증 취약점**: 로컬 환경에서 Nginx 등 리버스 프록시를 생략하고 3100번대 포트(예: `http://localhost:3100`)로 Preview 및 API 서버에 직접 접근할 경우, 일회성 뷰어 토큰(One-time Viewer Token)을 검증하는 백엔드 인증 레이어를 우회하여 인가되지 않은 아티팩트 열람 및 상태 접근이 발생할 수 있는 위험이 있습니다. 미들웨어 레벨에서의 엄격한 통제 점검이 필요합니다.

## Missing tests / weak test coverage
- **단절 그래프 관련 API 테스트 충돌**: 워크플로우 엔진이 단절된 그래프(Disconnected Graph)를 거부하도록 정책이 상향되었으나, 기존 API 테스트(`api/tests/test_workflow_engine.py`의 `test_engine_runs_independent_nodes_without_forced_sequential_fallback`)가 이를 반영하지 않아 의도된 유효성 실패(400/422) 처리에 대한 검증 테스트로 수정되지 않고 충돌하고 있습니다.
- **UI 프리셋 로직 단위 테스트 부재**: 프론트엔드 `web/src/App.test.tsx`에 텍스트 프리셋 병합 및 개행 처리 로직을 검증하는 단위 테스트가 누락되어 있습니다.
- **Builder 시각화 엣지 케이스 E2E 누락**: 워크플로우 빌더 캔버스에서 다중 Entry를 생성하거나 엣지가 연결되지 않은 단절 노드를 구성한 후 저장을 시도할 때, UI 상에서 사용자에게 올바른 에러(토스트 및 모달)를 노출하는지 검증하는 E2E 테스트 커버리지가 미비합니다.

## Edge cases
- **초장기 실행 중 무한 루프(Agentic Loop)**: Autopilot Control Plane을 통한 24시간 장기 실행 시, LLM 에이전트의 오작동이나 계획 수립 오류로 인해 특정 노드가 무한 반복 사이클에 빠져 예산(Budget)과 호출 횟수가 초과될 수 있는 엣지 케이스가 있습니다. 이를 제어할 엔진 레벨의 강제 일시 정지(Pause) 메커니즘을 고려해야 합니다.
- **다중 진입점 및 불안전 그래프 상태**: 사용자가 Visual Builder 편집 중 일시적인 단절 상태나 다중 진입점(Multi-entry)을 유지한 채 실행을 시도할 경우 백엔드가 중단되지 않도록, 클라이언트와 서버 양측에서 그래프 상태를 즉시 격리하고 피드백을 주어야 합니다.

## TODO
- [ ] `web/src/App.tsx` 내 `handleRejectReasonPreset` 함수의 개행 문자 누적 병합 버그 수정
- [ ] `api/tests/test_workflow_engine.py`의 단절 그래프 테스트를 400/422 유효성 에러를 검증하는 코드로 전면 개편
- [ ] `web/src/App.test.tsx`에 폼 텍스트 프리셋 병합 및 후행 공백 제거 단위 테스트 추가
- [ ] `web/tests/e2e/WorkflowBuilder.spec.ts`에 단절된 그래프 및 다중 Entry 저장 시도 에러 UI 노출 검증 E2E 테스트 보강
- [ ] 3100번대 포트를 통한 로컬 직접 접근 시 서버 미들웨어의 뷰어 토큰(Viewer Token) 인증이 엄격히 적용되도록 점검 및 방어 로직 추가
