# REVIEW

## Functional bugs
- **API 서버 포트 충돌 시 예외 처리 미흡:** `main.py` 및 `run-api-31xx.sh` 실행 중 3100번대 포트(예: 3100)가 이미 점유되어 있을 경우, `Address already in use` 오류를 우아하게 잡지 못하고 서버가 Crash되는 현상이 있습니다. 포트 충돌에 대비한 Graceful Shutdown이나 재시도 로직이 누락되어 인프라 안정성이 저해됩니다.
- **대용량 에러 로그 처리 시 클라이언트 프리징:** `ErrorLogModal.tsx`에서 10만 자 이상의 거대한 로그 데이터를 다운로드하거나 화면에 렌더링할 때, 클라이언트 메모리에 `Blob`을 한 번에 올리는 구조로 인해 브라우저 메모리 부족(OOM) 및 프리징이 발생합니다.
- **특수 문구(이모지) 렌더링 실패:** 브라우저가 `Intl.Segmenter`를 미지원할 경우 ZWJ(Zero Width Joiner)가 포함된 복합 이모지 및 특수 문자가 깨져서 출력됩니다. 구형 브라우저를 대비한 정규식 Fallback 처리의 엣지 케이스가 불완전합니다.
- **루프 엔진 제어(Control) 엔드포인트 누락:** SPEC.md에서 요구하는 Self-Improvement Loop 제어 명령(Start, Pause, Resume, Stop)을 외부에서 호출할 수 있는 API(`loop_engine.py`) 연결이 누락되어 루프를 수동으로 제어할 수 없는 상태입니다.

## Security concerns
- **클라이언트 자원 고갈(Client-side DoS) 위험:** 대용량 로그가 별도의 스트리밍이나 청크(Chunk) 단위 분할 없이 UI 로직으로 직접 주입되면서, 악의적이거나 비정상적으로 긴 로그 데이터에 의해 사용자 브라우저의 메모리가 고갈되어 전체 시스템 모니터링이 마비될 수 있는 위험이 존재합니다.
- **CORS 및 외부 노출 포트 정책 준수 검증:** 향후 Docker Preview 환경 배포 시, 허용된 Origin(예: `https://manbalboy.com`, `http://localhost`) 및 외부 노출 포트(7000-7099 범위) 정책이 엄격하게 지켜지도록 네트워크 레벨에서의 재검토가 필요합니다. 실행 로컬 포트는 3100번대만 사용하여 충돌을 방어해야 합니다.

## Missing tests / weak test coverage
- **루프 시뮬레이터 한계 조건 검증 단위 테스트 부재:** `test_loop_simulator.py` 내에 `max_loop_count` 또는 `budget_limit` 초과 시 동작을 검증하는 테스트가 부족합니다. 특히, 파라미터로 음수 값이 주입되었을 때 즉시 `stopped` 상태로 전이되는 방어 로직에 대한 테스트가 없습니다.
- **동시성 타이밍 이슈(Race condition) 테스트 누락:** 루프 엔진 상태가 강제 전이될 때, Lock(`_lock`) 범위 밖에서 비동기로 큐잉되는 작업이 누락되는 타이밍 이슈를 검증하는 테스트 시나리오가 없습니다.
- **에러 로그 렌더링 스트레스 테스트 부재:** `ErrorLogModal.test.tsx` 내에 10만 자 이상의 거대 문자열과 복합 ZWJ 이모지를 동시에 렌더링할 때 메모리 누수나 프리징이 발생하지 않는지 확인하는 UI 스트레스 벤치마크 테스트가 누락되어 있습니다.
- **인프라 레벨 포트 충돌 통합 테스트 부재:** 실행 예시로 `nc -l 3100` 명령어를 통해 3100 포트를 강제로 점유한 상태에서 스크립트 실행 시 예외 처리가 작동하고 우아하게 실패하는지 검증하는 쉘 스크립트 기반 테스트가 없습니다.

## Edge cases
- **예상치 못한 설정값 주입:** 루프 설정 제한(`max_loop_count`, `budget_limit`)에 음수나 잘못된 타입의 값이 주입될 때의 엔진 상태 전이 동작.
- **포트 충돌 엣지 케이스:** 운영 체제에서 3100 포트가 TIME_WAIT 상태이거나 타 프로세스에 의해 완전히 점유되어 있는 상태에서 서버 구동 스크립트를 재시작할 때 발생하는 소켓 바인딩 실패.
- **렌더링 호환성 엣지 케이스:** `Intl.Segmenter`를 지원하지 않는 레거시 환경에서 10만 자 텍스트 중간에 복합 ZWJ 이모지가 섞여 있을 때 발생하는 문자열 분리 인덱스 에러.
- **비동기 상태 전이 간섭:** 루프 엔진이 `stopped` 상태로 전환되는 찰나(수 밀리초 이내)에 다른 외부 개입(Inject Instruction) 명령이 동시에 유입될 경우 발생하는 작업 큐 누락 가능성.

## TODO

- [ ] `api/app/main.py` 및 `scripts/run-api-31xx.sh`에 포트 3100 충돌 시 Address already in use 예외를 잡아내는 우아한 종료(Graceful Shutdown) 및 재시도 로직 추가
- [ ] `web/src/components/ErrorLogModal.tsx`에 대용량 텍스트 메모리 처리 방어 로직 추가 및 `Intl.Segmenter` 미지원 환경용 ZWJ 이모지 Fallback 정규식 엣지 케이스 보완
- [ ] `api/app/api/loop_engine.py`에 SPEC에서 요구하는 루프 제어 API(Start, Pause, Resume, Stop) 엔드포인트 초안 작성 및 연동
- [ ] `api/tests/test_loop_simulator.py`에 `max_loop_count`, `budget_limit` 초과 및 음수 할당 시 즉시 `stopped` 전이 검증을 위한 단위 테스트 추가
- [ ] 루프 시뮬레이터 상태 전이 시 Lock 밖에서 발생하는 비동기 작업 큐잉 Race condition 검증 테스트 구축
- [ ] `web/src/components/ErrorLogModal.test.tsx`에 10만 자 이상의 더미 데이터 및 ZWJ 이모지가 포함된 렌더링 성능 스트레스 테스트(벤치마크) 추가
- [ ] 의도적으로 3100 포트를 점유(`nc -l 3100` 등 활용)한 상태에서 서버 실행 시 올바른 종료 코드를 반환하는지 확인하는 인프라 통합 테스트 스크립트 작성
- [ ] PR 제출 전 본문에 Docker 기반 실행 가이드 및 Preview 배포 정보(포트 7000-7099 범위 사용, 도메인 연결 정보) 양식이 포함되어 있는지 확인
