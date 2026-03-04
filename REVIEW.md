# REVIEW

## Functional bugs

- **실제 Agent 커맨드 실행 누락**: `api/app/services/workflow_engine.py`의 `WorkflowEngine.refresh_run` 메서드에서 노드를 실행할 때 `AgentTaskRequest`의 `payload`에 `{"run_id": run_id}`만 전달하고 있습니다. `WorkflowDefinition`이나 노드의 데이터에서 실제 실행할 `command`를 추출하여 넘기는 로직이 누락되어 있어, 현재 `AgentRunner`가 항상 기본 폴백 로직인 `echo` 명령어만 실행하는 치명적인 버그가 존재합니다.
- **상태 보상 로직의 트랜잭션 롤백 위험**: `recover_stuck_runs` 메서드에서 장기간 중단된 노드들을 복구할 때 `db.commit()`을 모든 노드 변경을 마친 후 반복문 외부에서 단 한 번만 호출합니다. 복구 대상이 많을 경우 일부 데이터 업데이트 도중 예상치 못한 에러가 발생하면 전체 보상 작업이 롤백되어 장기 체류 노드가 시스템에 계속 방치될 수 있습니다.

## Security concerns

- **샌드박싱 없는 임시 스크립트 실행 (RCE 위험)**: `api/app/services/agent_runner.py`의 `AgentRunner.run`에서 사용자가(또는 외부 플랫폼이) 요청한 `command`를 별도의 검증이나 격리 없이 `.sh` 파일로 만들어 호스트의 `bash`로 직접 실행하고 있습니다. Agent가 악의적인 코드를 작성하거나 외부 공격자가 명령어를 주입할 경우 시스템 전체가 장악될 수 있는 심각한 원격 코드 실행(RCE) 위험이 존재하므로, 최소한 컨테이너(Docker) 기반의 샌드박스 환경 도입이 시급합니다.
- **CORS 하위 도메인 전체 허용의 잠재적 위험**: `api/app/main.py`에 선언된 정규식 `(?:[A-Za-z0-9-]+\.)*manbalboy\.com`은 카타스트로픽 백트래킹의 위험은 없으나, 해당 도메인의 모든 서브도메인을 일괄 허용합니다. 만약 다른 용도로 사용되는 서브도메인(예: 보안이 취약한 블로그나 테스트 서버)이 탈취될 경우, Agent Hub의 API로 악의적인 교차 출처 요청을 보낼 수 있는 취약점이 될 수 있습니다.

## Missing tests / weak test coverage

- **AgentRunner 시스템 예외 처리 테스트 누락**: `AgentRunner.run` 내에서 임시 파일을 실행하기 위한 `subprocess.Popen` 호출 중 시스템 레벨의 에러(권한 부족, 파일 I/O 실패 등)가 발생할 경우를 대비한 `except Exception as exc:` 블록이 존재하나, 해당 코드에 `# pragma: no cover` 처리가 되어있고 이를 시뮬레이션하는 단위 테스트가 누락되어 있습니다.
- **프론트엔드 UI 및 상태 동기화 테스트 부족**: `web/` 애플리케이션의 `WorkflowBuilder.tsx` 파일에 대해 React Flow의 노드 및 엣지 변경 이벤트 처리, 비동기 상태 갱신, 그리고 잘못된 그래프 연결 시의 사용자 피드백을 단언(Assert)하는 UI 통합 테스트가 현저히 부족합니다.
- **WorkspaceService 엣지 케이스 단위 테스트 부재**: 산출물(`.md`)을 저장하는 `write_artifact` 수행 과정에서 발생할 수 있는 권한 부족, 디스크 용량 초과, 비정상적인 디렉토리 생성 실패 등의 엣지 케이스를 다루는 단위 테스트가 누락되어 있습니다.

## Edge cases

- **다중 프로세스(Gunicorn 등) 환경에서의 DB Lock 경합**: 동시성 제어가 단일 프로세스 전용인 `threading.Lock`에 의존하고 있어, 향후 스케일아웃을 위해 여러 워커 프로세스를 띄울 경우 `with_for_update()` 과정에서 DB Row Lock 경합(Deadlock) 및 타임아웃이 빈번하게 발생하여 `refresh_run` 시 심각한 병목 현상이 발생할 수 있습니다 (MVP 범위 외의 사항이나 구조적 엣지 케이스에 해당).
- **타임아웃과 엮인 좀비 프로세스 대기**: `os.killpg`를 사용해 타임아웃된 프로세스 그룹을 종료하고 있으나, 워커 스크립트가 세션 리더(setsid) 권한을 임의로 우회하거나 분리된 데몬 백그라운드 프로세스를 생성하는 악의적인/특수한 스크립트일 경우, 프로세스가 종료되지 않고 `communicate()`에서 무한정 대기 상태에 빠질 수 있는 엣지 케이스가 존재합니다.

## TODO

- [ ] `WorkflowEngine.refresh_run` 로직 수정: 워크플로우 정의(그래프 노드 속성 등)에서 실제 `command`를 파싱하여 `AgentTaskRequest`의 `payload`로 온전히 전달하도록 구현.
- [ ] 보상 데몬(`recover_stuck_runs`)의 트랜잭션 스코프 수정: 노드 하나가 실패하더라도 다른 노드의 복구가 롤백되지 않도록 개별 단위 혹은 청크(Chunk) 단위로 `db.commit()`을 수행하도록 변경.
- [ ] 실행 워커 격리 방안 기획(보안): RCE를 방지하기 위해 임시 스크립트를 호스트가 아닌 격리된 컨테이너 환경에서 실행하도록 아키텍처 재검토.
- [ ] `AgentRunner.run` 예외 발생 브랜치에 대한 Mocking 테스트 코드(`api/tests/`) 추가 작성.
- [ ] `web/` 디렉토리 내 `WorkflowBuilder.tsx`에 대하여 React Flow 캔버스 조작, 모바일 뷰포트 상태 전환 등 주요 사용자 시나리오를 포괄하는 Jest/Testing Library 기반 테스트 코드 확충 (포트 3100 기반 환경 호환성 검증 포함).
- [ ] 다중 프로세스 확장 시나리오를 대비한 Redis 기반 분산 락 처리 로직 검토 및 구조화 계획 수립.
