# REVIEW

## Functional bugs
- **대시보드 알림 위젯 레이아웃 붕괴**: `SystemAlertWidget.tsx`에서 텍스트 길이가 길어질 경우 뷰포트를 벗어나 화면 레이아웃이 깨지는 문제가 발생합니다. 긴 로그 텍스트를 처리하기 위한 `word-break: break-all` 및 내부 스크롤(`overflow-y: auto`) 처리가 누락되어 있습니다.
- **포트 할당 무한 대기(Deadlock)**: 다중 워커 구동 또는 로컬 실행 시 포트 할당 과정(`check-port.mjs`)에서 락(Lock) 경합이 발생하여 무한 대기에 빠지거나 시스템이 프리징되는 현상이 있습니다.
- **에이전트 무한 루프 및 자원 고갈**: 워크플로우 엔진에서 LLM 에이전트가 예산(Budget) 한도나 설정된 루프 횟수를 초과했을 때 강제로 실행을 중단(Blocked 처리)하는 로직이 정상적으로 동작하지 않아 자원 고갈 위험이 있습니다.
- **로그 조회 성능 저하**: `system_alert_model.py`에서 시스템 알림과 로그를 최신순으로 조회할 때 `created_at` 컬럼에 대한 내림차순(DESC) 인덱스가 없어 데이터 누적 시 심각한 성능 병목이 발생할 수 있습니다.

## Security concerns
- **민감 정보 노출**: 에이전트 실행 로그나 시스템 알림 내에 로컬 디렉토리 절대 경로 및 API 인증 토큰 등 시크릿 문자열이 그대로 노출됩니다. 프론트엔드로 데이터를 전달하기 전에 `***[MASKED]***` 형태로 치환하는 보안 마스킹 필터 로직이 필요합니다.
- **워크플로우 제어 API 인가 누락**: 워크플로우의 중단, 재개, 실행 등을 담당하는 제어 API(`workflows.py`) 라우터에 Role 기반 또는 HMAC 서명 검증과 같은 인가(Authorization) 미들웨어가 적용되어 있지 않아, 권한이 없는 사용자나 비정상적인 접근에 의해 워크플로우가 조작될 위험이 있습니다.

## Missing tests / weak test coverage
- **백엔드 예산 통제 및 마스킹 테스트 누락**: `test_workflow_engine.py`에 에이전트 예산 초과 시 Blocked 상태로 정상 전이되는지 확인하는 단언(Assertion) 테스트가 부족합니다. 또한, 보안 마스킹 필터 로직에 대한 다양한 예외 패턴 검증 테스트가 필요합니다.
- **API 인가 단위 테스트 누락**: 라우터 미들웨어의 인가 성공 및 실패(401/403 응답)를 검증하는 단위 테스트가 구성되어 있지 않습니다.
- **프론트엔드 시각적 회귀 테스트(E2E) 부족**: `system-alert.spec.ts`에 데스크톱 및 모바일 뷰포트 교차 시 위젯의 오버플로우나 레이아웃 깨짐이 없는지 확인하는 Playwright 기반 시각적 회귀 검증이 누락되어 있습니다.
- **인프라 포트 타임아웃 통합 검증 누락**: 의도적으로 3100번대 포트(예: 3100, 3101) 경합 상황을 발생시켜 할당 스크립트가 타임아웃을 발생시키고 락을 안전하게 해제하는지 시뮬레이션하는 `test-port-timeout.sh` 통합 테스트가 필요합니다.

## Edge cases
- **반복적인 동일 노드 실패 처리**: 특정 워크플로우 노드에서 동일한 오류가 연속으로 발생할 경우, 단순 실패 로그만 남기는 것이 아니라 Risk Score를 누적하여 사용자에게 강력한 경고(Warning)를 표출하는 예외 처리가 필요합니다.
- **비정상 종료 시 잔여 Lock 파일**: 워커가 비정상적으로 크래시되거나 강제 종료되었을 때, 포트 점유를 위해 생성된 Lock 파일이 소거되지 않고 남아있어 이후 3100~3199 범위 포트 할당이 영구적으로 차단되는 모서리 사례가 있습니다.
- **마스킹 정규식 성능 저하(ReDoS 위험)**: 대량의 로그 유입이 폭증할 때 정규식 기반 치환 과정에서 CPU 병목 현상이 발생하여 알림 조회가 지연될 수 있으므로, 정규식 최적화 및 타임아웃 처리가 고려되어야 합니다.

---

## TODO

- [ ] `web/src/components/SystemAlertWidget.tsx` 레이아웃 버그 수정 (`overflow-y: auto`, `word-break: break-all` 적용)
- [ ] `api/app/services/workflow_engine.py`에 예산(Budget) 한도 초과 시 에이전트 Blocked 강제 전이 로직 구현
- [ ] `api/app/services/system_alerts.py`에 로컬 경로 및 인증 토큰 문자열을 `***[MASKED]***`로 치환하는 마스킹 필터 적용
- [ ] `api/app/api/workflows.py` 워크플로우 제어 API에 Role/HMAC 인가 미들웨어 연동
- [ ] `web/scripts/check-port.mjs`에 3100번대 포트 할당 시 락 타임아웃 및 잔여 Lock 파일 정리 로직 추가
- [ ] `api/app/db/system_alert_model.py` 및 Alembic 마이그레이션을 통해 `created_at` DESC 데이터베이스 인덱스 추가
- [ ] 워크플로우 노드 반복 실패 시 Risk Score 누적 및 상태 알림 연동 기능 구현
- [ ] `api/tests/test_workflow_engine.py`에 예산 통제 로직 단언(Assertion) 테스트 작성
- [ ] `web/tests/e2e/system-alert.spec.ts`에 다양한 뷰포트 크기에 대한 레이아웃 오버플로우 E2E 테스트 추가
- [ ] `web/scripts/test-port-timeout.sh`를 작성하여 3100~3199 포트 경합 및 락 해제 통합 테스트 구현
- [ ] `api/tests/test_workspace_security.py` (또는 관련 테스트 파일)에 마스킹 필터 성능 및 예외 패턴 테스트, 인가(401/403) 통제 테스트 추가
