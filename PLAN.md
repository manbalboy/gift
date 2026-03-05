# PLAN

## 1. Task breakdown with priority

기획 문서(SPEC.md)와 리뷰(REVIEW.md)의 요구사항을 통합하여 산정한 작업 목록 및 우선순위입니다.

**Priority High (P0)**
- **워크플로우 엔진 V2 이관**: `workflow_id` 기반 실행, `ExecutorRegistry` 도입, 상태 재개를 위한 `node_runs` 기록 (백엔드 API).
- **Autopilot V0 및 예산/무한루프 제어**: 장기 실행 중단/재개/지시 주입 구현 및 반복 실행 시 Agent 강제 차단(Blocked) 로직 구현.
- **포트 할당 및 락(Lock) 충돌 해결**: `check-port.mjs`에 3100번대(3100~3199) 포트 경합 시 타임아웃 보장 및 잔여 락 해제 로직 추가.
- **보안 및 인가(Authorization) 연동**: `system_alerts.py`에 로컬 경로/인증 토큰 치환 로직(마스킹 필터) 적용 및 `workflows.py` 제어 API에 Role 기반 또는 HMAC 인가 미들웨어 연동.
- **백엔드 단위 테스트 강화**: `test_workflow_engine.py`에 예산 초과 차단 동작에 대한 단언(Assertion) 테스트 작성.

**Priority Medium (P1)**
- **UI 레이아웃 및 알림 버그 수정**: 대시보드의 `SystemAlertWidget.tsx` 뷰포트 오버플로우를 수정하고(`overflow-y: auto`, `word-break: break-all` 적용), 워크플로우 동일 노드 반복 실패 시 Risk Score를 연동하여 알림(Warning) 표출.
- **아티팩트 워크스페이스**: 산출물을 1급 객체로 다루기 위한 API 확장(로그 중심에서 아티팩트 중심으로 전환).
- **Visual Workflow Builder**: ReactFlow 기반의 워크플로우 시각 편집기 및 검증 플로우 연동.
- **테스트 및 E2E 고도화**: `test-port-timeout.sh`로 포트 타임아웃 통합 검증, `system-alert.spec.ts`에 데스크톱/모바일 뷰포트 교차 시각적 회귀(Visual Regression) 테스트 추가.
- **데이터베이스 인덱스 성능 튜닝**: `system_alert_model.py`의 `created_at` 컬럼 내림차순 정렬 조회를 위한 Alembic 인덱스 스크립트 작성 및 반영.

**Priority Low (P2)**
- **외부 연동(Integrations) 확장**: GitHub PR/Deploy 이벤트 등 Issue 외 이벤트를 수신하는 Rule Engine 및 Event Bus 구성.

---

## 2. MVP scope / out-of-scope

**MVP scope**
- FastAPI 기반 내구성 있는 워크플로우 엔진 V2 (체크포인트, 부분 재시도 포함).
- React 대시보드를 통한 시각적 노드 빌더, 상태 모니터링 및 즉각적인 중단/재개 제어.
- 무한 루프 차단(Budget Limit), 포트 데드락 회피, 로그 마스킹을 포함한 운영 안정화 및 보안 패치 적용.
- 전체 스택의 로컬 구동 포트를 3000번대 영역 내에서 안정적으로 확보 및 해제하는 기능.

**Out-of-scope**
- 분산 서버(Kubernetes, 다중 노드 클러스터) 상에서의 오토 스케일링 완벽 대응.
- 수천 줄 규모의 초당 실시간 로그를 처리하기 위한 고성능 외부 인프라(ElasticSearch 등) 도입 (현재는 DB 기반).
- GitHub 외 10여 개 이상의 다양한 외부 SaaS(Jira, Slack 등) 네이티브 통합.

---

## 3. Completion criteria

- 대시보드 UI를 통해 `workflow_id` 기반 워크플로우를 시각적으로 편집, 실행, 중단, 재개할 수 있다.
- 에이전트 노드가 설정된 루프 횟수나 자원 예산을 초과할 경우, 무한 대기하지 않고 명시적으로 Blocked 처리되며 이에 대한 단위 테스트가 통과한다.
- 긴 알림 텍스트가 `SystemAlertWidget` 영역을 벗어나지 않고 줄바꿈/스크롤되며, 화면 크기가 줄어들어도 레이아웃 붕괴가 일어나지 않는다.
- 로컬 또는 다중 워커 구동 시 3100번대 포트 할당 과정에서 무한 대기 레이스 컨디션이 발생하지 않고, 실패 시 타임아웃과 함께 락 파일이 안전하게 해제된다.
- 시스템 알림 내 절대 경로 및 시크릿 문자열이 API를 거치며 `***[MASKED]***` 형태로 안전하게 치환되어 프론트엔드에 전달된다.
- 권한 없는 사용자가 워크플로우 제어 API를 호출하면 인가 레이어에 의해 401/403 응답으로 차단된다.

---

## 4. Risks and test strategy

**Risks**
- **자원 고갈**: LLM 에이전트 무한 루프로 인한 요금 발생 및 백엔드 자원 고갈 위험.
- **동시성 버그**: 워커 동시 실행에 따른 포트 할당 락(Lock) 경합 및 시스템 프리징.
- **성능 저하**: 로그 유입량이 폭증할 때 정규식 기반 치환 과정의 CPU 병목 현상 및 로그 조회 지연.

**Test strategy**
- **Backend Test (`api/tests/`)**: 
  - `test_workflow_engine.py`: 에이전트의 예산(Budget) 한도 도달 시 강제 중지 로직 단위 테스트 구현.
  - 마스킹 필터 로직에 대해 다양한 예외 패턴(모서리 사례)을 주입하여 치환 정확도 및 정규식 성능(타임아웃) 검증.
  - 제어 라우터 미들웨어의 인가 성공/실패 단위 테스트 구성.
- **Frontend Test (`web/tests/`)**: 
  - `system-alert.spec.ts`: Playwright를 활용해 여러 뷰포트 폭(모바일/데스크톱)에서 컴포넌트의 오버플로우가 없는지 시각적 회귀 E2E 검증.
- **Infrastructure Test (`scripts/`)**: 
  - `test-port-timeout.sh`: 의도적으로 포트 경합 상황을 발생시켜 포트 할당 스크립트가 멈추지 않고 적절히 락을 해제하는지 통합 시뮬레이션 확인.

---

## 5. Design intent and style direction

- **기획 의도**: 개발자나 사용자가 자동화 에이전트의 상태를 한눈에 파악하고, 예측 불가한 에이전트의 폭주를 방지하며, 필요 시 언제든지 안전하게 멈추거나 재개할 수 있는 "통제 가능한 자동화" 경험을 제공.
- **디자인 풍**: 모던 대시보드 및 터미널 룩. 불필요한 장식 요소를 배제하고 시스템 상태 가시성에 집중하는 정보 중심 UI.
- **시각 원칙**:
  - **컬러**: 어두운 배경 위에 상태 지시 컬러(Running: 초록, Paused/Warning: 주황, Blocked/Error: 빨강)를 사용해 터미널 환경에 익숙한 색상 대비를 유지.
  - **패딩/마진**: 8px 배수 시스템을 준수하여 정보 그룹 간의 시각적 분리를 명확히 함.
  - **타이포그래피**: 로그 스니펫과 코드 관련 출력은 Monospace(고정폭) 폰트를 적용하고, 상태 레이블 및 제목은 가독성 높은 폰트 적용.
- **반응형 원칙**: 
  - 모바일 우선(Mobile First). 모바일에서는 패널 단위 세로 스크롤로 배치하고, 화면이 넓어지면 플렉스/그리드를 활용한 다단 구조로 자동 재조정. 
  - 긴 텍스트와 로그 데이터는 창 크기를 강제로 늘리지 못하도록 `word-break: break-all` 및 박스 내 독립 스크롤 영역으로 제한.

---

## Technology ruleset

- **플랫폼 분류**: web / api
- **web**: React 기반 (Vite, Playwright, ReactFlow 활용).
- **api**: FastAPI 기반 (비동기 처리, 워크플로우 DAG 실행, SQLAlchemy 데이터베이스).
- 실행 스크립트 및 테스트 구동 시 포트는 충돌 회피를 위해 **3000번대(특히 3100~3199)**를 사용.

---

## 고도화 플랜 (TODO 반영 완료)

REVIEW.md의 분석 결과를 바탕으로 아래의 고도화 구현 과제를 우선적으로 실행합니다.

1. **포트 충돌 완화 및 자원 정리**
   - 변경 후보: `web/scripts/check-port.mjs`, `web/scripts/test-port-timeout.sh`
   - 영향 범위 및 내용: 3100번대 포트 병렬 할당 시 경합 방지를 위해 락 타임아웃을 강제하고 잔여 Lock 파일을 소거하는 로직 적용.
2. **보안 마스킹 및 제어 API 인가 연동**
   - 변경 후보: `api/app/services/system_alerts.py`, `api/app/api/workflows.py`
   - 영향 범위 및 내용: 로컬 호스트 경로 및 비밀키 문자열을 `***[MASKED]***`로 정규식 치환하고, 워크플로우 제어 API 라우터에 Role/HMAC 보안 미들웨어 추가.
3. **대시보드 UI 버그 픽스 및 시각 E2E 커버리지 확대**
   - 변경 후보: `web/src/components/SystemAlertWidget.tsx`, `web/tests/e2e/system-alert.spec.ts`
   - 영향 범위 및 내용: CSS 속성(`overflow-y: auto`, `word-break`)을 통한 레이아웃 깨짐 버그 수정 및 교차 뷰포트 검증 테스트 구현.
4. **워크플로우 엔진 무한 루프 차단(Blocked) 도입**
   - 변경 후보: `api/app/services/workflow_engine.py`, `api/tests/test_workflow_engine.py`
   - 영향 범위 및 내용: 노드 실행 예산 초과 시 즉각 Blocked 상태로 전이시키는 단언(Assertion)을 추가하고, 동일 오류 반복 시 Risk Score를 누적시켜 알림(Warning) 표출.
5. **로그 시스템 데이터베이스 조회 최적화**
   - 변경 후보: `api/app/db/system_alert_model.py` 및 Alembic 마이그레이션 스크립트
   - 영향 범위 및 내용: 로그 최신순 조회 성능 병목 해소를 위한 `created_at` DESC 인덱스 반영.

**추가 고도화 기능 (인접 기능 확장)**
- **A. 노드별 부분 재시도 (Node-level Retry) UI 연동**: 
  - 근거: 엔진에서 Blocked 처리된 이후, 시스템 알림을 통해 원인을 수정한 사용자가 전체 워크플로우를 재시작하지 않고 특정 노드부터 재개(Retry-Node)할 수 있게 하여 사용자 경험 극대화. UI의 알림 위젯 수정과 자연스럽게 연계됨.
- **B. 마스킹 패턴 동적 업데이트 기반 마련**: 
  - 근거: 민감 정보 마스킹 정규식을 코드 내 하드코딩하지 않고 환경 변수나 설정 파일에서 동적으로 로딩하게 처리함으로써, 향후 새로운 토큰 패턴 출현 시 백엔드 재배포 없이 보안 룰을 즉각 확장할 수 있게 함.
