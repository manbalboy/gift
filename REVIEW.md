# REVIEW

## Functional bugs
- **API (FastAPI) SSE 동시성 이슈**: `workflows.py`의 `_stream_workflow_runs_events`에서 `active_stream_connections` 전역 변수를 증감할 때 멀티스레드 환경에 대한 Lock(동기화) 처리가 누락되어 있습니다. FastAPI는 동기 제너레이터를 스레드 풀에서 실행하므로 Race condition이 발생하여 활성 연결 수가 부정확해질 수 있습니다.
- **Web (React) Toast 타이머 오류 가능성**: `Toast.tsx`에서 `durationMs`에 음수 값이 전달될 경우에 대한 명시적인 초기 방어 로직이 부족합니다. 내부적으로 `Math.max(0, ...)`를 사용하고 있으나, 타이머가 즉시 만료되어 컴포넌트가 의도치 않게 언마운트되는 버그를 방지하기 위해 `props` 단계에서 값을 정규화해야 합니다.

## Security concerns
- **Rate Limiting 우회 (IP Spoofing) 위험**: `api/app/api/workflows.py`의 `_extract_client_key` 함수에서 `x-forwarded-for` 헤더의 가장 첫 번째 IP를 맹목적으로 신뢰하고 있습니다. 악의적인 클라이언트가 해당 헤더를 임의의 IP로 변조하여 전송하면, 다른 사용자의 IP를 차단시키는 DoS(Denial of Service) 공격을 수행하거나 자신의 제한을 쉽게 우회할 수 있습니다. (Trusted Proxy 검증 로직 도입 필수)

## Missing tests / weak test coverage
- **WorkflowBuilder UI 상호작용 테스트 부족**: PLAN.md에서 언급된 ReactFlow 기반 노드/엣지 UI 시각화 기능에 대한 E2E(Playwright) 시나리오가 없습니다. `toast-layering` 위주의 테스트를 넘어, 워크플로우 캔버스에 접근(`http://localhost:3100`)하여 노드를 추가하고 검증하는 상호작용 테스트가 추가되어야 합니다.
- **Workflow 상태 변경 방어 테스트**: `PUT /workflows/{workflow_id}` 엔드포인트를 호출할 때, 이미 실행 이력(Run)이 있거나 운영 중인 워크플로우가 수정되어 데이터 무결성이 깨지는 상황을 방어하는지 검증하는 API 통합 테스트 케이스가 누락되어 있습니다.

## Edge cases
- **클라이언트 비정상 종료 시 리소스 누수**: 클라이언트가 SSE 스트림 통신 중 브라우저를 강제 종료하거나 네트워크가 끊겼을 때, 제너레이터 내에서 `yield` 수행 시 예외가 발생할 수 있습니다. 예외 처리 블록 구조가 단순하여 스트림 루프가 즉각적으로 중단되지 않고 대기할 위험이 존재합니다.
- **긴 문자열 오버플로우 (모바일)**: `Toast.tsx`에서 알림 메시지가 공백 없는 매우 긴 문자열(예: 에러 해시, 토큰, 긴 URL 등)일 경우, 높이를 계산하는 `isExpandableMessage` 로직에도 불구하고 모바일 뷰포트 레이아웃을 벗어날 수 있습니다. `word-break: break-all` 혹은 `overflow-wrap: anywhere` 처리와 연계된 엣지 케이스 검토가 필요합니다.
- **객체 직렬화 엣지 케이스**: `Toast.tsx`의 `formatToastMessage`에서 에러 객체의 `message`가 없고 `name`만 존재하거나, 커스텀 직렬화(`.toJSON()`) 과정에서 내부 예외를 발생시키는 복잡한 객체일 때의 UI 처리 및 fallback 상황이 충분히 고려되지 않았습니다.

## TODO
- [ ] API: `_stream_workflow_runs_events` 내 전역 변수(`active_stream_connections`) 스레드 안전성 확보 (Threading Lock 적용).
- [ ] API: `_extract_client_key` 로직에 신뢰할 수 있는 프록시(Trusted Proxy) 검증 및 안전한 IP 추출 알고리즘 도입.
- [ ] API: 실행(Run) 이력이 있는 Workflow 수정 요청(`PUT`) 차단 또는 버전 관리 로직 구현 및 테스트 추가.
- [ ] Web: `Toast.tsx` 내 `durationMs` 음수 입력 방어 코드 추가 및 공백 없는 긴 문자열 대비 CSS(`word-break`) 적용.
- [ ] Web: 브라우저 환경(`http://localhost:3101`)에서 `WorkflowBuilder` 캔버스 노드 조작 및 시각화 검증 Playwright E2E 테스트 신규 작성.
- [ ] Web: PLAN.md 고도화 목표 반영 - Toast 알림 화면 가림 방지를 위한 최대 노출 개수 제한 및 큐잉(Queueing) 스케줄링 로직 구현.
- [ ] Web: PLAN.md 고도화 목표 반영 - 에러/디버깅 객체 출력을 원클릭으로 복사할 수 있는 클립보드(Copy to Clipboard) 액션 버튼 UI 추가.
