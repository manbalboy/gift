# REVIEW

## Functional bugs
- **Workflow Engine의 Race Condition**: 여러 클라이언트의 브라우저 탭에서 대시보드를 동시에 폴링할 경우, 동일한 워크플로우 실행 건에 대해 중복된 워커 프로세스(`bash -lc`)가 트리거될 가능성이 있습니다. DB Row Lock(`with_for_update`)을 통한 트랜잭션 동시성 제어가 완벽히 보장되어야 합니다.
- **Subprocess 무한 대기 (Hang) 위험**: 실제 CLI 명령어(`bash -lc`)를 호출하도록 엔진을 연동할 때, 에이전트 스크립트가 외부 API 타임아웃이나 무한 루프에 빠질 경우 서버 자원(메모리 및 CPU)을 영구 점유하며 다른 작업에 지장을 줄 수 있습니다. 실행 시간 제한(Timeout) 및 프로세스 강제 종료 처리가 누락되어 있습니다.

## Security concerns
- **CORS 설정 취약점 및 누락**: `manbalboy.com` 도메인과 그 서브도메인, 포트(예: `http://ssh.manbalboy.com:3100`, `http://manbalboy.com:3101` 등)를 허용해야 하는 요구사항에서, 정규식 매칭이 엄격하지 않을 경우 악의적인 유사 도메인이 허용되는 취약점이 발생할 수 있습니다.
- **Path Traversal (경로 탐색) 공격 위험**: Workspace 경로를 생성하거나 아티팩트를 파일 시스템에 저장할 때, 조작된 노드 ID나 파일명에 `../` 또는 `../../etc/passwd`와 같은 상위 디렉토리 탐색 문자열이 포함될 경우 시스템의 민감한 파일에 접근하거나 임의의 파일을 덮어쓸 수 있는 보안 위협이 존재합니다.

## Missing tests / weak test coverage
- **워크플로우 그래프 무결성 검증 테스트 부재**: 빈 그래프(노드가 없는 상태)나 순환 참조가 포함된 워크플로우가 생성 요청으로 들어왔을 때, 이를 422 상태 코드로 방어하는 Pydantic Validator에 대한 백엔드 API 테스트(pytest)가 누락되어 있습니다.
- **동시성 및 상태 전이 부하 테스트 부족**: 비동기 픽스처(`pytest-asyncio`)를 활용해 병렬 폴링 요청이 발생했을 때 트랜잭션 경합과 데드락 없이 안전하게 하나의 워커만 실행되는지 검증하는 테스트가 필요합니다.
- **프론트엔드 UI 컴포넌트 유닛 테스트**: React Flow 기반의 시각적 워크플로우 빌더 캔버스(`WorkflowBuilder.tsx`)가 정상적으로 렌더링되고, 데이터 적용 시 노드 상태(성공, 실패 등)가 올바르게 매핑되는지 확인하는 Jest 기반 프론트엔드 테스트 커버리지가 요구됩니다.

## Edge cases
- **CORS 및 특수 포트 변형**: 로컬 개발 환경 또는 다양한 프리뷰 포트 범위 내에서 오리진 끝에 슬래시(`/`)가 붙거나 특수한 포트 번호 조합이 들어올 때 정규식 필터링이 실패해 정상적인 API 호출이 막히는 엣지 케이스가 발생할 수 있습니다.
- **비정상 강제 종료 시 상태 불일치**: 서버 메모리 부족(OOM)이나 시스템 재시작으로 인해 프로세스가 갑자기 종료되었을 때, DB 상태는 계속 `running`으로 남아 대시보드에 영원히 멈춘 상태가 노출될 수 있습니다. 진행 중인 상태에 대한 보상 로직이나 타임아웃 실패 처리가 고려되어야 합니다.

## TODO
- [ ] `api/app/main.py`의 CORS 허용 정규식 패턴 수정 (서브도메인 및 포트 포함 `manbalboy.com` 계열 완벽 지원).
- [ ] `api/app/services/workspace.py` 내 Path Traversal(`../` 등) 방어를 위한 파일 경로 검증 및 필터링 로직 추가 구현.
- [ ] `api/app/services/workflow_engine.py`에 DB Row Lock(`with_for_update`) 적용하여 다중 폴링 시 Race Condition 방어.
- [ ] `api/app/services/agent_runner.py`에서 기존 Mock 로직을 제거하고, 실제 `bash -lc` Subprocess 호출을 수행하도록 파이프라인 구현.
- [ ] 에이전트 워커 실행 시 무한 대기를 방지하기 위해 프로세스 타임아웃 및 kill 시그널 전송 기능(안전 장치) 추가.
- [ ] `api/app/schemas/workflow.py`에 노드 개수 최소 1개 이상 및 그래프 순환 참조 방지를 위한 Pydantic Validator 작성.
- [ ] 워크플로우 API 검증(빈 노드, 순환 참조 차단, Path Traversal 방어) 및 동시성 락을 테스트하는 백엔드 테스트 코드(`test_workflow_api.py` 등) 추가.
- [ ] `web/src/components/WorkflowBuilder.test.tsx` 파일 생성 및 React Flow 노드 렌더링, 상태 변화에 대한 Jest UI 유닛 테스트 작성.
