```markdown
# PLAN

## 1. Task breakdown with priority

**[P0] 크리티컬 버그 수정 및 시스템 안정화**
- `api/app/services/workflow_engine.py`: 에이전트 Budget(예산) 한도 초과 시 즉각적인 실행 중단 및 Blocked 강제 전이 로직 구현
- `web/scripts/check-port.mjs`: 3000번대 포트 할당 경합 시 락 타임아웃 방어 및 비정상 종료 시 잔여 Lock 파일 정리 로직 추가
- `api/app/db/system_alert_model.py` 및 마이그레이션: 대량 로그 쿼리 병목 해소를 위한 `created_at` DESC 데이터베이스 인덱스 추가

**[P0] 보안 및 접근 제어 강화**
- `api/app/services/system_alerts.py`: 로그 및 알림 내 로컬 절대 경로 및 인증 토큰 문자열을 `***[MASKED]***`로 치환하는 마스킹 필터 로직 적용 (ReDoS 방어 고려)
- `api/app/api/workflows.py`: 워크플로우 중단/재개/실행 제어 API에 Role/HMAC 기반 인가(Authorization) 미들웨어 연동

**[P1] UI/UX 개선 및 예외 모서리 사례 처리**
- `web/src/components/SystemAlertWidget.tsx`: 긴 로그 텍스트로 인한 레이아웃 붕괴 버그 수정 (`overflow-y: auto`, `word-break: break-all` 적용)
- 백엔드 워크플로우 노드 반복 실패 시 단순 로깅을 넘어 Risk Score를 누적하고 상태 알림과 연동하는 예외 처리 구현

**[P2] 테스트 커버리지 보강**
- `api/tests/test_workflow_engine.py`: 예산 통제 및 강제 전이 단언(Assertion) 테스트 작성
- `api/tests/test_workspace_security.py`: 마스킹 필터 정규식 성능/예외 패턴 검증 및 워크플로우 API 인가(401/403) 통제 테스트 추가
- `web/tests/e2e/system-alert.spec.ts`: 모바일/데스크톱 뷰포트 전환 시 레이아웃 오버플로우 방지 확인용 E2E 테스트 추가
- `web/scripts/test-port-timeout.sh`: 3000번대 포트 다중 경합 및 타임아웃 락 해제 통합 테스트 쉘 스크립트 작성

**[고도화 플랜 (추가 기능)]**
1. **위험도(Risk Score) 배지 시각화**
   - **근거**: 백엔드에서 반복 실패에 대한 Risk Score를 누적하더라도, 대시보드에서 이를 텍스트로만 노출하면 즉각적인 심각성 인지가 어렵습니다. 장애 조치가 시급한 알림을 운영자가 빠르게 식별할 수 있도록 시각적 단서를 추가합니다.
   - **구현 경계**: `web/src/components/SystemAlertWidget.tsx` 내부에 한정하여, 수신된 Risk Score 수치에 따라 색상이 변하는 배지(Badge) UI를 추가합니다.

## 2. MVP scope / out-of-scope

**MVP scope:**
- 에이전트 실행 시 예산 초과에 의한 무한 루프 차단 및 안전한 Blocked 상태 전이 보장
- 로컬 환경 및 다중 워커 구동 시 3000번대 포트 할당 Deadlock 원천 차단
- 데이터베이스 `created_at` 역순 인덱스를 통한 알림 위젯 로딩 성능 확보
- 시스템 알림 위젯의 뷰포트 이탈 및 레이아웃 붕괴 버그 수정
- 민감 정보 누출 방지를 위한 정규식 기반 로그 마스킹 처리 및 제어 API 접근 인가
- 고도화 플랜으로 제안된 Risk Score 배지의 프론트엔드 시각화 연동

**Out-of-scope:**
- DevFlow Agent Hub의 ReactFlow 기반 시각적 워크플로우 빌더 전면 개편 (현재는 기존 엔진의 안정화 및 버그 픽스에 집중)
- 시스템 알림을 외부 메신저(Slack, Discord 등)로 포워딩하는 연동 기능
- 3000번대 로컬 포트 외의 프록시 네트워크 레이어 전면 재설계 (주어진 타임아웃 스크립트 개선으로 한정)

## 3. Completion criteria

- Budget을 초과하는 악의적/비정상 에이전트 동작이 워크플로우 엔진에 의해 즉시 차단됨을 테스트 코드로 입증해야 합니다.
- 민감한 경로 및 키값이 포함된 로그가 `***[MASKED]***` 문구로 치환되어 API 응답으로 내려오는지 검증해야 합니다.
- 비인가 사용자의 워크플로우 제어 API (`/api/workflows/*`) 호출 시 401/403 예외가 정확히 반환되어야 합니다.
- `SystemAlertWidget.tsx`에 극단적으로 긴 띄어쓰기 없는 문자열을 렌더링했을 때 부모 컨테이너를 벗어나지 않고 스크롤이 생성되어야 합니다.
- 다중 워커가 동시에 3000번대 포트 할당을 요청하더라도 Deadlock 없이 순차적 할당 또는 정상 타임아웃 해제가 이루어져야 합니다.
- DB 마이그레이션 실행 후 시스템 알림 조회 쿼리에 지연이 없어야 합니다.

## 4. Risks and test strategy

**Risks:**
- 로그 데이터 마스킹을 위한 정규 표현식이 비효율적으로 작성될 경우 대량 로그 인입 시 ReDoS(정규식 서비스 거부)로 인한 CPU 병목이 발생할 수 있습니다.
- 포트 할당 Lock 파일의 삭제 주기가 잘못 설정될 경우 정상적인 프로세스의 포트 점유까지 해제해버리는 동시성 이슈가 생길 수 있습니다.

**Test strategy:**
- **단위 테스트 (API)**: 마스킹 유틸리티 함수에 극단적으로 길고 복잡한 로그 페이로드를 주입하여 타임아웃이 발생하지 않는지 성능 테스트를 수행합니다.
- **통합 테스트 (Scripts)**: `test-port-timeout.sh`를 활용해 가상의 락 파일을 생성하고 3000번대 포트를 동시 선점하려는 시나리오를 자동화하여 검증합니다.
- **E2E 시각적 테스트 (Web)**: Playwright를 사용하여 데스크톱(1024px 이상) 및 모바일(320px 수준) 뷰포트에서 위젯 레이아웃이 무너지지 않는지와 Risk Score 배지의 렌더링 상태를 확인합니다.

## 5. Design intent and style direction

- **기획 의도**: 개발자 및 운영자가 백그라운드 에이전트의 실패 상황과 시스템 장애를 대시보드 위젯 하나만으로도 빠르고 정확하게 인지하여 선제적으로 대응할 수 있게 돕습니다.
- **디자인 풍**: 군더더기 없는 모던 대시보드형 뷰이며, 정보의 밀도를 높인 실용적인 디자인을 지향합니다.
- **시각 원칙**:
  - 알림 및 로그 텍스트는 가독성이 높은 고정폭(Monospace) 또는 산세리프(Sans-serif) 폰트를 적용합니다.
  - 마스킹 영역(`***[MASKED]***`)이나 높은 Risk Score는 사용자 시선을 끌 수 있도록 Warning(주황) 또는 Danger(빨강) 컬러로 하이라이트합니다.
  - 여백(마진/패딩)은 일관성 있게 유지하고 말줄임 처리 및 내부 스크롤바를 통해 시각적 정돈감을 줍니다.
- **반응형 원칙**: 모바일 우선(Mobile-First) 규칙을 적용하여 화면이 좁아져도 콘텐츠가 잘리지 않도록 컨테이너를 유연하게(Flex/Grid) 배치합니다.

## 6. Technology ruleset

- **플랫폼 분류**: web, api
- **web**: React 기반(Vite) 프로젝트 구조를 따르며, CSS 기반의 반응형 처리를 통해 레이아웃 버그를 수정합니다.
- **api**: FastAPI 기반 시스템으로, 워크플로우 엔진 로직 및 마스킹/인가 미들웨어를 Python으로 구현하고 DB는 Alembic을 통해 관리합니다.
- **실행 및 배포 환경**: 로컬 스크립트 실행 시 포트는 3000번대를 사용하며, 작업 완료 후 Docker 기반 Preview 구동 시 외부 포트는 7000-7099 대역을 준수합니다.
```
