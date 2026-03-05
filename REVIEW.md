# REVIEW

## Functional bugs
- `web/src/components/SystemAlertWidget.tsx`의 렌더링 시 알림 메시지가 극단적으로 긴 띄어쓰기 없는 텍스트로 올 경우, 부모 컨테이너를 벗어나 레이아웃이 붕괴될 가능성이 여전히 존재합니다. 스타일상에 명시적으로 `word-break: break-all`이나 `overflow-wrap: anyWhere` 설정이 올바르게 반영되었는지 재확인이 필요합니다.
- `web/scripts/check-port.mjs`에서 락 타임아웃 방어 로직이 추가되었으나, 다중 워커가 동시에 구동되며 포트를 경합할 때 비정상 종료(SIGKILL 등)가 발생하면 남겨진 락 파일이 즉시 해제되지 않아 이후 워커들이 포트(예: 3100번, 3101번)를 할당받지 못하고 무한 대기하는 간헐적인 Race Condition 버그가 발생할 수 있습니다.

## Security concerns
- `api/app/services/system_alerts.py`에서 로컬 경로 및 토큰을 필터링하기 위해 사용된 정규표현식(`_SENSITIVE_PATH_PATTERN`, `_BEARER_TOKEN_PATTERN`)이 대량의 로그 데이터를 처리할 때 ReDoS(정규표현식 서비스 거부) 공격에 취약할 여지가 있습니다. 지나치게 긴 악의적 로그 페이로드가 인입될 경우 백엔드 CPU 병목을 유발할 수 있습니다.
- `api/app/api/workflows.py` 워크플로우 제어 API 인가 실패 시 반환되는 에러 로그나 401/403 응답 객체에 클라이언트의 헤더 및 컨텍스트 정보가 담기면서 예측하지 못한 민감 데이터가 유출될 가능성이 있으므로, 에러 응답부에도 엄격한 마스킹 로직 전파가 필요합니다.

## Missing tests / weak test coverage
- `api/tests/test_workflow_engine.py`에 예산(Budget) 한도 초과 및 강제 전이 관련 단언 테스트가 존재하나, 예산 제한의 경계값(Boundary value: 정확히 Budget과 일치하는 시점 및 바로 직후)에 대한 촘촘한 분기 테스트 시나리오가 부족합니다.
- `web/tests/e2e/system-alert.spec.ts`에서 극단적으로 긴 문장이나 특수 문자가 연속으로 주입되었을 때, 모바일 뷰포트 해상도에서 레이아웃이 화면 밖으로 밀려나지 않는지 시각적으로 검증하는 시나리오가 비어있습니다.
- 다중 락 경합을 방어하기 위한 통합 쉘 스크립트(`web/scripts/test-port-timeout.sh`) 커버리지에서, 3100번대 포트(예: 3100)를 대상으로 여러 백그라운드 프로세스가 동시에 접근했을 때 타임아웃 후 정상 릴리즈되는지를 보장하는 견고한 통합 부하 테스트가 보강되어야 합니다.
- 마스킹 정규표현식의 성능 저하(ReDoS)를 모사하는 악의적인 로그 문자열 주입 부하 테스트가 백엔드 테스트셋에 존재하지 않습니다.

## Edge cases
- 데이터베이스의 `created_at` 역순 인덱스가 추가되었으나, 동일한 밀리초(ms)에 대량의 로그 알림이 동시 삽입될 경우 조회 정렬 순서가 보장되지 않아 페이징(Paging)이나 커서(Cursor) 기반 조회 시 데이터가 누락되거나 중복 노출되는 엣지 케이스가 존재할 수 있습니다. `id`와 결합된 복합 인덱스 고려가 필요합니다.
- `web/src/components/SystemAlertWidget.tsx`에서 마스킹 텍스트 하이라이트 처리를 위해 텍스트를 `split`하여 렌더링하고 있습니다. 원본 로그 텍스트 자체에 이미 사용자가 입력한 임의의 `***[MASKED]***` 문자열이 다수 포함되어 있을 경우 불필요한 DOM 요소가 과도하게 생성되어 브라우저 렌더링 성능을 저하시킬 수 있습니다.
- 워크플로우 실행 시 노드 반복 실패 누적에 따른 Risk Score가 외부 이벤트와 겹쳐서 비정상적으로 급증할 경우, 예산 초과(Blocked) 전이가 발생하기 직전에 불필요하게 많은 알림 이벤트가 버스(Event Bus)를 덮어버리는 병목 구간이 생길 수 있습니다.

## TODO
- [ ] `SystemAlertWidget.tsx` 최상위 혹은 텍스트 컨테이너(p 태그 등)에 `word-break: break-all` 및 `overflow-wrap: break-word` CSS 속성이 정상 적용되었는지 확인
- [ ] 마스킹 정규식 유틸리티(`api/app/services/system_alerts.py`)에 입력 텍스트 최대 길이(예: 10,000자) 제한 방어 로직 선제 추가하여 ReDoS 취약점 완화
- [ ] `api/tests/test_workflow_engine.py` 파일 내에 Budget 경계값(Edge-case) 상황을 집중 검증하는 단위 테스트 케이스 보강
- [ ] `web/tests/e2e/system-alert.spec.ts`에 극단적으로 긴 텍스트 주입 및 모바일 뷰포트(너비 320px) 대응 E2E 레이아웃 붕괴 검증 로직 추가
- [ ] `web/scripts/test-port-timeout.sh` 테스트 실행 시, 명시적으로 3100번대 포트(예: 3100)를 활용하여 동시 락 선점 및 타임아웃 릴리즈 커버리지를 늘릴 것
- [ ] 알림 조회 쿼리의 페이징 안정성 보장을 위해 데이터베이스 `created_at` 단일 인덱스를 `created_at`, `id` 복합 인덱스 정렬로 마이그레이션 적용 검토
