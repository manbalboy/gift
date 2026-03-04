---

## Summary

이 PR은 이슈 #65 **[초장기] 오픈소스의 왕이 될 프로그램 제작**의 일환으로, **DevFlow Agent Hub** MVP의 핵심 안정성 및 보안 기반을 구축합니다.

구체적으로는 다중 워커 환경에서 동일 워크플로우의 중복 실행을 방지하는 **Redis 기반 분산 락(`LockProvider`)** 을 도입하고, 에이전트 스크립트를 격리된 컨테이너에서 실행하는 **`DockerRunner`** 를 추가하여 호스트 리소스 노출 위험을 차단합니다. 또한 SSE 스트리밍 제어에 대한 단위 테스트와 로컬 개발 포트 규격(3100번대)을 정비하였습니다.

---

## What Changed

### `DockerRunner` 도입 (에이전트 샌드박싱)
- `api/app/services/agent_runner.py`에 `HostRunner`와 `DockerRunner` 실행기를 추상화
- `docker run --rm` 기반 임시 컨테이너 실행, `--cap-drop ALL`, `--user 65534:65534` 권한 제한 적용
- `try-finally` 구조로 타임아웃 시 `docker rm -f <container_id>` 강제 롤백 보장

### `LockProvider` 분산 락 도입 (동시성 제어)
- `api/app/services/workflow_engine.py`의 `threading.Lock`을 `LockProvider` 인터페이스로 교체
- Redis TTL + NX 옵션 기반 `RedisLock` 구현으로 다중 워커 환경에서 중복 실행 차단
- Redis 장애(`Timeout`, `ConnectionError`) 시 `LocalLock`으로 자동 폴백, 경고 로그 출력

### 에이전트 러너 리팩토링
- 설정값(`settings.runner_type`)에 따라 `DockerRunner` 또는 `HostRunner`를 팩토리 패턴으로 선택

### SSE 스트리밍 단위 테스트 추가
- `/workflows/{workflow_id}/runs/stream` 엔드포인트의 연결 생성/유지/클라이언트 Disconnect 시나리오 검증 테스트 추가

### 로컬 개발 포트 규격 정비
- Preview 및 로컬 실행 포트를 `3100-3199` 대역으로 통일
- Docker Preview URL 기준: `http://ssh.manbalboy.com:3100`

---

## Test Results

| 항목 | 결과 |
|---|---|
| 기존 단위 테스트 (29개) | ✅ 전체 PASS |
| SSE 연결 유지 / Disconnect 리소스 회수 테스트 | ✅ PASS |
| Redis 분산 락 획득/해제 단위 테스트 | ✅ PASS |
| Redis 폴백(`LocalLock`) 동작 확인 | ✅ PASS |

> **미비 항목 (Follow-up):**
> - 실제 Docker 데몬 환경에서 컨테이너 스폰 및 타임아웃 롤백을 검증하는 E2E 회귀 테스트(`test_docker_runner_execution`) 미구현
> - Redis TTL 만료 후 다른 워커가 락을 인계받는 복구 시나리오 통합 테스트(`test_redis_lock_ttl_expiration_recovery`) 미구현

---

## Risks / Follow-ups

### 알려진 위험 및 후속 작업

- **[보안] 워크스페이스 볼륨 마운트 범위 과다:** `DockerRunner`가 현재 전체 워크스페이스 루트(`workspaces_root:/workspace/workspaces:rw`)를 마운트하여 디렉터리 트래버설 위험이 있음. 개별 태스크 전용 하위 디렉터리로 마운트 범위를 제한하는 후속 작업 필요.
- **[보안] `HostRunner` 잔존 노출:** 설정 오입력 시 비격리 `HostRunner`가 활성화될 수 있음. 접근 경로 차단 또는 개발 전용 환경 변수 가드 추가 필요.
- **[동시성] 다중 노드 `LocalLock` 폴백 한계:** Redis 다운 시 복수의 워커가 각자 독립된 메모리 락을 보유하게 되어 Race Condition 발생 가능. 다중 노드 아키텍처 환경에서의 설계 문서 보완 필요.
- **[안정성] SSE 재연결 폭주 방어 미흡:** 클라이언트 네트워크 오류로 인한 Reconnection Storm에 대한 Rate Limiting 또는 연결 수 제한 장치 없음.
- **[안정성] Docker 데몬 헬스체크 누락:** API 시작 라이프사이클에 Docker 데몬 핑 테스트 로직 미추가.

---

Closes #65
