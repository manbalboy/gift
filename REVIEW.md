# REVIEW

## Functional bugs
- **SSE 로그 스트리밍 중복 렌더링 누수**: 네트워크 단절 후 재연결 시 Sequence ID를 통한 정렬 및 중복 방지 로직이 불완전하여 동일한 로그가 대시보드에 여러 번 노출될 수 있는 결함이 예상됩니다.
- **Pause/Stop 제어 명령 지연**: `Long-Running Workflow` 환경에서 `Pause` 또는 `Stop` API를 호출했을 때, `Executor Engine`이 현재 실행 중인 무거운 작업(예: 대규모 코드 리팩토링)을 즉시 중단하지 못하고 상태 불일치를 일으킬 수 있습니다.
- **변경 사항 중복 감지(Duplicate Change Detection) 오류**: 코드 수정 전후의 미세한 공백이나 줄바꿈 차이를 새로운 로직 변경으로 오인하여, AI가 불필요한 개선 루프를 무한 반복하는 기능적 버그가 우려됩니다.

## Security concerns
- **비인가 지시사항 주입 (Inject Instruction)**: 시스템 운영 중 외부에서 `Inject Instruction` API를 호출할 때 RBAC(Role-Based Access Control) 토큰 검증이 누락될 경우, 악의적인 사용자가 시스템 아키텍처를 파괴하는 명령을 주입할 수 있습니다.
- **과도한 CORS 정책 허용**: 명세된 허용 origin(`https://manbalboy.com` 등) 이외의 도메인이나 와일드카드(`*`)가 설정되어 있다면 외부 공격자의 교차 출처 요청을 허용하게 될 보안 취약점이 존재합니다.
- **대시보드 XSS 취약점**: 프론트엔드에서 렌더링되는 로그나 상태 알림 메시지에 포함된 스크립트를 `sanitizeAlertText` 함수가 완벽히 필터링하지 못하면 XSS 공격에 노출될 위험이 있습니다.

## Missing tests / weak test coverage
- **Redis 락 장애 및 Fallback 검증 부족**: Redis 네트워크 파티션이나 락 획득 실패 시, 시스템이 데드락에 빠지지 않고 Graceful Degradation을 수행하는지 확인하는 통합 테스트(Integration Test) 커버리지가 미흡합니다.
- **대용량 로그 Burst 메모리 스트레스 테스트**: 다수의 워커가 동시에 엄청난 양의 로그를 쏟아낼 때 실시간 메모리 Cap 제한과 윈도잉 주기가 설계대로 작동하여 OOM(Out Of Memory)을 방어하는지 입증하는 E2E 테스트가 필요합니다.
- **엔진 간 상태 전이 모의(Mock) 테스트**: `Analyzer` → `Evaluator` → `Planner` → `Executor`로 이어지는 파이프라인 구간별 입출력 정합성을 검증하는 단위 테스트가 부족합니다.

## Edge cases
- **품질 점수(Quality Score) 급락 통제 불능**: 외부 패키지 업데이트나 일시적인 테스트 환경 오류로 `Evaluator`의 점수가 급락했을 때, `Planner`가 이를 복구하기 위해 정상적인 코드까지 광범위하게 삭제/수정해버리는 엣지 케이스가 존재합니다.
- **장기 실행(Long-Running) 데이터베이스 커넥션 고갈**: 루프가 며칠에서 몇 주간 24시간 가동되면서 Long-term Memory에 데이터를 지속적으로 적재할 때, DB 커넥션 풀이 반환되지 않아 시스템이 정지될 수 있습니다.
- **로컬 테스트 포트 충돌**: 로컬 환경에서 프리뷰 또는 테스트 서버를 띄울 때 기본 포트를 선점하고 있는 다른 프로세스가 있을 경우 충돌이 발생합니다. (실행/재현 예시: 로컬 부하 테스트 시 포트를 명시적으로 `3100`으로 할당하고, 별도의 로그 제너레이터를 `3101` 포트에서 실행하여 충돌을 회피해야 합니다.)

## TODO
- [ ] SSE 재연결 시 Sequence ID 비교 로직을 강화하여 브라우저 네트워크 단절 상황에서의 로그 중복 렌더링 버그 수정
- [ ] 루프 제어 API(`Pause`, `Stop`) 호출 시 현재 동작 중인 `Executor Engine`의 스레드/프로세스를 안전하게 종료하는 Graceful Shutdown 구현
- [ ] `Inject Instruction` 및 주요 제어 API 엔드포인트에 RBAC 권한 검증 미들웨어 맵핑
- [ ] 외부 접근을 제어하기 위해 서버의 CORS 허용 origin 목록을 SPEC.md 기준에 맞춰 엄격히 제한
- [ ] Redis 분산 락 타임아웃 및 서버 단절 시나리오를 모사하는 Integration Test 케이스 추가
- [ ] 품질 점수(Quality Score)가 비정상적으로 급락할 경우, 코드 수정 작업을 보류하고 안전 모드(Safe Mode)로 전환하는 방어 로직 추가
- [ ] 윈도잉 주기 및 메모리 Cap 동작 검증을 위해 `3100` 포트를 사용하는 로컬 대용량 로그 스트리밍 스트레스 테스트 스크립트 작성
