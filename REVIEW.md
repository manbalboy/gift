# REVIEW

## Functional bugs
- **대용량 에러 로그 렌더링 성능 저하**: `web/src/components/ErrorLogModal.tsx`에서 10만 자 이상의 로그 텍스트를 렌더링할 때 가상화(Virtualization)나 텍스트 청크 분할 처리가 완벽히 적용되지 않아 브라우저 멈춤(Freezing)이나 OOM이 발생할 가능성이 있습니다.
- **포트 충돌 예외 처리 누락**: 3100번 포트가 이미 점유되어 있는 상황에서 서버 구동 시, `scripts/run-api-31xx.sh` 또는 백엔드 애플리케이션 레벨에서 'Address already in use' 에러를 적절하게 잡지 못해 Graceful Shutdown 및 자동 재시도가 작동하지 않을 수 있습니다. 재현 예시로 `nc -l 3100`을 실행하여 포트를 선점한 후 스크립트를 실행했을 때의 비정상 종료 여부 점검이 필요합니다.
- **루프 제어 명령 지연**: `loop_engine.py`의 제어 API(Start, Pause, Resume, Stop) 호출 시, 루프 엔진의 현재 상태와 즉각적으로 동기화되지 않고 이전 상태를 반환하거나 상태 전이가 무시되는 문제가 발생할 수 있습니다.

## Security concerns
- **허용 범위 이상의 CORS 정책 노출**: `api/app/main.py`의 CORS 설정이 기획된 허용 대상(`https://manbalboy.com`, `http://localhost` 등)을 엄격히 따르지 않고 와일드카드(`*`)가 사용되었을 가능성을 점검해야 합니다.
- **외부 프리뷰 포트 대역 위반 위험**: 도커 배포 및 프리뷰 환경에서 7000-7099 범위 밖의 내부 API 포트(예: 3100번 포트)가 외부망으로 노출될 수 있는 네트워크 브리지나 도커 포트 바인딩 설정 누락이 우려됩니다.

## Missing tests / weak test coverage
- **루프 안정성 파라미터 경계값 검증 미흡**: `api/tests/test_loop_simulator.py`에 `max_loop_count`나 `budget_limit`에 음수를 할당하거나 한계치를 초과했을 때 시스템이 즉시 `stopped` 상태로 전이되는지에 대한 단위 테스트가 부족합니다.
- **비동기 상태 전이 시 동시성 테스트 누락**: 찰나의 순간에 루프 제어 API가 다중으로 호출될 때, Lock 범위 밖에서 비동기 작업이 누락되거나 무결성이 깨지는 타이밍 이슈(Race Condition)를 재현한 테스트 코드가 필요합니다.
- **UI 벤치마크 테스트 부재**: 대량의 문자열 및 ZWJ 이모지 주입 시 1초 이내에 UI 멈춤 없이 렌더링되는지 확인하는 `ErrorLogModal.test.tsx`의 성능/스트레스 단위 테스트가 부족합니다.
- **포트 점유 기반 쉘 스크립트 자동화 테스트 미흡**: 의도적으로 3100번 포트를 막아두고(`nc -l 3100` 실행) 구동 스크립트를 실행했을 때 의도한 에러 코드와 로깅이 남는지 확인하는 인프라 통합 테스트 스크립트 실행 검증이 부족합니다.

## Edge cases
- **구형 브라우저 이모지 렌더링 깨짐**: 브라우저가 `Intl.Segmenter` API를 지원하지 않는 구형 환경일 때, 복합 ZWJ 이모지나 특수 문자가 분리되어 깨져서 보이는 엣지 케이스를 방어하기 위한 정규식 Fallback 처리 로직이 누락될 수 있습니다.
- **진행 중인 상태에서의 강제 종료 롤백**: 루프 엔진이 상태 전이 로직(예: Improve 단계)을 실행하는 도중 Stop 명령이나 프로세스 종료(SIGTERM)가 들어왔을 때, 상태 꼬임 없이 현재 작업을 안전하게 중단하거나 저장소(Memory)에 기록하는 예외 상황 대비가 필요합니다.
- **상태 조회 API 잦은 호출에 의한 병목**: `GET /api/loop/status`를 대시보드 클라이언트 측에서 과도하게 짧은 주기로 폴링(Polling)할 경우 서버 내부의 락(Lock) 경합이 발생하여 실제 루프 실행 성능에 영향을 줄 수 있습니다.

## TODO
- [ ] `scripts/run-api-31xx.sh` 및 `main.py`에 3100 포트 충돌 시 Graceful Shutdown 및 자동 재시도 로직 구현
- [ ] `api/app/api/loop_engine.py`에 루프 제어 API (Start, Pause, Resume, Stop) 및 상태 조회 API (`GET /api/loop/status`) 작성
- [ ] 루프 엔진 API 내부 비동기 상태 전이를 위한 동시성 제어(Lock) 로직 및 방어 코드 구현
- [ ] `api/tests/test_loop_simulator.py`에 파라미터 경계값(음수, 초과값) 및 비동기 Race Condition 엣지 케이스 테스트 추가
- [ ] 포트 3100 충돌 시나리오를 모사하는 쉘 스크립트 통합 테스트 구성 및 검증
- [ ] `web/src/components/ErrorLogModal.tsx`에 대용량 로그 가상화 렌더링 로직 및 `Intl.Segmenter` 정규식 Fallback 추가
- [ ] UI 스트레스 렌더링 벤치마크 테스트(`ErrorLogModal.test.tsx`) 작성
- [ ] `main.py`의 CORS 미들웨어 정책을 SPEC에 맞게 `manbalboy.com` 및 `localhost` 도메인 계열로 엄격히 제한
- [ ] Docker Preview 구동 시 외부 노출 포트가 7000-7099 대역으로 정상 할당되는지 확인
