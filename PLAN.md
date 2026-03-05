# PLAN

## 1. Task breakdown with priority

**P0 (Highest Priority)**
- **[엔진]** Engine v2 이관: `workflow_id` 기반 그래프 실행, Node 단위 상태 저장(`node_runs`) 및 재시도 기능 구현.
- **[제어 플레인]** Autopilot v0 구축: 외부 아이디어/지시 주입을 위한 Instruction Inbox, 실행 중단/재개/취소 상태 제어.
- **[에이전트]** Agent SDK 표준화: CLI 러너 템플릿화, 예산(Budget) 한계 및 폴백 로직 적용.
- **[버그 픽스/리뷰]** 프론트엔드 포트 스크립트(`check-port.mjs`) 레이스 컨디션 해결 (점유 유예 시간 및 재시도 간격 조정).
- **[최적화/리뷰]** 백엔드 알림 로그 조회 쿼리 최적화 (`created_at` 컬럼 기반 역순 스캔 인덱스 마이그레이션 적용).
- **[버그 픽스/리뷰]** SystemAlertWidget 컨테이너의 세로 방향 오버플로우 방지 및 CSS(`overflow-y: auto`, `max-height`) 수정.

**P1 (Medium Priority)**
- **[아티팩트]** Artifact Workspace: 파일 로그 중심에서 산출물 중심의 객체 메타데이터 저장소 전환.
- **[UI]** Visual Workflow Builder 기초 연동: ReactFlow를 이용한 노드/엣지 UI 구성.
- **[테스트/리뷰]** `web/tests/e2e/system-alert.spec.ts` 신설 및 데스크톱/모바일 뷰포트 Playwright 기반 시각적 테스트 작성.
- **[테스트/리뷰]** 3100번대 포트 고갈 상황을 가정한 BASH 타임아웃 시뮬레이터(`web/scripts/test-port-timeout.sh`) 구축.

**P2 (Low Priority)**
- **[확장 연동]** PR, Deploy 이벤트 연동 룰 엔진 및 외부 웹훅 추가 수신 파이프라인 구성.

---

## 2. MVP scope / out-of-scope

**MVP Scope**
- FastAPI 기반 백엔드를 활용한 내구성 있는 워크플로우 실행 엔진(Engine v2) 교체.
- 사용자가 새로운 지시를 주입하고 워크플로우를 중단/재개할 수 있는 대시보드 및 컨트롤 API.
- REVIEW.md에서 지적된 런타임 Race Condition 문제(포트 할당) 완화 및 프론트엔드 SystemAlertWidget 렌더링 안정성 확보.
- E2E 뷰포트 대응 UI 자동화 테스트와 로그 조회 DB 인덱싱 최적화.

**Out-of-scope**
- 분산된 Kubernetes 환경(EKS 등)을 전제로 한 프로덕션 레벨의 워커 클러스터링 관리.
- 노드 에디터의 완벽한 드래그 앤 드롭 및 시각적 변수 매핑(Phase 1.5로 연기).
- 별도의 대규모 메시지 브로커(Apache Kafka 등) 전면 도입 (현재의 DB / 기초 Redis 스트림 수준 유지).

---

## 3. Completion criteria

- 워크플로우 엔진이 새로운 지시(Instruction)를 주입받아 동적으로 노드 실행 계획을 수정 및 중단/재개할 수 있어야 한다.
- Agent SDK 기반의 터미널 명령어(CLI)가 정상적으로 아티팩트를 반환하고 DB에 상태(`node_runs`)를 기록해야 한다.
- 리뷰 지적 사항에 따라 포트 할당 스크립트 실행 시 중복 할당에 의한 타임아웃 오류가 E2E 테스트 레벨에서 발생하지 않아야 한다.
- 시스템 알림창에 장문의 로그가 연속 발생하더라도 지정된 뷰포트를 이탈하지 않고 스크롤 가능해야 하며, 관련 Playwright 시각적 테스트를 통과해야 한다.
- Preview 배포를 위한 도커 컨테이너 기동 시 7000~7099 범위의 외부 노출 포트가 문제없이 바인딩 되어야 한다.

---

## 4. Risks and test strategy

**리스크**
- **LLM 루프 비용:** Agentic 워크플로우가 목표에 도달하지 못하고 무한 재시도 늪에 빠져 API 호출 비용이 급증할 우려가 있음.
- **자원 경합:** 단일 노드 내 다중 워커가 동시에 도커 포트를 점유하려 할 때 Race Condition 발생 (리뷰 항목).

**테스트 전략**
- **시뮬레이션 검증:** 포트 할당 로직 고갈 시뮬레이션 BASH 스크립트(`test-port-timeout.sh`)를 통해 극단적 상황에서 타임아웃 예외가 정상 트리거되는지 확인.
- **시각적 회귀 테스트:** 데스크톱 및 모바일 모의 환경(Playwright)을 구성해 SystemAlertWidget의 긴 텍스트 단어 잘림(word-break) 및 컨테이너 높이 제한을 교차 검증.
- **예산 차단 테스트:** 워크플로우 실행 엔진에 임의의 재시도 예산(budget limit) 초과 조건을 부여해, 오케스트레이터가 안전하게 노드 실행을 중단하는지 단위 테스트 작성.
- **성능 검증:** 수만 건의 mock 에러 로그를 DB에 삽입 후 인덱스 마이그레이션 적용 전후의 `/api/logs` 조회 속도를 비교 테스트.

---

## 5. Design intent and style direction

- **기획 의도:** 이 기능은 사용자(엔지니어/관리자)가 24시간 자율 주행하는 워크플로우 시스템을 철저히 감시하고 언제든 통제할 수 있다는 높은 시스템 신뢰감과 제어 권한을 전달해야 합니다.
- **디자인 풍:** 다크 모드 친화적 대시보드형 (정보 밀도를 높이되 경고 상황을 즉각적으로 인지할 수 있는 카드 및 리스트 UI 기반).
- **시각 원칙:**
  - **컬러:** 차분한 모노톤 베이스(다크 그레이, 슬레이트) 바탕에 성공(Soft Green), 실패(Muted Red), 진행(Indigo) 등의 시그널 컬러를 최소한으로 사용하여 피로감을 덜어줍니다.
  - **패딩/마진:** 밀도 높은 터미널 데이터가 화면에 출력되는 점을 고려, 컴포넌트 간격을 여유롭게(최소 16px 마진) 확보하여 시각적 답답함을 해소합니다.
  - **타이포:** 코드 블록과 터미널 로그는 Monospace 폰트로, 컨트롤 버튼과 지시문은 명확한 가독성을 띄는 Sans-serif 폰트로 분리하여 위계를 세웁니다.
- **반응형 원칙:** 모바일 우선(Mobile First) 규칙을 적용하여, 관리자가 스마트폰 브라우저 상에서도 즉시 시스템 에러를 파악하고 런타임을 정지(Cancel)할 수 있도록 세로 스택형 레이아웃을 최우선으로 고려합니다.

---

## 6. Technology ruleset

- **플랫폼 분류:** web 및 api
- **web:** React 중심의 프레임워크 (Vite + React) 및 Playwright (E2E 테스트 기반).
- **api:** Python 기반 FastAPI 웹 프레임워크 및 SQLAlchemy 2.0 기반 ORM. 포트 충돌 방지 및 워커/서버 기동 시 로컬 실행 포트는 3000번대 범위를 사용합니다(예: 3000번 API 서버 등). Preview 외부 노출 포트는 7000-7099 범위를 따릅니다.

---

## 7. 고도화 플랜 (REVIEW 반영)

REVIEW.md에 나열된 TODO 사항을 100% 반영하여 다음 고도화 플랜을 수립합니다.

**반영된 기본 TODO 항목**
- 포트 할당 점유 유예 추가 (`web/scripts/check-port.mjs`)
- `created_at` DESC 스캔 인덱스 백엔드 스키마 추가 및 마이그레이션 (`api/app/db/system_alert_model.py` 등)
- 모바일/데스크톱 뷰포트 UI Playwright 시각 테스트 작성 (`system-alert.spec.ts`)
- 알림 컴포넌트 CSS 오버플로우 방어 속성 적용 (`overflow-y: auto`, `max-height`)
- 극단적 포트 고갈 타임아웃 테스트 스크립트 구축 (`test-port-timeout.sh`)

**자연스럽게 연결되는 추가 기능 확장 (보안 강화)**
- **시스템 알림 로그 내 민감 정보 마스킹 (Log Sanitization)**
  - **근거:** 리뷰 문서의 Security concerns 항목에서 알림 페이로드 내 인프라 경로, 토큰 등의 민감 정보가 렌더링 됨을 지적했습니다. 이를 근본적으로 해결하기 위해 렌더링 안정성뿐만 아니라 컨텐츠 자체의 필터링이 요구됩니다.
  - **구현 경계:** FastAPI 백엔드 알림 전송부 서비스 로직(`SystemAlertLog` 저장 전) 혹은 프론트엔드 알림 수신부에서 정규표현식을 사용하여 `Bearer [A-Za-z0-9\-\._~+/]+=*` 패턴 및 절대 경로 패턴(예: `/home/docker/`, `/root/`)을 `***[MASKED]***` 문자열로 치환하는 유틸리티 파이프라인만 간결하게 추가합니다. 과도한 NLP 기반 검출은 제외합니다.
