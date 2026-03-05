# REVIEW

본 리뷰는 SPEC.md 및 PLAN.md에 정의된 요구사항을 바탕으로 현재 구현 상태를 점검한 결과입니다.

## Functional bugs

- **Custom 가상화 렌더링 스크롤 오류:** `web/src/components/SystemAlertWidget.tsx`에 가상화 스크롤이 적용되었으나, PLAN에서 언급된 검증된 라이브러리(`@tanstack/react-virtual` 등) 대신 직접 구현(Custom Virtualization)되었습니다. 이로 인해 모바일 기기 등 높이 계산이 지연되거나 빠르게 스크롤할 경우 위치가 튀는(Jumping) 현상이 잔존할 가능성이 높습니다.
- **다중 워커 환경에서의 시뮬레이터 중복 실행:** `loop_simulator.py`에서 싱글톤 패턴으로 스레드를 구동하지만, FastAPI가 다중 워커(Multi-worker) 환경으로 배포될 경우 워커 개수만큼 시뮬레이터가 병렬로 실행되어 로그 브로드캐스팅이 중복되거나 상태 전이가 꼬이는 문제가 발생할 수 있습니다.

## Security concerns

- **Loop 제어 API 인증 누락 (DoS 위험):** `api/app/api/loop_engine.py`에 구현된 `/api/loop/start`, `/pause`, `/stop` 라우터에 접근 제어(`Depends`)가 전혀 적용되지 않았습니다. 누구나 호출하여 백그라운드 스레드를 점유하고, 단시간에 무수한 시스템 로그 데이터를 데이터베이스에 적재하도록 유도할 수 있습니다.
- **무제한 로그 축적으로 인한 리소스 고갈:** `loop_simulator.py`는 `0.36`초 간격으로 `record_system_alert`를 지속 호출합니다. 루프의 최대 실행 주기 제어나 오래된 데이터를 자동 정리하는 Garbage Collection 메커니즘이 없어, 장기 실행 시 시스템 DB 및 메모리 누수 위험이 있습니다.

## Missing tests / weak test coverage

- **보안 및 예외 케이스 통합 테스트 부재:** `api/tests/test_loop_engine_api.py`에는 정상적인 라이프사이클 전이(Lifecycle)에 대한 검증만 존재하며, 인증 누락 공격이나 중복된 `start` 요청 동시성(Concurrency) 제어를 검증하는 테스트가 없습니다.
- **UI 스트레스 검증 (Task 1-4) 부재:** 로컬 개발 포트 `http://localhost:3100` 환경에서 대량의 로그(수만 건)를 스트리밍할 때 발생하는 프레임 드랍이나 렌더링 지연을 검증하는 스트레스/성능 테스트 코드가 식별되지 않습니다.

## Edge cases

- **로그 데이터 급증 시의 메인 스레드 블로킹:** UI로 수만 건의 `alerts` 데이터가 지속 스트리밍 될 때, `SystemAlertWidget.tsx`의 `useMemo` 내부에서 이뤄지는 텍스트 마스킹(`sanitizeAlertText`) 및 배열 필터링 작업이 누적되어 브라우저 메인 스레드를 블로킹할 수 있습니다. (과거 데이터 제거 또는 Chunk 처리 필요)
- **비활성 탭에서 복귀 시 스크롤 점핑:** 브라우저 탭이 백그라운드에 있다가 활성화될 때 발생하는 `visibilitychange` 이벤트와 ResizeObserver가 맞물리면서 뷰포트 높이 계산 오차가 발생해, 맨 아래쪽 로그에 불필요한 공백이 생기거나 스크롤이 흔들리는 레이스 컨디션이 존재합니다.

---

## TODO

- [ ] `api/app/api/loop_engine.py`의 모든 제어 라우터에 인증/인가 의존성(`Depends`) 추가 및 권한 검증 구현
- [ ] `loop_simulator.py` 및 알림 시스템에 오래된 더미 로그 정리 정책(Retention/Windowing) 추가 및 서버 다중 워커 환경에서의 중복 실행 방지(Redis Lock 등 적용)
- [ ] `SystemAlertWidget.tsx`의 가상 스크롤 로직을 `@tanstack/react-virtual` 등 검증된 라이브러리로 마이그레이션하거나 메모리 윈도잉(일정 개수 초과 시 오래된 배열 제거) 정책 보강
- [ ] `test_loop_engine_api.py`에 권한 검증 실패 엣지 케이스 및 병렬 `start` 호출 방어 테스트 케이스 작성
- [ ] 로컬 포트 `3100` 번대에서 대용량 상태 로그 스트리밍을 재현하여 UI 프레임 드랍 유무를 점검하는 E2E 스트레스 테스트 스크립트 작성
