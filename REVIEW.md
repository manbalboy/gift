# REVIEW

## Functional bugs
- **프론트엔드 유닛 테스트 실패 (`SystemAlertWidget.test.tsx`)**: `sanitizeAlertText` 함수에 DOMPurify를 성공적으로 적용하여 XSS 취약점을 해결했으나, 기존 컴포넌트 테스트가 이 변경 사항을 반영하지 못해 실패하고 있습니다. 기존 테스트는 `<img src=x onerror=alert(1)>` 등의 악성 문자열이 이스케이프된 텍스트 형태로 렌더링될 것을 기대하지만, DOMPurify는 해당 악성 태그 자체를 완전히 삭제하므로 기대 결과(Assertion)의 불일치가 발생합니다.

## Security concerns
- **XSS 필터링 과적합 (Over-sanitization) 위험**: DOMPurify 적용으로 악성 스크립트 실행은 차단되었으나, 알림 메시지나 로그에 개발자가 작성한 정상적인 제네릭 코드 형태(예: `List<String>`)나 꺾쇠괄호가 포함될 경우 이를 HTML 태그로 오인하여 원본 코드가 훼손되거나 완전히 삭제될 위험성이 존재합니다.
- **Fail-fast로 인한 가용성 한계**: Redis 분산 락 실패 시 중복 실행을 막기 위해 로컬 락 대신 Fail-fast 방식(즉각 중단)으로 변경된 점(P0 반영)은 데이터 오염을 훌륭하게 방지합니다. 다만, 단일 Redis 인스턴스의 일시적인 네트워크 순단이 시스템 전체 파이프라인 중단으로 이어질 수 있으므로, 단기적인 재시도(Retry) 로직 도입을 향후 고려할 필요가 있습니다.

## Missing tests / weak test coverage
- **DOMPurify 역검증 시나리오 부재**: `PLAN.md`에 명시된 "일반 텍스트 및 코드 블록이 원본 그대로 유지되는지 확인하는 역검증 시나리오"가 `security.test.ts`에 충분히 커버되지 않았습니다. 일반적인 프로그래밍 문법이 필터링 과정에서 살아남는지에 대한 케이스가 누락되어 있습니다.
- **장애 알림 연동 테스트 미흡**: Redis Lock 획득 실패로 루프 엔진이 중단될 때(`UnavailableLockProvider`), 시스템 상태가 에러로 전환되고 외부 모니터링 시스템이나 관리자에게 올바르게 알림이 전파되는지에 대한 종단 간(E2E) 커버리지가 부족합니다. API (포트 3100) 테스트 상에서 이 장애 시나리오의 응답 코드를 확인하는 로직이 추가되어야 합니다.

## Edge cases
- **명령 큐 오버플로우 시 UI 피드백 누락 우려**: `loop_simulator.py` 큐 길이에 `maxlen`이 정상적으로 할당되어 대량 명령 주입 시 발생하는 OOM은 방지되었습니다. 그러나 큐가 가득 차서 사유가 `queue_overflow`로 처리되어 버려진(`dropped`) 명령에 대해 프론트엔드가 상태 조회(`GET /api/workflow/instruction/{id}`)를 수행했을 때, 사용자에게 명령이 거부되었음을 인지시키는 명확한 UI 안내(경고 토스트 등)가 고려되지 않았을 가능성이 높습니다.
- **다중 이벤트 경합 (Race Condition)**: `threading.Event` 기반의 대기 블로킹 방식으로 CPU 사용량이 최적화되었으나, Pause, Resume, Stop 등의 신호가 매우 짧은 간격으로 동시에 여러 번 인가될 때 내부 이벤트 플래그가 꼬이거나 데드락이 발생하지 않는지 확인하는 동시성 스트레스 테스트 로직이 필요합니다.

---

## TODO

- [ ] `web/src/components/SystemAlertWidget.test.tsx`의 실패하는 테스트 케이스 수정 (DOMPurify 태그 삭제 동작에 맞추어 Assertion 변경).
- [ ] 정상적인 꺾쇠괄호 코드(예: `<T>`)가 DOMPurify에 의해 유실되지 않도록 `web/src/utils/security.ts` 설정 보완 및 관련 역검증 테스트 케이스 추가.
- [ ] 큐가 꽉 차서 버려진(`dropped`) 지시사항 상태를 프론트엔드 대시보드에서 조회 시, 사용자에게 명확히 피드백하는 UI/UX 예외 처리 확인 및 연동.
- [ ] Redis Lock 오류 등으로 엔진이 Fail-fast 처리되었을 때, API(로컬 포트 3100 타겟) 응답 및 시스템 경고가 정상적으로 표출되는지 E2E 테스트 시나리오 보강.
