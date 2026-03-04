# 보안/안정성 마일스톤 이슈 트래킹

본 문서는 `REVIEW.md` TODO와 `PLAN.md` P0/P1 항목을 구현 단위 이슈로 쪼개어 추적하기 위한 내부 티켓 보드입니다.

## Milestone: Sandbox and Distributed Lock MVP

### Issue 1
- 제목: `AgentRunner` 실행기 분리 및 `DockerRunner` 샌드박싱 도입 (Phase 1)
- 범위:
  - `HostRunner`/`DockerRunner` 선택형 구조
  - `docker run --rm`, `--network none`, `--cap-drop ALL`, `--security-opt no-new-privileges`
  - timeout 시 `docker rm -f` 강제 회수
- 완료 기준:
  - 설정 기반 실행기 선택 가능
  - Docker 경로 단위 테스트 통과

### Issue 2
- 제목: `WorkflowEngine` 분산 락 인터페이스(`LockProvider`) 및 Redis 락 적용
- 범위:
  - `LocalLockProvider` + `RedisLockProvider`
  - TTL/NX 기반 획득, owner token 기반 해제, TTL 연장 API
  - Redis 실패 시 `LocalLock` 폴백 및 경고 로그
- 완료 기준:
  - `refresh_run` 경로에서 `LockProvider` 사용
  - TTL 만료 인계/폴백 테스트 통과

### Issue 3
- 제목: SSE 스트림 연결/종료/Disconnect 테스트 보강
- 범위:
  - `/workflows/{workflow_id}/runs/stream` 연결 유지 검증
  - 클라이언트 조기 종료 시 서버 연결 카운터 회수 검증
- 완료 기준:
  - SSE 관련 테스트 CI PASS

### Issue 4
- 제목: 로컬/Preview 포트 정책 3100번대 정합성 점검
- 범위:
  - CORS 정규식 및 허용 Origin을 `31xx` 대역으로 제한
  - README/SPEC/PR 문서 포트 표기 일괄 정정
- 완료 기준:
  - 31xx 허용 테스트 PASS
  - 문서 내 70xx 표기 제거
