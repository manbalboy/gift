# REVIEW

## Functional bugs
- **워커 강제 종료 시 상태 보상 로직 부재**: 에이전트 프로세스가 도는 도중 백엔드 API 서버(Uvicorn/Gunicorn) 자체가 OOM이나 강제 재시작으로 비정상 종료될 경우, DB에 해당 노드가 영원히 `running` 상태로 남게 됩니다. PLAN.md의 P2에 명시된 "상태 보상 트랜잭션 및 추적 로직"이 구현되어 있지 않아 후속 워크플로우 진행이 불가해지는 치명적 버그가 존재합니다.
- **CORS 설정과 SPEC 간 포트 대역 불일치**: SPEC.md 요구사항에 따르면 Preview 외부 노출 포트는 `7000-7099` 대역을 사용해야 합니다. 하지만 현재 `api/app/main.py`의 `allow_origin_regex`는 3100번대(`:31\d\d`) 포트를 허용하고 있습니다. (예시: 악의적이지 않은 `http://localhost:3100` 테스트 환경은 통과되지만, 배포 시 실제 7000번대 접근은 막힐 위험이 있습니다.)

## Security concerns
- **안전한 Path Traversal 방어 및 자원 회수 (양호)**: `WorkspaceService`의 `_resolve_under_root` 메서드를 통한 경로 검증과, 프로세스 타임아웃 발생 시 `os.killpg`를 사용해 서브프로세스 그룹 전체를 정리하는 로직은 우수하게 작성되었습니다. 시스템 리소스 고갈 공격(DoS) 및 디렉토리 이탈 공격이 잘 방어되고 있습니다.
- **CORS 정규식 복잡도 이슈**: `(([a-zA-Z0-9-]+\.)*manbalboy\.com)` 구조의 정규표현식은 현재 정상 작동하지만 다소 유연하여 정규식 취약점(ReDoS)이나 유사 도메인 우회 우려가 존재합니다. 더 엄격한 도메인 경계 매칭으로 강화할 필요가 있습니다.

## Missing tests / weak test coverage
- **상태 복구(Compensation) 테스트 누락**: 기능이 미구현됨에 따라 워커 서버의 재시작 시 `running` 상태의 노드가 어떻게 `failed` 또는 재시도 상태로 복원되는지를 단언(Assert)하는 테스트 코드도 존재하지 않습니다. 
- **DB 로우 락 타임아웃 예외 테스트 부족**: `with_for_update()`로 대기하는 동안 DB 연결 지연이나 데드락이 발생할 경우, FastAPI 요청이 Timeout 되는 엣지 케이스에 대한 대응/검증 테스트가 보완되어야 합니다.
- (참고: 기존 요구되었던 동시성 병렬 락 방어, 순환 참조 차단, 프론트엔드 ReactFlow 렌더링에 대한 기초 유닛 테스트는 훌륭하게 작성 및 통과되고 있습니다.)

## Edge cases
- **다중 스케일아웃 환경에서의 메모리 락 한계**: 현재 `WorkflowEngine` 내 `_run_locks`를 `threading.Lock`으로 관리하고 있어 단일 프로세스의 스레드 간 동시성만 커버합니다. 향후 컨테이너나 워커 프로세스가 여러 개 띄워질 경우, 메모리 락이 프로세스별로 나뉘어 DB Row Lock으로 병목이 직접 전가될 수 있습니다.
- **운영체제 인수 길이 제한 (Argument list too long)**: `AgentTaskRequest`의 `payload`를 통해 매우 긴 텍스트 기반의 프롬프트나 코드가 `command`로 넘어올 경우, `bash -lc` 호출 시 OS 제약을 초과해 프로세스 자체가 생성되지 않고 실패할 여지가 있습니다. 

<br/>

## TODO

- [ ] 서버 재시작 및 OOM 등에 대비하여 장기 `running` 노드를 `failed`로 일괄 복원(Compensation)하는 초기화 스크립트 혹은 데몬 추가
- [ ] `api/app/main.py`의 CORS 허용 정규식을 수정하여 SPEC 문서대로 7000~7099 대역 포트를 올바르게 허용하도록 반영
- [ ] 타임아웃으로 인한 강제 복구(Compensation) 처리가 정상적으로 이루어지는지 확인하는 Pytest 보완
- [ ] 다중 프로세스(Gunicorn) 환경으로의 확장을 대비해 `threading.Lock`을 Redis 기반 분산 락 등으로 고도화하는 방안 검토
- [ ] 에이전트 명령어(커맨드)의 길이가 길어질 경우를 대비해 스크립트를 `.sh` 임시 파일로 저장한 후 실행하는 방식으로 워커 실행부 구조 개선
