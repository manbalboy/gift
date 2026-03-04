# REVIEW

## Functional bugs
- `WorkflowBuilder.tsx`에서 캔버스 배경 클릭 시 노드 선택이 정상적으로 해제(`onPaneClick`)되며, 우측 속성 패널도 올바르게 초기화됩니다. 
- `data`나 `nodeType` 속성이 누락된 불완전한 노드 데이터가 유입되었을 때 `task` 타입으로 안전하게 폴백(fallback) 렌더링되도록 방어 로직이 구현되어 있어 컴포넌트 크래시 버그는 발견되지 않았습니다.
- 웹훅 처리 과정에서 잘못된 타입의 `workflow_id` 페이로드가 유입될 경우, 서버 내부 에러(500)가 발생하지 않고 적절히 무시되거나 422 상태 코드를 반환하도록 예외 처리가 정상적으로 동작합니다.

## Security concerns
- `X-Forwarded-For` 헤더 조작을 통한 Rate Limiting 우회 및 IP 스푸핑 취약점이 해소되었습니다. `api/app/api/webhooks.py`의 `_extract_client_key` 함수에서 프록시 체인을 오른쪽 끝(마지막 추가 지점)부터 역순(`reversed(candidates)`)으로 탐색하여, 처음 등장하는 신뢰할 수 없는 IP를 실제 클라이언트 IP로 식별하는 방어 로직이 성공적으로 적용되었습니다.
- 웹훅 페이로드 최대 크기 제한(5MB)과 HMAC 기반 서명 검증 로직이 기존대로 견고하게 유지되고 있습니다.

## Missing tests / weak test coverage
- 다중 IP 주입 공격 스푸핑 상황(`X-Forwarded-For: 10.0.0.1, 203.0.113.11`)을 시뮬레이션하는 단위 테스트(`test_dev_integration_webhook_uses_rightmost_untrusted_ip_for_rate_limit`)가 올바르게 작성 및 추가되었습니다.
- `workflow_id`에 대한 엣지 케이스(`-1`, `1.0`, `0` 등) 파싱 방어 로직을 검증하는 파라미터화된 테스트(`@pytest.mark.parametrize`)가 추가되어 관련 단위 테스트 커버리지가 우수합니다.
- 프론트엔드 `WorkflowBuilder.test.tsx`에 캔버스 바탕 클릭 이벤트 발생 시의 상태 전이 검증과 불완전 노드 데이터에 대한 폴백 렌더링 컴포넌트 테스트가 충실히 반영되었습니다.

## Edge cases
- 다중 프록시 환경에서 `X-Forwarded-For` 헤더에 유효하지 않은 형식(예: 일반 문자열이나 포트 번호가 포함된 비정상 IP 등)이 유입되는 경우, `ValueError`를 캐치하여 시스템이 안전하게 기본 클라이언트 호스트 IP로 처리하도록 엣지 케이스가 잘 방어되어 있습니다.
- `workflow_id` 값으로 빈 문자열, 음수 기호, 소수점 등이 포함된 값이 유입될 경우, `isdigit()`을 통한 엄격한 검사를 거쳐 비정상적인 값은 안전하게 `None`으로 치환됩니다.

## TODO
- [ ] [P2] 잘못된 웹훅 데이터 유입이나 노드 파싱 에러 발생 시, 사용자가 상황을 즉시 인지할 수 있도록 대시보드 화면 상단에 일시적인 Toast 경고 알림(경고: Orange, 에러: Red)을 노출하는 UI/API 피드백 기능 구현.
- [ ] 개발 및 테스트 과정에서 프론트엔드 로컬 서버(예: `http://localhost:3100`) 구동 시 3100번 대역 포트 규칙이 완전히 준수되어 다른 서비스와 충돌하지 않는지 점검.
