# REVIEW

## Functional bugs
- **에러 로그 텍스트 Truncation 렌더링 병목**: 대용량의 에러 로그(수만 자 이상)가 한 번에 렌더링될 경우 브라우저 멈춤 현상이나 성능 저하가 발생할 수 있습니다. 5000자 기준으로 텍스트를 자르고 'Show more' 버튼을 통해 확장하는 기능이 정상적으로 동작하는지 확인이 필요합니다.
- **클립보드 복사 피드백 누락**: 사용자가 로그 복사 버튼을 클릭했을 때 명확한 시각적 피드백이 없으면 동작 성공 여부를 파악하기 어렵습니다. 복사 성공 및 실패 상태에 따른 Toast 알림 처리가 구현되어야 합니다.
- **클립보드 API 예외 처리**: 브라우저 환경이나 비동기 권한 문제로 인해 `navigator.clipboard.writeText` API 호출이 실패할 경우, 앱이 크래시되지 않고 적절한 에러 상태를 렌더링하도록 예외 처리가 보장되어야 합니다.

## Security concerns
- **비정형 XSS 페이로드 필터링 우회**: 에러 로그 데이터에 중첩되거나 쪼개진 비정형 XSS 페이로드(예: `<scr<script>ipt>`)가 포함되어 있을 때, 필터링을 우회하여 스크립트가 실행될 위험이 있습니다.
- **정상 텍스트 오탐(False Positive) 위험**: XSS 방어를 위해 적용된 정규식이 에러 로그에 포함된 정상적인 코드 패턴(예: 제네릭 타입 문법 `<T>`)을 악성 코드로 오인하여 내용이 훼손될 가능성을 점검해야 합니다.
- **CORS 및 접근 제어 검증**: SPEC에 명시된 기준(manbalboy.com 계열, localhost 등)을 벗어난 출처에서의 접근이 철저히 차단되는지 보안 설정 확인이 필요합니다.

## Missing tests / weak test coverage
- **클립보드 Mocking 단위 테스트 부족**: `web/src/components/ErrorLogModal.test.tsx` 내에 `navigator.clipboard.writeText`를 활용한 복사 성공/실패 시나리오에 대한 Mocking 테스트 커버리지가 확보되어야 합니다.
- **XSS 심화 엣지 케이스 테스트 부재**: `web/src/utils/security.test.ts`에 비정형 XSS 공격 패턴을 주입하여 우회 여부를 검증하는 심화 테스트 케이스가 부족합니다.
- **대용량 로그 렌더링 CSS 테스트 부재**: 텍스트 길이가 매우 긴 에러 로그를 주입했을 때, `overflow-y: auto` 및 `word-break: break-all` 속성이 작동하여 모달 레이아웃이 붕괴되지 않는지 확인하는 렌더링 테스트가 필요합니다.

## Edge cases
- **에러 로그가 비어있거나 불완전한 경우**: 로그 데이터가 `null`이거나 빈 문자열일 때 모달 UI가 깨지지 않고 "No logs available"과 같은 대체 텍스트를 안전하게 렌더링해야 합니다.
- **연속적인 복사 버튼 클릭**: 짧은 시간 내에 클립보드 복사 버튼을 여러 번 클릭할 경우 Toast 알림이 무한정 쌓이지 않도록 디바운싱(Debouncing) 또는 알림 중복 제거 처리가 필요합니다.
- **로컬 테스트 포트 충돌**: 로컬 환경에서 테스트 및 개발 서버 구동 시 포트 충돌이 발생할 수 있으므로, 3100번 포트를 점유하여 실행(예: `http://localhost:3100` 접속)할 때 다른 프로세스와 간섭이 없는지 점검해야 합니다.

## TODO
- [ ] `web/src/components/ErrorLogModal.test.tsx`에 `navigator.clipboard.writeText` 성공 및 실패 상황을 검증하는 Mock 테스트 작성.
- [ ] `ErrorLogModal` 내 로그 출력 영역(`<pre>` 태그 등)에 `overflow-y: auto` 및 `word-break: break-all` 속성 적용 및 레이아웃 안정성 점검.
- [ ] 5000자를 초과하는 에러 로그 유입 시 텍스트를 Truncation 하고 'Show more' 버튼으로 확장하는 기능 구현.
- [ ] 클립보드 복사 성공/실패 시 사용자에게 결과를 알려주는 전역 Toast 알림 기능 추가.
- [ ] `web/src/utils/security.test.ts`에 `<scr<script>ipt>` 와 같은 비정형 XSS 페이로드를 차단하는 심화 테스트 케이스 1~2개 추가.
- [ ] XSS 방어 로직이 제네릭 타입 문법(`<T>` 등)을 정상 텍스트로 인식하도록 정규식 예외 처리 및 교차 검증 테스트 진행.
- [ ] 로컬 실행 환경(3100 포트 등)에서 테스트 스크립트를 구동하여 전체 테스트의 100% 통과 여부 확인.
