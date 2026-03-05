# REVIEW

## Functional bugs
- `ErrorLogModal`에서 5000자 이상의 대용량 에러 로그를 렌더링할 때 메인 스레드 병목 현상으로 인해 렌더링이 지연되거나 레이아웃이 무너질 가능성이 존재합니다.
- 복사 버튼을 연속적으로 클릭할 경우 디바운싱 처리가 되어 있지 않다면 Toast 알림이 무한 증식하여 사용자 경험을 해칠 수 있습니다.
- 브라우저 환경에 따라 클립보드 API(`navigator.clipboard.writeText`) 권한이 거부될 수 있으며, 이때 적절한 예외 처리가 없다면 애플리케이션 전체가 크래시될 수 있습니다.
- FastAPI 기반 Self-Improvement Loop API에서 엔진의 상태 제어(Start, Pause, Stop 등)가 누락될 경우, 백그라운드 태스크가 종료되지 않고 서버 리소스를 점유하는 버그가 발생할 수 있습니다.

## Security concerns
- 비정형 XSS 페이로드(예: `<scr<script>ipt>`)를 우회하는 악의적인 로그 데이터가 주입되었을 때, 이를 완벽하게 필터링하지 못해 스크립트가 실행될 보안 위협이 있습니다.
- 대용량 로그 텍스트를 정규식으로 필터링하는 과정에서 복잡한 패턴 매칭으로 인한 ReDoS(정규표현식 서비스 거부) 취약점이 발생하여 프론트엔드가 멈출 위험이 있습니다.
- CORS 정책이 `manbalboy.com` 및 `localhost` 계열로 엄격하게 제한되지 않아, 허용되지 않은 출처에서 Loop Engine 핵심 API를 호출할 수 있는 보안 우려가 있습니다.

## Missing tests / weak test coverage
- `web/src/components/ErrorLogModal.test.tsx` 파일 내에 클립보드 API 연동 성공 및 실패(권한 거부 등)를 모사하는 Mock 단위 테스트 커버리지가 부족합니다.
- `web/src/utils/security.test.ts`에 신규 XSS 우회 패턴과 정상적인 제네릭 코드 문법(`<T>`) 오탐을 구별하기 위한 교차 검증 및 심화 엣지 케이스 단위 테스트가 누락되어 있습니다.
- Self-Improvement Loop 엔진의 무한 루프 방지 정책(예산 제한, 중복 변경 감지 등)에 대한 API 계층의 단위 테스트 및 예외 처리 검증 코드가 필요합니다.

## Edge cases
- 서버로부터 에러 로그가 빈 문자열(`null`, `undefined`, `""`)로 반환될 경우, 모달 컴포넌트 내부 뷰포트가 붕괴되지 않고 "No logs available"라는 대체 텍스트가 정상 노출되는지 확인이 필요합니다.
- 띄어쓰기가 전혀 없는 극단적으로 긴 단일 문자열이 로그로 입력되었을 때, `word-break: break-all` 속성이 올바르게 동작하지 않아 모달 컨테이너 바깥으로 텍스트가 삐져나가는지 점검해야 합니다.
- Loop Engine이 평가(Evaluator) 단계에서 기준점(Quality Score threshold)을 달성하지 못해 동일한 코드를 무한정 리팩토링하려는 시도를 할 때, `max_loop_count` 제어 로직이 정상 작동하여 루프를 차단하는지 확인해야 합니다.

## TODO
- [ ] `web/src/components/ErrorLogModal` UI 개선: `overflow-y: auto`, `word-break: break-all` 적용 및 5000자 초과 텍스트 Truncation('Show more' 버튼) 구현
- [ ] 전역 Toast 알림 기능 추가 및 로그 복사 버튼 클릭 시 클립보드 API 성공/실패 예외 처리(연속 클릭 디바운싱 포함) 연동
- [ ] 비정형 XSS 방어 로직 고도화 및 정상적인 제네릭 문법(`<T>`) 오탐 방지 예외 처리 적용 (정규식 성능 최적화 포함)
- [ ] `web/src/components/ErrorLogModal.test.tsx`에 클립보드 API 성공/예외 상황 Mock 단위 테스트 작성
- [ ] `web/src/utils/security.test.ts`에 XSS 심화 엣지 케이스 및 제네릭 방어 로직 교차 검증 단위 테스트 추가
- [ ] 로컬 환경 구동 시(`http://localhost:3100`) 빈 문자열, 극단적 더미 텍스트 등을 주입하여 렌더링 붕괴 여부 및 Toast 상태 통합 수동 테스트 진행
- [ ] FastAPI 기반 Self-Improvement Loop 엔진 4대 핵심 컴포넌트(Analyzer, Evaluator, Planner, Executor) 기본 라우팅 및 모의 응답 엔드포인트 설계
- [ ] Loop Engine의 무한 루프 방지(Loop Control) 및 장기 기억(Memory) 데이터 저장을 위한 스키마 초안 작성
- [ ] 웹 서버 및 API 엔드포인트 CORS 정책 검증 (허용 기준값: manbalboy.com 및 localhost 계열)
