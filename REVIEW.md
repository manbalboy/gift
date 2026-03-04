# REVIEW

## Functional bugs
- `web/src/components/WorkflowBuilder.tsx` 내 모바일 뷰 안내 문구에 "모 니터링을"이라는 오타가 존재합니다. 올바른 문구인 "모니터링을"로 수정이 필요합니다.
- (기능 누락) 워크플로우 빌더에서 특정 노드를 클릭했을 때 해당 노드의 기본 정보(ID, 타입)를 확인할 수 있는 속성 패널 UI(읽기 전용)가 누락되어 있습니다.
- 다중 워커 환경에서 로컬 메모리 기반 Rate Limiter(`api/app/services/rate_limiter.py`) 사용 시 동시성 경합 및 상태 불일치 문제가 발생할 수 있습니다. 현재 구조적 한계점 및 향후 분산 캐시(Redis 등) 도입 필요성에 대한 문서화가 부족합니다.

## Security concerns
- `api/app/api/webhooks.py`의 IP 파싱 로직에서 악의적인 사용자가 `X-Forwarded-For` 헤더를 변조(Spoofing)하여 Rate Limiting을 우회하거나 접근 제한을 회피할 수 있는 취약점이 있습니다. 신뢰할 수 있는 프록시에 대한 엄격한 검증이 필요합니다.
- 웹훅 페이로드 수신 시 잘못된 타입의 `workflow_id`가 포함될 경우, 무시 처리되기 전 시스템에 명확한 에러 또는 경고 로그가 남지 않아 보안 감사 및 악의적인 페이로드 시도 추적이 어려울 수 있습니다.

## Missing tests / weak test coverage
- 프론트엔드(`web/`) 디렉터리의 단위 테스트(Jest) 환경 구성이 미흡하거나 깨져있어 안정적인 컴포넌트 검증이 어렵습니다. 
- API 웹훅 로직의 `X-Forwarded-For` 헤더 검증 강화 및 예외 처리에 대한 `test_webhooks_api.py` 내 엣지 케이스 커버리지가 부족합니다.
- 워크플로우 빌더의 노드 클릭 이벤트 및 신규 추가될 속성 패널 렌더링을 검증하는 프론트엔드 테스트가 누락되어 있습니다.

## Edge cases
- `X-Forwarded-For` 헤더가 비표준 형식이거나, 쉼표로 구분된 여러 IP 중 유효하지 않은 IP 주소 문자열이 포함된 경우 서버가 올바르게 파싱하지 못하고 예외를 발생시킬 수 있습니다.
- 웹훅 페이로드의 `workflow_id`가 문자열 형태의 숫자(`"123"`), 불리언(`true`), 또는 완전히 예상치 못한 객체 타입으로 들어올 때의 안전한 형변환 및 예외 처리가 필요합니다.
- 모바일 해상도(특히 좁은 화면)에서 노드 속성 패널이 활성화될 때, 기존 그래프 UI를 가리거나 전체 레이아웃이 깨질 수 있는 반응형 렌더링 상황을 고려해야 합니다.

## TODO
- [ ] `web/src/components/WorkflowBuilder.tsx` 내 오타 수정 ("모 니터링을" -> "모니터링을").
- [ ] `api/app/api/webhooks.py` 내 `X-Forwarded-For` 헤더 변조 방지를 위한 신뢰할 수 있는 프록시 설정 적용 및 IP 파싱 로직 보완.
- [ ] `api/app/api/webhooks.py` 내 `workflow_id` 타입 파싱 실패(예: `isdigit()` 실패, 불리언 타입 유입 등) 시 원인 추적을 위한 Error/Warning 로거 추가.
- [ ] `web/` 디렉터리의 Jest 테스트 환경 정비 및 `package.json` 스크립트 보완 (명령어 실행 시 전체 테스트 정상 통과 확인).
- [ ] `api/app/services/rate_limiter.py`에 다중 워커 환경에서의 동시성 경합 문제 및 분산 캐시(Redis 등) 도입 필요성에 대한 구조적 주석 및 문서화 추가.
- [ ] `WorkflowBuilder.tsx`에서 노드 클릭 시 노드의 식별 정보(ID, 타입)를 보여주는 읽기 전용 속성 패널 기초 UI 구현.
- [ ] `test_webhooks_api.py`에 조작된 헤더, 잘못된 페이로드 타입 등 다양한 엣지 케이스에 대한 단위 테스트 추가 작성 및 검증.
- [ ] 보완된 프론트엔드 테스트 환경에서 수정된 워크플로우 빌더 컴포넌트 및 속성 패널에 대한 단위 테스트 작성. (포트 사용 시 3100번대 포트 활용)
