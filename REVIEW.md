# REVIEW

## Functional bugs
- **CORS 설정 누락 (서브도메인 및 포트 허용 불완전)**: SPEC 문서에서는 "manbalboy.com 이라는 도메인이 들어가면 서브도메인이든 포트가 달라도 허용"해야 한다고 명시되어 있습니다. 그러나 현재 `api/app/main.py`의 CORS 설정은 `allow_origins`에 `http://manbalboy.com`과 `https://manbalboy.com`만 정확히 포함하고 있으며, `allow_origin_regex` 정규식은 `localhost` 계열(3100번대 포트)에만 적용되어 있습니다. 이로 인해 서브도메인(예: `http://ssh.manbalboy.com:7000`)에서 접근할 경우 CORS 정책에 의해 차단되는 기능적 버그가 존재합니다.
- **Workflow 엔진 실행 로직이 Mock 상태임**: 현재 `WorkflowEngine`과 `AgentRunner`가 실제 환경에서 워커(worker)로서 CLI 명령어(예: `bash -lc` 등)를 호출하여 작업을 수행하지 않고, 단순히 경과 시간(`STEP_SECONDS`)에 기반해 Mock 데이터를 반환하며 파이프라인 상태를 강제 전이시키는 형태로 구현되어 있습니다. 

## Security concerns
- **Path Traversal 취약점 (Workspace Service)**: `api/app/services/workspace.py` 파일의 `write_artifact` 메서드는 파일 경로를 생성할 때 파라미터로 전달받은 `node_id`를 파일명으로 결합(`target_dir / f"{node_id}.md"`)하여 파일을 생성합니다. 만약 API나 시스템 내부로 `node_id`에 `../../` 와 같은 디렉토리 탐색 문자열이 주입될 경우, 인가되지 않은 상위 디렉토리에 파일을 생성하거나 기존 파일을 덮어쓸 수 있는 보안 위험이 존재합니다.

## Missing tests / weak test coverage
- **보안 및 예외 케이스 테스트 부재**: CORS 정책 적용(정규식 포함)이 올바르게 동작하는지 검증하는 테스트나, Path Traversal 방지를 확인하는 백엔드 테스트 케이스가 작성되어 있지 않습니다.
- **프론트엔드 UI 통합 테스트 누락**: 백엔드 API(상태 전환 및 엔드포인트)에 대한 단위 테스트는 `pytest`를 통해 통과(`test_workflow_engine.py` 등)하고 있으나, React Flow 기반 워크플로우 빌더 컴포넌트 동작 및 렌더링 검증, 프론트엔드 E2E 통합 테스트 시나리오가 아예 존재하지 않습니다.
- **그래프 유효성 검증 테스트 부족**: 노드가 0개인 빈(Empty) 워크플로우 생성이나 무한 순환(Cycle) 엣지를 갖는 그래프가 입력될 경우 시스템이 올바르게 차단하는지 검증하는 API 스키마 테스트 코드가 누락되어 있습니다.

## Edge cases
- **동시성(Concurrency) 및 상태 경쟁(Race Condition)**: `WorkflowEngine.refresh_run()` 메서드는 조회 시점의 시간차를 계산해 지연된 노드를 실행(`agent_runner.run()`)시킵니다. 웹 UI 등에서 동일한 `run_id`에 대해 동시다발적으로 폴링(Polling) 및 조회가 인입될 경우, 특정 노드의 상태(`node_run.status`)가 DB에 커밋되기 전에 여러 요청이 동시에 동일한 에이전트 작업을 중복으로 트리거할 수 있는 잠재적 경쟁 상태의 엣지 케이스가 있습니다.
- **빈(Empty) 그래프의 실행**: 노드 구성이 전혀 없는 워크플로우를 생성하고 실행을 요청했을 때, 엔진 내에서 곧바로 `done` 상태로 종결 처리되기는 하나, 유의미한 작업 없이 더미 실행 이력만 무의미하게 누적될 여지가 있습니다. 

## TODO
- [ ] `api/app/main.py`의 CORS `allow_origin_regex` 규칙을 수정하여 `manbalboy.com`의 모든 서브도메인 및 모든 포트에 대해 접근이 허용되도록 정규식 보강.
- [ ] `api/app/services/workspace.py` 내 `write_artifact` 함수에서 `node_id` 파라미터의 특수문자 및 `../` 문자를 필터링하거나 안전하게 변환하는 Path Sanitization 로직 추가.
- [ ] 동일 `run_id` 폴링 조회 시 발생하는 상태 업데이트 Race Condition 방지를 위해 DB Lock(`with_for_update`) 또는 명시적인 워커 상태 전이 큐(Queue) 구조로 개선.
- [ ] 단순 시간 연산 Mock 로직에 머물러 있는 `AgentRunner`를 실제 CLI 스크립트 기반 Subprocess 실행 호출 구조로 교체 및 예외 핸들링 추가.
- [ ] Workflow 생성 Pydantic 스키마 검증 시, 노드 개수(최소 1개 이상) 및 그래프 내 사이클 여부를 검사하는 유효성 검증(Validation) 로직 및 백엔드 테스트 코드 작성.
- [ ] React UI (특히 `WorkflowBuilder.tsx`) 컴포넌트에 대한 렌더링 및 상태 변경 검증용 프론트엔드 유닛 테스트(Jest/RTL) 셋업 및 작성.
