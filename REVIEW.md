# REVIEW

## Functional bugs
- 현재 구현된 코드에서 크리티컬한 기능적 버그는 발견되지 않았습니다. 
- `PLAN.md`에 명시된 프론트엔드 모바일 뷰 오타 수정("모니터링을")과 `WorkflowBuilder.tsx`의 노드 클릭 시 ID/Type을 표시하는 읽기 전용 속성 패널이 정상적으로 구현되었습니다.
- 백엔드 `webhooks.py`의 `workflow_id` 타입 파싱 예외 처리 및 로깅 기능(Error/Warning)도 요구사항에 맞게 잘 동작하고 있습니다.

## Security concerns
- **X-Forwarded-For IP Spoofing 취약점**: `webhooks.py`의 `_extract_client_key` 함수에서 `candidates[0]`(가장 왼쪽 IP)를 클라이언트의 IP로 반환하고 있습니다. 악의적인 공격자가 임의의 조작된 IP를 담아 `X-Forwarded-For: <fake-ip>`로 요청을 보낼 경우, 중간에 위치한 신뢰할 수 있는 프록시가 실제 IP를 뒤에 덧붙여 `X-Forwarded-For: <fake-ip>, <real-ip>` 형태로 서버에 전달할 수 있습니다. 이 경우 가장 왼쪽의 `<fake-ip>`가 클라이언트 IP로 간주되어 IP 기반의 Rate Limiting을 쉽게 우회할 수 있는 보안 취약점이 존재합니다. 
- 신뢰할 수 있는 프록시(Trusted Proxy) 목록과 대조하여 오른쪽에서 왼쪽으로 역순 탐색하며, 처음으로 등장하는 '신뢰할 수 없는 IP'를 진짜 클라이언트 IP로 식별하도록 IP 추출 로직을 강화해야 합니다.

## Missing tests / weak test coverage
- **스푸핑 및 다중 IP 헤더 테스트 부족**: 백엔드의 `test_webhooks_api.py`에서 `X-Forwarded-For` 헤더에 대한 테스트를 진행하고 있으나, 클라이언트가 악의적으로 쉼표로 구분된 다중 IP를 보냈을 때(`X-Forwarded-For: 10.0.0.1, 203.0.113.11`) 시스템이 Rate Limiter 우회를 제대로 방어하는지에 대한 엣지 케이스 단위 테스트가 누락되어 있습니다.
- **프론트엔드 노드 선택 해제 및 예외 상태 검증**: 프론트엔드의 `WorkflowBuilder.test.tsx`가 정상 통과하고 있으나, 캔버스의 빈 영역을 클릭하여 노드 선택이 해제되었을 때(Selected Node === null) 우측 패널이 정확히 초기화되는지에 대한 상태 전이 커버리지가 더 필요합니다. 또한 로컬 테스트 서버 구동 시 포트 충돌 방지를 위해 명시적으로 3100번대(예: http://localhost:3100)를 바라보는 테스트 환경 설정 점검이 필요합니다.

## Edge cases
- **음수 및 소수점 workflow_id 처리**: 웹훅 페이로드로 들어오는 `workflow_id_raw`가 `-1`과 같은 음수이거나 `1.0`과 같이 소수점을 포함한 문자열 형태일 경우, `str(workflow_id_raw).isdigit()` 검사에서 `False`로 평가되어 파싱에 실패하고 `None`이 할당됩니다. 시스템의 Workflow ID가 항상 양의 정수라면 안전하게 무시되겠지만, 파싱 실패 상황이 지속적으로 엣지 케이스로 발생할 수 있으므로 이에 대한 방어 로직이나 로그가 명확한지 고려할 필요가 있습니다.
- **불완전한 노드 데이터 유입**: `WorkflowBuilder.tsx`에서 노드의 `data` 속성이 아예 누락되거나 `nodeType` 값이 없는 비표준 노드가 유입되었을 때, `task`로 fallback 처리하는 방어 코드가 있습니다. UI 상 에러를 발생시키지는 않지만, 사용자에게 부정확한 정보가 보여질 수 있는 엣지 케이스입니다.

## TODO
- [ ] `webhooks.py` 내 `X-Forwarded-For` IP 추출 로직을 수정하여, 오른쪽(가장 마지막에 추가된 프록시)부터 역탐색하여 Rate Limiting 우회를 방지하도록 개선하기.
- [ ] `test_webhooks_api.py`에 악의적인 다중 IP 스푸핑 헤더(`X-Forwarded-For: fake_ip, real_ip`) 상황을 가정한 보안 단위 테스트 추가하기.
- [ ] Jest를 활용한 프론트엔드 테스트에 노드 선택 해제(바탕 클릭) 상태 변화 및 데이터가 불완전한 엣지 케이스 노드 렌더링 검증 시나리오 추가하기 (로컬 E2E/UI 테스트 구동 시 포트 3100 사용 설정 확인 포함).
- [ ] 음수 및 Float 형태의 `workflow_id` 페이로드 유입을 커버할 수 있도록 `isdigit()` 검증 조건을 보완하거나 해당 엣지 케이스에 대한 테스트 코드 추가하기.
