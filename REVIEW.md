# REVIEW

## Functional bugs
- **Unbounded Queue 메모리 누수 위험:** `api/app/services/loop_simulator.py`의 `_pending_instructions` 큐(`deque`) 생성 시 `maxlen`이 설정되지 않았습니다. `inject_instruction` API를 통해 빠른 속도로 다량의 명령이 주입되거나 Engine이 일시정지된 상태에서 주입이 누적되면 무제한으로 메모리 큐가 커져 OOM(Out Of Memory)을 유발할 수 있습니다.
- **XSS 방어 로직 미구현 (요구사항 불일치):** `web/src/utils/security.ts`의 `sanitizeAlertText` 함수가 제어 문자와 민감한 토큰만 마스킹할 뿐, HTML이나 Script 태그를 제거하지 않고 있습니다. `security.test.ts`의 검증 코드조차 XSS 페이로드가 원본에 유지되는 것을 통과 조건으로 삼고 있어, 요구사항(PR 요약)에 명시된 "스크립트 태그 완전 제거" 기능이 실제로는 누락된 상태입니다.

## Security concerns
- **다중 워커 환경에서의 Local Lock Fallback 취약점:** 현재 `RedisLockProvider`가 Redis 접속 실패 시 `LocalLockProvider`로 자동 Fallback 하도록 설계되어 있습니다. 스케일아웃된 다중 API 컨테이너 환경에서 Redis 장애가 발생하면, 모든 워커가 각각 로컬 락을 획득하게 되어 Loop Engine이 중복으로 백그라운드에서 실행됩니다. 이는 상태 충돌 및 중복 시스템 알림을 유발하는 구조적 위험(보안 및 무결성 훼손)을 가집니다.

## Missing tests / weak test coverage
- **전체 워크플로우 E2E 테스트 누락:** `PLAN.md`에 요구된 "로컬 환경(API 서버 localhost:3100)을 타겟팅하여 전체 워크플로우를 시뮬레이션할 수 있는 e2e/test 스크립트 작성" 항목이 충족되지 않았습니다. `web/tests/e2e/` 디렉토리 내에 UI 컴포넌트에 대한 스트레스 테스트 등은 존재하지만, Loop Engine의 핵심 제어 파이프라인(`Start` -> `Inject Instruction` -> `Pause` -> `Resume` -> `Stop`)이 통합적으로 검증되는 시나리오 테스트 코드가 없습니다.

## Edge cases
- **Paused 상태 대기 스레드의 비효율적 리소스 점유:** Loop Engine이 일시정지(`paused` 또는 `safe_mode`) 상태일 때 백그라운드 스레드가 `time.sleep(0.12)`을 반복 호출하며 바쁜 대기(Busy Wait) 형태로 동작합니다. 엔진이 장기간 멈춰있을 경우 CPU의 컨텍스트 스위칭을 불필요하게 낭비하므로, `threading.Event`의 `wait()`을 활용한 블로킹 대기 방식으로 최적화해야 하는 엣지 케이스가 존재합니다.

## TODO
- [ ] `api/app/services/loop_simulator.py` 내 `_pending_instructions` 큐에 적절한 최대 길이(`maxlen`)를 지정하여 주입된 명령어 누적에 의한 메모리 누수 방어.
- [ ] `web/src/utils/security.ts`의 `sanitizeAlertText` 내부에 DOMPurify 등을 적용하여 XSS 페이로드(HTML/Script 태그) 완전 제거 로직 병합.
- [ ] `web/src/utils/security.test.ts`를 수정하여 악의적인 XSS 스크립트 태그가 정상적으로 살균 및 삭제되는지 확인하는 테스트 케이스로 변경.
- [ ] 다중 노드 무결성을 위해 Redis 락 획득 실패 시 Local Lock으로 Fallback 하지 않고, 엔진 실행을 안전하게 차단(Fail-fast)하도록 Lock Provider 분기 로직 수정.
- [ ] API 서버(localhost:3100)를 타겟팅하여 Loop Engine 전체 생명주기를 시뮬레이션하는 `web/tests/e2e/loop-engine.spec.ts` 테스트 스크립트 신규 작성.
- [ ] Loop Simulator의 일시정지 대기 로직을 단순 `time.sleep(0.12)` 방식에서 `threading.Event` 기반 이벤트 대기로 변경하여 불필요한 루프 최적화.
