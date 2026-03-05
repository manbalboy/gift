# REVIEW

## Functional bugs
- **OS Lock 예외 로깅 및 방어 로직 누락**: `PLAN.md`에 명시된 `api/app/services/workspace.py` 내 파일 읽기/쓰기 시 OS Lock 획득 경합에 대비한 방어 로직 및 예외 발생 시의 구조화된 에러 로깅(`logging.error`) 기능이 구현되어 있지 않습니다. 이로 인해 동시성 제어 중 발생하는 시스템 레벨의 파일 경합이나 권한 이슈를 감사(Audit)하거나 추적하는 데 제약이 있습니다.

## Security concerns
- **환경 변수 파싱 Fallback 로깅**: `api/app/core/config.py`에 적용된 환경 변수(예: `DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS`) 파싱 방어 로직과 안전한 기본값 반환(Fallback) 기능은 훌륭하게 적용되었습니다. 다만, 의도적으로 악의적이거나 기형적인 설정값이 주입되어 Fallback이 발동했을 경우, 이를 인지할 수 있는 시스템 레벨의 경고 로그가 없어 보안 감사 측면에서 보완이 필요합니다.

## Missing tests / weak test coverage
- **모듈 레벨 OS Lock 경합 단위 테스트 부족**: `api/tests/test_workflow_api.py` 내 통합/E2E 테스트(`test_resume_run_fails_gracefully_when_workspace_permission_error`)를 통해 워크플로우 엔진이 권한 에러 시 프로세스를 죽이지 않고 `failed` 상태로 안전하게 기록하는 것은 검증되었습니다. 그러나 `workspace.py` 내부의 구체적인 파일 핸들링 모듈 자체에서 OS Lock 획득 경합 시나리오를 Mocking하여 방어하는 모듈 단위의 테스트가 부족합니다.

## Edge cases
- **포트 3100번대 전면 고갈 시 실패 처리**: 프리뷰 포트 동적 할당을 위해 작성된 `web/scripts/check-port.mjs` 스크립트는 3100~3199 대역이 모두 사용 중일 경우 대기 로직 없이 즉시 에러(`process.exit(1)`)를 뱉고 종료됩니다. 다중 테스트가 병렬로 심하게 돌아가는 로컬/CI 환경에서는 일시적인 포트 고갈 엣지 케이스로 인해 파이프라인 전체가 바로 멈추는 불안정성을 야기할 수 있습니다. 짧은 간격의 재시도(Retry) 기법 도입이 권장됩니다.
- **노드 재시도 시 짧은 로그 툴팁 길이 제한**: ReactFlow 컴포넌트에 노출되는 `error_snippet` 툴팁이 매우 긴 한 줄의 에러 문자열로 반환될 경우 UI 캔버스를 뚫고 나가는 시각적 엣지 케이스가 존재할 수 있습니다. 

## TODO
- [ ] `api/app/services/workspace.py` 내부의 파일 I/O 및 핸들링 구문에 OS Lock 경합 예외 처리와 `logging.error`를 활용한 구조화된 로깅 추가.
- [ ] `api/tests/test_workspace_security.py` 파일 내에 `workspace.py`의 OS Lock 획득 경합 상황을 Mocking하여 검증하는 구체적인 단위 테스트 추가.
- [ ] `web/scripts/check-port.mjs`에서 3100번대 포트 점유 여부 확인 시, 모두 고갈되었을 때 즉시 종료하지 않고 약간의 지연(Sleep) 후 재시도하는 로직 보완.
- [ ] `api/app/core/config.py`의 파싱 실패 및 Fallback 발동 구간에 시스템 경고 로깅 연동 고려.
