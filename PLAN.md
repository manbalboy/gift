```markdown
# PLAN

## 1. Task breakdown with priority

### 우선순위: P0 (보안 및 핵심 안정성 확보)
- **Task 1: 스크립트 실행 환경 샌드박싱 (`DockerRunner` 도입)**
  - `api/app/services/agent_runner.py` 내 기존 `HostRunner` 실행 방식을 추상화하고, `DockerRunner` 클래스를 신규 구현 (Phase 1).
  - `docker run --rm`을 활용해 임시 컨테이너 내부에서 스크립트를 실행하고, 외부 네트워크 접근 차단 및 워크스페이스 권한 마운트 적용.
- **Task 2: 실시간 상태 스트리밍(SSE) 스트림 제어 단위 테스트 작성**
  - `api/tests/test_workflow_api.py` (또는 신규 파일) 내에 `/workflows/{workflow_id}/runs/stream` 엔드포인트에 대한 비동기 연결 생성/종료 및 클라이언트 연결 끊김(Disconnect) 시나리오 검증 테스트 추가.

### 우선순위: P1 (다중 환경 대응 및 동시성 제어)
- **Task 3: Redis 기반 분산 락 (`LockProvider`) 도입**
  - `api/app/services/workflow_engine.py` 내 `threading.Lock`을 대체할 수 있는 `LockProvider` 인터페이스 생성.
  - Redis 클라이언트를 활용해 TTL 기반 분산 락 획득/해제/연장 기능을 포함한 `RedisLock` 구현.
- **Task 4: 개발 및 테스트 환경 포트 규격 업데이트**
  - 가이드 문서(README 등)의 Preview 및 테스트용 로컬 실행 포트 안내를 보안 규칙에 따라 3100번대로 일괄 점검 및 수정. (예: `3100-3199` 포트 대역 활용)
- **Task 5: 마일스톤 티켓/이슈 생성**
  - 기획 문서(`docs/security/container-sandbox-plan.md`, `docs/architecture/redis-distributed-lock-plan.md`) 기반의 상세 구현 이슈를 생성하여 작업 이력 트래킹.

### 추가 고도화 기능 (인접 기능)
- **Task 6: Redis 장애 대비 `LocalLock` 폴백(Fallback) 기능 추가**
  - **근거:** Redis 인스턴스 장애 시 파이프라인 전체가 중단되는(Single Point of Failure) 치명적 문제를 방지하기 위함.
  - **구현 경계:** Redis 연결 예외(`Timeout`, `ConnectionError`) 발생 시 일시적으로 메모리 기반의 `LocalLock`으로 우회하고, 로그 시스템에 에러 경고를 남기도록 `LockProvider` 팩토리 메서드 레벨에서 처리.
- **Task 7: `DockerRunner` 강제 종료 및 타임아웃 리소스 회수 로직 보완**
  - **근거:** 스크립트 실행이 무한 루프나 I/O 행(hang)에 빠질 경우 좀비 컨테이너가 발생하여 호스트 리소스를 고갈시키는 위험을 원천 차단하기 위함.
  - **구현 경계:** `subprocess` 타임아웃 발생 시 할당된 컨테이너 ID를 추적해 명시적으로 `docker rm -f <container_id>`를 호출하는 롤백 코드를 `try-finally` 구조에 적용.

## 2. MVP scope / out-of-scope

### MVP Scope (포함 대상)
- Python 기반 `subprocess`를 통한 단기 `docker run` 실행 및 표준 입출력 캡처 로직 (DockerRunner).
- Redis TTL 및 NX 옵션을 활용한 분산 락 적용과 다중 워커 환경에서의 중복 노드 실행 차단 로직.
- SSE 연결 상태 검증 및 네트워크 단절 시 예외 처리 단위 테스트 구현.
- 로컬 개발 포트(3100번대) 설정 가이드 변경 적용.

### Out-of-Scope (제외 대상)
- K8s, Nomad 등 도커(컨테이너) 오케스트레이션 도구를 활용한 파드/잡 단위 확장은 현재 MVP에서 제외.
- 자체 커스텀 컨테이너 이미지(Image Builder) 빌드 파이프라인 구축 로직 (현재는 기본 퍼블릭 이미지 활용 전제).
- Redis Cluster 환경까지 고려한 Redlock 알고리즘 복수 노드 구성 (현재는 단일 Redis 서버 인스턴스 기준 구현).

## 3. Completion criteria

- [ ] `AgentRunner`가 설정에 따라 `DockerRunner`로 인스턴스화되며, 외부 스크립트가 로컬 호스트가 아닌 격리된 컨테이너 환경 내에서 동작하는지 로그 및 결과로 증명.
- [ ] 다중 워커 프로세스 구동 환경에서 동일한 워크플로우를 동시 실행 트리거했을 때 중복 실행되지 않고 Redis 락을 통해 1개 워커만 단독으로 `refresh_run`을 점유하는지 검증.
- [ ] Redis 서버의 연결을 임의로 차단했을 때, 예외로 인해 엔진이 멈추지 않고 `LocalLock`으로 폴백되어 단일 워커 기준 실행이 정상 지속되는지 테스트 코드 또는 수동 데모로 확인.
- [ ] SSE 스트리밍 테스트 케이스(연결 유지, 클라이언트 해제 시 리소스 반환)가 CI/pytest를 통해 모두 PASS.
- [ ] 관련 README 및 실행 문서가 3100번대 포트를 기준으로 업데이트 됨.

## 4. Risks and test strategy

- **Risk:** `DockerRunner` 샌드박싱 도입 시 마운트 경로 권한(Permission Denied) 문제나 환경 변수 누락으로 기존 호스트 실행 방식 대비 일부 스크립트가 동작하지 않을 수 있음.
  - **Test Strategy:** 호스트 실행 대비 컨테이너 실행 간 동일 입출력 결과를 보장하는 회귀 테스트(Regression Test) 케이스(`test_docker_runner_execution`) 추가.
- **Risk:** Redis 락이 모종의 이유(비정상 프로세스 종료 등)로 해제되지 않아 데드락(Stuck) 현상 발생.
  - **Test Strategy:** Redis 락 획득 시 명시적 TTL 값을 강제 삽입하고, TTL 만료 후 다른 워커가 락을 안전하게 인계받는 시나리오를 Mocking 통합 테스트(`test_redis_lock_ttl_expiration_recovery`)로 검증.
- **Risk:** SSE 스트리밍 연결 해제가 제대로 탐지되지 않아 FastAPI 서버의 비동기 워커 누수(Memory Leak) 발생.
  - **Test Strategy:** FastAPI `TestClient`의 컨텍스트 매니저를 통해 강제 Disconnect(예: `CancelError`) 발생 시 리소스 회수 로직이 타는지 단위 테스트 보강.

## 5. Design intent and style direction

- **기획 의도:** 개발자가 복잡한 인프라 설정 없이도 샌드박스 환경에서 안전하게 AI 에이전트의 산출물을 검증하고, 여러 서버 워커에서도 안정적으로 구동되는 무결점 백엔드 자동화 경험을 제공.
- **디자인 풍:** 대시보드형 뷰 중심의 전문적이고 클린한 백오피스 스타일 (모던/미니멀 요소 반영).
- **시각 원칙:** 
  - 컬러: 터미널 로깅의 가독성을 중시하는 모노톤 베이스에 성공(Green), 대기(Amber), 에러(Red) 등의 명시적 포인트 컬러 적용.
  - 패딩/마진: 컴팩트한 리스트 뷰와 넓은 로그/코드 패널 영역을 명확히 구분하여 가독성 극대화.
  - 타이포: 코드 및 로그 텍스트 블록에는 Monospace 계열의 폰트를 강제하여 시각적 안정감 제공.
- **반응형 원칙:** 데스크탑 환경을 최우선으로 하나, 모바일 우선 규칙에 따라 단일 열(Single Column) 카드 스택 구조로 로그와 상태 카드가 깨짐 없이 출력되도록 대응.

## 6. Technology ruleset

- **플랫폼 분류:** web / api
  - **web:** React 프레임워크(Vite 기반)와 React Flow를 활용한 컴포넌트로 계획.
  - **api:** FastAPI 기반 백엔드로 계획 (Pydantic, 비동기 Redis 통신, Subprocess 기반 Docker 제어 로직 구현).
```
