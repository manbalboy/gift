# REVIEW

현재 저장소의 기획(SPEC.md) 및 개발 계획(PLAN.md)을 바탕으로 시스템 전반의 상태를 검토한 결과입니다. 

## Functional bugs
- **포트 할당 레이스 컨디션 및 락(Lock) 고아 현상**: 다중 워커 실행 환경(`check-port.mjs`)에서 3100번대(3100~3199) 포트를 병렬로 할당받을 때 경합이 발생할 수 있습니다. 또한, 프로세스 강제 종료 시 생성된 락 파일이 해제되지 않아 영구적인 포트 고갈 현상을 유발할 위험이 존재합니다.
- **UI 컴포넌트 레이아웃 오버플로우**: 대시보드의 `SystemAlertWidget`(`web/src/components/SystemAlertWidget.tsx`)에서 텍스트 양이 많을 경우 뷰포트를 벗어나거나 레이아웃이 깨지는 문제가 있습니다. 긴 문자열의 줄바꿈 및 영역 내 스크롤 제어가 누락되었습니다.
- **무한 루프 방지 미비**: 에이전트 실행 시 LLM의 반복 오류나 무한 재시도로 인한 실행 예산(Budget) 초과 상황에 대해 명시적인 제동(Blocked) 로직이 불완전하여 자원 낭비를 유발할 수 있습니다.

## Security concerns
- **민감 정보 평문 노출 (Log Sanitization 부재)**: 에이전트 및 시스템 알림 로그(`api/app/services/system_alerts.py`) 기록 시 호스트의 절대 경로(예: `/home/docker/...`)나 인증 토큰 같은 민감한 정보가 마스킹(`***[MASKED]***`) 처리 없이 데이터베이스에 저장되고 프론트엔드로 노출될 취약점이 존재합니다.
- **제어 API 인가(Authorization) 누락**: 워크플로우 중단, 재개 및 지시 주입을 담당하는 핵심 제어 API(`api/app/api/workflows.py`)에 안전한 인가(Role 기반 또는 HMAC 토큰 검증) 로직이 누락되어 인가되지 않은 외부 사용자가 워크플로우를 조작할 수 있는 위험이 있습니다.

## Missing tests / weak test coverage
- **포트 경합 및 타임아웃 E2E 시뮬레이션 부족**: 3100번대 포트 고갈 상황을 의도적으로 재현하고 정상적으로 타임아웃 종료되는지 확인하는 통합 테스트(`test-port-timeout.sh`) 커버리지가 미흡합니다.
- **뷰포트 교차 E2E 시각적 테스트 부재**: 데스크톱 및 모바일 화면 크기에서 `SystemAlertWidget`의 레이아웃 안정성을 검증하는 Playwright E2E 테스트(`web/tests/e2e/system-alert.spec.ts`)가 구현되어 있지 않습니다.
- **무한 루프 차단 정책 단위 테스트 부재**: 워크플로우 엔진이 지정된 루프 횟수나 시간을 초과했을 때 노드 실행을 중단하는지 검증하는 단위 테스트(`api/tests/test_workflow_engine.py`)가 없습니다.
- **정규식 치환 모서리 사례(Edge Case) 검증 미흡**: 복잡하고 다양한 형태의 민감 정보를 식별하고 치환하는 마스킹 필터 로직에 대한 견고한 백엔드 단위 테스트가 필요합니다.

## Edge cases
- **외부 프로그램에 의한 포트 사전 점유**: 테스트나 로컬 구동 시 3100번대 포트가 이미 다른 프로세스에 의해 점유되어 있을 경우, 할당 로직이 무한 대기하거나 예기치 않게 실패하는 간헐적 불안정성이 존재합니다.
- **대규모 로그 마스킹 정규식 성능 저하**: 수천 줄 단위의 로그가 유입될 때 실시간 정규식 치환을 수행할 경우 백엔드 CPU 오버헤드로 인한 처리 지연이 발생할 수 있습니다.
- **대시보드 로그 역순 조회 타임아웃**: `system_alert_logs` 데이터가 누적되었을 때 `created_at` 기준의 정렬 인덱스가 없으면, 대시보드의 최근 로그 조회 API가 성능 병목을 일으킬 수 있습니다.

---

## TODO

- [ ] `web/scripts/check-port.mjs` 및 `test-port-timeout.sh`를 수정하여 3100번대 포트 경합 시 타임아웃 보장 및 잔여 Lock 파일 해제 로직 구현
- [ ] `api/app/services/system_alerts.py`에 정규식 기반으로 로컬 경로 및 인증 토큰을 `***[MASKED]***`로 치환하는 마스킹 필터 추가
- [ ] `web/src/components/SystemAlertWidget.tsx`에 `overflow-y: auto`, `max-height`, `word-break: break-all` CSS 속성 추가
- [ ] `web/tests/e2e/system-alert.spec.ts` 파일에 데스크톱 및 모바일 뷰포트 크기를 적용한 시각적 회귀(Visual Regression) 테스트 작성
- [ ] `api/tests/test_workflow_engine.py` 파일에 Budget 초과로 인한 Agent 강제 차단(Blocked) 동작 단언(Assertion) 테스트 구현
- [ ] `api/app/db/system_alert_model.py` 테이블의 내림차순 조회 성능을 올리기 위한 `created_at` 컬럼 Alembic 인덱스 마이그레이션 스크립트 작성 및 반영
- [ ] `api/app/api/workflows.py` 내 워크플로우 제어(중지/재개/주입) 라우터에 Role 권한 또는 HMAC 인가 미들웨어 연동
- [ ] `api/app/services/workflow_engine.py`에 동일 노드 실패 반복 시 내부 Risk Score를 증가시키고 대시보드 알림(Warning)과 연동하는 로직 추가
