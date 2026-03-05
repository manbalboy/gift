# REVIEW

## Functional bugs
- **동시성 처리 미흡으로 인한 중복 스케줄링**: 동일한 워크플로우에 대해 다수의 사용자가 동시에 `resume_run` API를 호출할 경우, 엔진 내부의 락(Lock) 체계가 불완전하여 동일 노드가 중복으로 스케줄링되거나 여러 개의 실행 스레드가 생성되는 문제가 발생할 수 있습니다.

## Security concerns
- **스푸핑 방어 포트의 하드코딩**: `_enforce_localhost_spoof_guard`에서 사용하는 보안 로직의 포트 대역이 소스 코드에 하드코딩되어 있습니다. 운영 환경이나 인프라 변경 시(예: 실행 포트를 3100 등으로 변경) 동적 대응이 불가하며, 보안 정책을 환경 변수(`settings.spoof_guard_ports`)로 주입받아 유연성과 안정성을 높여야 합니다.

## Missing tests / weak test coverage
- **`timeout_override` 단위 테스트 부족**: 노드 단위 타임아웃 오버라이드가 적용되거나 적용되지 않았을 때, 워크플로우 엔진의 동작 및 스케줄링 차이를 검증하는 구체적인 백엔드 단위 테스트가 누락되어 있습니다.
- **동시성 제어 및 트랜잭션 통합 테스트 부재**: 락(Lock) 구현 시 정상적으로 1개의 스레드만 동작하는지 검증하기 위한 통합 테스트가 없습니다. 다중 요청에 대비한 테스트 보강이 요구됩니다.

## Edge cases
- **장기 방치된 런타임의 만료 아티팩트 재개 크래시**: 워크플로우가 수일 동안 `paused` 상태로 방치되어 임시 저장소 데이터나 필수 아티팩트가 만료 및 유실되었을 때 재개(Resume)를 시도하면, 엔진 셧다운이나 시스템 크래시가 발생할 수 있습니다. 데이터 유효성을 검사하여 안전하게 `failed` 상태로 전이시키는 Graceful Failure 처리가 필수적입니다.
- **데드락(Deadlock) 및 단일 재개 블로킹**: 중복 스케줄링을 막기 위해 락킹을 잘못 구현할 경우, 오히려 정상적인 단일 재개 요청조차 영구적으로 블로킹되거나 전체 스레드가 멈추는 엣지 케이스가 발생할 수 있습니다.

## TODO
- [ ] `api/app/services/workflow_engine.py`, `api/app/api/workflows.py` 내 `resume` 동작 시 락(Lock) 체계를 재검토하고 멱등성을 보장하도록 로직 수정
- [ ] `api/app/core/config.py`, `api/app/api/dependencies.py`를 수정하여 `_enforce_localhost_spoof_guard`의 검증 대역을 설정 파일에서 주입받도록 리팩토링
- [ ] 수일간 방치된 `paused` 워크플로우를 재개할 때 필드 데이터가 유실되었으면, 예외 처리 후 상태를 `failed`로 안전하게 변경하는 Graceful Failure 로직 추가
- [ ] `api/tests/test_workflow_engine.py`에 `timeout_override` 적용 유무에 따른 명시적인 단위 테스트(Unit Test) 작성
- [ ] 파이썬 `concurrent.futures` 등을 활용해 `POST /runs/{run_id}/resume` API(예: `http://localhost:3100/runs/{run_id}/resume` 등 3100번대 포트 환경)로 동시 요청을 보내어 중복 실행 방지를 증명하는 통합 테스트 추가
