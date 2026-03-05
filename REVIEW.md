# REVIEW

## Functional bugs
- **파이프라인 상태 전환 오류**: `Analyzer` → `Evaluator` → `Planner` → `Executor` 단계로 이어지는 엔진 파이프라인에서 이전 단계의 결과가 지연될 경우 교착 상태(Deadlock)에 빠지거나 루프가 멈추는 문제가 발생할 수 있습니다.
- **SSE 로그 중복 렌더링**: 대시보드 연동 시 클라이언트 네트워크 단절 후 재연결 과정에서 Sequence ID 동기화가 이루어지지 않아, 동일한 로그가 UI에 중복으로 표출되는 결함이 있습니다.
- **Graceful Shutdown 실패**: 워크플로우 제어 API(`Pause`, `Stop`) 호출 시 현재 실행 중인 `Executor Engine`의 하위 스레드나 프로세스가 즉시 정리되지 않고 리소스를 점유하는 좀비 프로세스 이슈가 예상됩니다.

## Security concerns
- **CORS 및 접근 제어 미흡**: 제어 API에 대한 CORS 허용 origin(`manbalboy.com`, `localhost` 등) 검증이 누락될 경우, 악의적인 외부 사이트에서 루프 시작/정지 명령을 트리거할 수 있는 취약점이 있습니다. (재현 예시: `curl -X POST http://localhost:3100/api/inject -H "Origin: http://attacker.com"`)
- **XSS (Cross-Site Scripting) 취약점**: `Inject Instruction` API를 통해 전달되는 명령어에 악성 스크립트가 포함될 경우, 대시보드 로그 렌더링 과정에서 스크립트가 실행될 위험이 존재하므로 엄격한 입력값 살균(Sanitize) 처리가 필요합니다.

## Missing tests / weak test coverage
- **대용량 스트리밍 스트레스 테스트 부족**: `3100` 포트를 사용하는 로컬 환경에서 대규모 로그 스트리밍을 발생시켰을 때 메모리 한계점(Cap)을 방어하고 OOM(Out of Memory)을 예방하는 스트레스 테스트 스크립트가 부족합니다.
- **분산 락 장애 검증 부재**: 장기 실행(Long-Running) 과정에서 Redis 네트워크 파티션 단절이나 분산 락 획득 타임아웃이 발생했을 때의 Fallback 동작을 검증하는 통합 테스트(Integration Test)가 누락되어 있습니다.
- **Safe Mode 전환 테스트**: 시스템 오류로 인해 평가된 품질 점수(Quality Score)가 비정상적으로 급락했을 때, 코드를 보호하기 위해 안전 모드로 전환되는지 확인하는 단위 테스트가 필요합니다.

## Edge cases
- **무한 반복 및 예산 소모**: AI가 동일한 수정을 반복(Duplicate change detection 실패)하여 `max_loop_count`에 도달하기 전에 예산(`budget_limit`)을 모두 소진하고 루프가 무의미하게 도는 케이스.
- **DB 커넥션 풀 고갈**: 며칠 이상 지속되는 실행 루프 환경에서 데이터베이스 커넥션이 정상적으로 반환되지 않아 발생하는 커넥션 누수 및 타임아웃 상황.
- **재부팅 시 상태 복구 실패**: 시스템이 `Pause` 상태이거나 작업 도중 강제 종료된 후 재시작될 때, Memory 시스템에 저장된 이전 상태를 읽어와 정상적으로 `Resume`하지 못하는 경우.

---

## TODO
- [ ] 루프 엔진 파이프라인 간 교착 상태(Deadlock) 방지 및 상태 전이 로직 보강
- [ ] 클라이언트 통신 단절에 대비한 SSE Sequence ID 동기화 및 중복 렌더링 차단 구현
- [ ] `Pause`, `Stop` 제어 API 호출 시 백그라운드 프로세스의 Graceful Shutdown 로직 추가
- [ ] API 접근 권한 강화를 위한 RBAC 미들웨어 및 CORS origin 필터링 적용
- [ ] 대시보드 렌더링 전 `Inject Instruction` 입력값 및 로그 텍스트 XSS 살균(`sanitizeAlertText`) 처리
- [ ] 포트 `3100`을 타겟으로 하는 대용량 로그 스트리밍 Stress Test 스크립트 작성 및 OOM 검증
- [ ] Redis 분산 락 획득 실패 및 타임아웃 시나리오 모사 통합 테스트(Integration Test) 구축
- [ ] 품질 점수 급락 시 Safe Mode 전환을 검증하는 단위 테스트(Unit Test) 작성
- [ ] 중복 수정 방지 로직(Duplicate change detection) 강화 및 무한 루프 차단 기능 구현
- [ ] 장기 실행 대비 DB Connection Pool 타임아웃 및 반환 누수 방지 로직 최적화
