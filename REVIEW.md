# REVIEW

## Functional bugs
- 현재 테스트 파이프라인에서 명시적으로 실패하는 단위 기능 결함은 발견되지 않았으나, 호스트 환경에 Docker 데몬이 실행 중이지 않거나 애플리케이션에 접근 권한이 없는 경우(예: 사용자가 `docker` 그룹에 속하지 않음), `DockerRunner` 초기화 과정에서 내부 `subprocess` 예외가 발생하며 워크플로우 태스크가 그대로 멈추거나 실패 상태로 고착될 수 있는 취약한 예외 처리 구간이 존재합니다.

## Security concerns
- **워크스페이스 격리 붕괴 (심각):** `DockerRunner`의 볼륨 마운트 설정을 보면 `f"{self.workspaces_root}:/workspace/workspaces:rw"` 형태로 전체 프로젝트 워크스페이스의 루트 경로를 컨테이너 내부에 읽기/쓰기 모드로 통째로 마운트하고 있습니다. 이로 인해 악의적이거나 버그가 있는 에이전트 스크립트가 자신이 속한 실행 단위(Run)의 경로를 벗어나 다른 사용자의 프로젝트나 민감한 코드를 탈취하고 변조할 수 있는 심각한 디렉터리 트래버설(Directory Traversal) 및 권한 상승 위험이 있습니다.
- `HostRunner` 클래스가 `agent_runner.py`에 여전히 남아있어, 시스템 환경 설정(`settings`)의 오입력으로 인해 샌드박싱 환경인 `DockerRunner` 대신 `HostRunner`가 활성화될 경우 호스트 머신의 리소스가 스크립트 실행에 무방비로 노출될 위험이 존재합니다.

## Missing tests / weak test coverage
- **Docker 격리 환경 E2E 테스트 부재:** 기존 29개의 단위 테스트(Unit Test)는 모두 정상 통과되었으나, 실제 Docker 컨테이너를 스폰하여 권한 제어(`--cap-drop ALL`, `--user 65534:65534`)가 완벽하게 적용되었는지, 그리고 프로세스 타임아웃 시 좀비 컨테이너 없이 `docker rm -f` 롤백이 완수되는지 검증하는 E2E 회귀 테스트(`test_docker_runner_execution`)가 구현되어 있지 않습니다.
- **Redis TTL 만료 시나리오 누락:** Redis를 이용한 분산 락 모듈(`LockProvider`)은 도입되었으나, 임의의 워커 프로세스가 비정상 종료되어 락을 해제하지 못한 상황에서 TTL이 강제 만료되었을 때, 다른 워커가 락을 획득하고 이어서 워크플로우를 진행할 수 있는지 증명하는 모킹(Mocking) 기반의 복구 통합 테스트(`test_redis_lock_ttl_expiration_recovery`)가 빠져 있습니다.

## Edge cases
- **다중 워커 LocalLock 폴백(Fallback) 모순:** Redis 서버 네트워크 단절 등 예외 발생 시 `LocalLock`으로 우회하여 단일 워커의 생존성을 보장하도록 설계되었으나, 다수의 별개 서버(워커)들이 동시에 동작 중일 때 Redis가 다운되면 각 워커가 독립적인 로컬 메모리 락을 가지게 되므로 중복 실행(Race Condition)을 차단하지 못하는 동시성 제어 한계점이 발생합니다.
- **스트리밍 클라이언트 재연결 폭주:** 클라이언트가 `Disconnect` 했을 때 자원을 회수하는 기능은 테스트로 검증되었으나, 프론트엔드(포트 3100)나 서드파티 클라이언트 측 네트워크 오류로 인해 SSE 스트림 재연결이 비정상적으로 폭주(Reconnection Storm)할 경우 이를 방어하는 타임아웃 또는 연결 수 제한(Rate Limiting) 장치가 없습니다.

## TODO checklist
- [x] `DockerRunner`의 마운트 경로를 전체 워크스페이스 루트가 아닌, 개별 태스크에 할당된 샌드박스 전용 하위 디렉터리로 엄격하게 제한 (`-v {task_specific_dir}:/workspace/workspaces:rw`).
- [x] 실제 Docker 데몬 환경 위에서 컨테이너 스폰, 스크립트 실행 격리, 타임아웃 롤백을 검증하는 Integration Test Code 추가.
- [x] Redis 다운 시 `LocalLock`으로 폴백되는 상황에서, 단일 인스턴스가 아닌 다중 노드 아키텍처일 경우 발생할 수 있는 동시성 락 충돌 방지 대책 아키텍처 설계 문서에 반영.
- [x] `HostRunner`의 접근 경로를 차단하거나 오직 로컬 개발 전용 환경 변수를 켰을 때만 명시적으로 사용할 수 있도록 방어 코드 추가.
- [x] 실행 오류 방지를 위해 시작 시점에 Docker 데몬 핑(Ping) 테스트를 수행하는 헬스체크 로직을 API 시작 라이프사이클에 추가.
