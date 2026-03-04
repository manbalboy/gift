# Redis 기반 분산 락 구조화 계획 (MVP 이후 확장)

## 배경
- 현재 `WorkflowEngine`은 프로세스 내부 `threading.Lock`을 사용한다.
- Gunicorn 등 다중 프로세스 환경에서는 워커 간 락 공유가 불가능해 동일 run 동시 실행 위험이 있다.

## 목표
- `run_id` 단위 분산 락으로 중복 실행을 방지한다.
- 락 손실/워커 종료 상황에서도 자동 복구 가능한 TTL 기반 전략을 사용한다.

## 제안 구조
- 키 규칙: `devflow:run-lock:{run_id}`
- 획득: `SET key value NX PX <ttl_ms>`
- 연장(heartbeat): 실행 중 주기적으로 `PEXPIRE`
- 해제: Lua 스크립트로 owner token 일치 시에만 `DEL`

## 실패 처리
- 락 획득 실패 시 현재 워커는 `refresh_run`을 스킵하고 최신 DB 상태만 반환한다.
- TTL 만료로 락이 해제된 경우 다음 워커가 안전하게 인계받는다.
- Redis 장애 시 폴백 모드(읽기 전용 상태 갱신)로 전환하고 경고 로그를 남긴다.

## Redis 장애 시 LocalLock 한계와 충돌 방지 대책
- `LocalLock`은 프로세스 메모리 범위에서만 유효하므로 단일 인스턴스에서는 안전하지만, 다중 노드(서로 다른 서버/컨테이너)에서는 동일 `run_id`가 중복 실행될 수 있다.
- 따라서 Redis 장애 상태에서 멀티 노드 운영을 계속할 경우, API 레벨에서 `run refresh`를 강제 읽기 전용으로 내려 중복 실행을 방지해야 한다.
- 운영 대책:
  - `lock_backend=redis`에서 Redis 연결 실패가 일정 시간(예: 30초) 이상 지속되면 워크플로우 실행 API를 `503`으로 fail-close.
  - 장애 알림 규칙에 `redis lock degraded` 이벤트를 포함해 운영자가 즉시 인지하도록 구성.
  - 다중 노드 환경에서는 Redis HA(Sentinel/Cluster) 또는 대체 분산 락 저장소(etcd 등) 없이는 write 경로를 열지 않는다.

## 단계별 적용
1. Phase 1: `LockProvider` 인터페이스 추가(`LocalLock`, `RedisLock`).
2. Phase 2: `refresh_run` 경로에 `RedisLock` 적용, 메트릭(획득 실패율, 대기 시간) 수집.
3. Phase 3: 장애 복구 데몬(`recover_stuck_runs`)에도 동일 락 적용.

## 관측성
- 메트릭: lock_acquire_ms, lock_contention_count, stale_lock_recovery_count
- 로그: run_id, lock_owner, ttl_ms, release_result
