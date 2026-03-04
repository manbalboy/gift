# REVIEW

본 리뷰는 `SPEC.md`와 `PLAN.md`에 명시된 요구사항을 바탕으로 현재 저장소 상태를 분석한 결과입니다.

## Functional bugs
- 현재 주요 기능 버그는 발견되지 않았습니다. 
  - `WorkflowEngine.refresh_run` 내 노드 실행 커맨드 파싱(`_extract_node_command`)이 정상적으로 반영되어, 폴백이 아닌 실제 `command`가 `AgentTaskRequest`에 제대로 전달되고 있습니다.
  - `WorkflowEngine.recover_stuck_runs` 데몬에서 트랜잭션 롤백 스코프 개선(반복문 내 개별 `db.commit()` 수행 및 예외 처리)이 성공적으로 반영되어, 단일 노드 복구 실패가 다른 노드의 상태 갱신에 영향을 주지 않습니다.
- 프론트엔드 React Flow(Visual Builder) 테스트 역시 정상적으로 통과하여 기능상 결함은 발견되지 않았습니다.
- 추가 고도화 플랜이었던 상태 실시간 스트리밍(SSE) 엔드포인트 `/workflows/{workflow_id}/runs/stream` 역시 구현되어 작동 준비가 완료되었습니다.

## Security concerns
- `AgentRunner`가 `subprocess.Popen`을 사용해 호스트 환경에서 직접 셸 스크립트를 실행하고 있어 원격 코드 실행(RCE)에 대한 근본적인 위험이 남아 있습니다.
- `docs/security/container-sandbox-plan.md`를 통해 컨테이너 기반 샌드박싱 도입 계획이 문서화되어 있으나, 코드로 적용되지 않은 상태입니다. 향후 운영 환경으로의 배포를 고려할 때 Docker를 활용한 스크립트 실행 격리가 필수적입니다.
- Preview 환경이나 로컬 환경 설정 시 외부 노출 포트 및 CORS 규칙은 보안 통제가 필요합니다. 특히 로컬 테스트 실행 및 재현 예시 등에서는 3100번대 포트로 엄격히 관리해야 합니다.

## Missing tests / weak test coverage
- 백엔드 `AgentRunner.run` 실행 시 발생할 수 있는 권한 부족 및 시스템 예외(`PermissionError` 등) 브랜치에 대한 Mocking 테스트 코드(`test_agent_runner_handles_system_exception`)가 성공적으로 확보되어 있습니다.
- 트랜잭션 롤백 방지를 검증하는 복구 데몬 통합 테스트(`test_compensation_commit_scope_isolated_per_node`)가 구현되어 백엔드 커버리지는 양호합니다.
- 프론트엔드 `WorkflowBuilder.tsx`에 대한 주요 캔버스 조작 시나리오(엣지 연결, 상태 뱃지 렌더링, 모바일 뷰 전환 등) 테스트 4건이 통과하는 것을 확인했습니다.
- **향후 보완 필요성**: SSE 스트리밍 엔드포인트(`stream_workflow_runs`)의 비동기 연결에 대한 테스트 코드가 누락되어 있습니다. 향후 Redis 분산 락 로직이 구현될 때 다중 워커의 락 경합 시나리오에 대한 통합 테스트 보강이 필요합니다.

## Edge cases
- 현재 `WorkflowEngine`의 락 구조가 `threading.Lock` 기반으로 작성되어 있어 단일 프로세스에서는 문제가 없으나, Gunicorn 등 다중 프로세스/다중 워커 환경 확장 시 중복 실행 및 교착 상태가 발생할 수 있는 엣지 케이스가 존재합니다. (`docs/architecture/redis-distributed-lock-plan.md` 계획 문서 기반으로 향후 보완 필요)
- DB Lock(`with_for_update()`) 사용 시 Lock Timeout이 발생하는 경우 롤백 처리 후 세션을 정상화하는 기본 예외 처리는 되어 있으나, 트래픽 급증 시의 Lock 경합 해소를 위한 재시도 지연(Backoff) 전략 최적화가 요구됩니다.
- SSE 연결 중 클라이언트의 네트워크 단절이나 비정상 종료 시 서버 자원이 안전하게 회수되는지에 대한 명시적인 검증 절차가 요구됩니다.

## TODO
- [ ] `AgentRunner`에 `DockerRunner` 구조를 도입하여 임시 스크립트 실행 환경 샌드박싱 (Phase 1 적용)
- [ ] 다중 워커 확장을 대비하여 Redis 기반 분산 락(`LockProvider`)을 `WorkflowEngine` 로직에 반영
- [ ] 실시간 상태 스트리밍(SSE) API 엔드포인트에 대한 스트림 연결/종료 단위 테스트 작성
- [ ] 개발 및 로컬 테스트 환경 문서의 포트 안내를 3100번대 규격으로 일괄 점검 및 업데이트
- [ ] `docs/security/container-sandbox-plan.md` 및 `docs/architecture/redis-distributed-lock-plan.md` 기획안에 맞춘 마일스톤 티켓/이슈 생성
