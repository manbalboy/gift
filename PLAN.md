> [!IMPORTANT]
> 우선순위: `ex-code` 내부 코드를 분석해 현재 프로젝트에 모든 기능을 구현한다.

```markdown
# PLAN

## 1. Task breakdown with priority

`SPEC.md`의 워크플로우 엔진 고도화 목표와 `REVIEW.md`에서 식별된 결함 및 보안 이슈를 바탕으로 작업을 세분화합니다.

- **P0: 코어 엔진 및 안정성 강화 (Backend)**
  - 변경 파일: `api/app/api/webhooks.py`, `api/app/services/workflow_engine.py`
  - 작업 내용: 잘못된 웹훅 페이로드 검증 강화(HTTP 422 예외 처리). 워크플로우 강제 취소 시 `asyncio.CancelledError`를 정상 처리하여 비동기 자원 해제 및 SSE 제너레이터 안전 종료 구현. DAG 순회 시 연결된 엣지가 없는 단일/독립 노드도 실행 큐에 포함되도록 로직 개선.
- **P0: 휴먼 게이트 동시성 제어 및 보안 체계 (Backend)**
  - 변경 파일: `api/app/api/workflows.py`, `api/app/models/`, `api/app/db/`
  - 작업 내용: 휴먼 게이트 API에 Role 기반 인가(RBAC) 적용 및 403 예외 반환. 다수 사용자 동시 조작에 따른 Race Condition 방지를 위해 DB 트랜잭션 Lock 적용. 휴먼 게이트 승인/반려 주체, 시간, 페이로드를 기록하는 Audit Log 스키마 설계 및 API 연동.
- **P1: 프론트엔드 UI/UX 및 네트워크 안정성 (Web)**
  - 변경 파일: `web/package.json`, `web/src/services/`, `web/src/components/`, `web/src/App.tsx`
  - 작업 내용: 실행 포트를 명시적으로 프론트엔드 `3100`, 백엔드 API `3101`로 설정. 프론트엔드 SSE 커넥션 단절 시 서버 부하(Thundering Herd)를 막기 위해 Jitter를 포함한 지수적 백오프(Exponential Backoff) 재연결 로직 구현. 재연결 시도 시 상단 배너 노출. 403 권한 에러 수신 시 Fallback 안내 모달 및 Audit Log 확인용 Read-Only 뷰어 모달 컴포넌트 추가.
- **P2: 테스트 커버리지 및 자동화 (Tests)**
  - 변경 파일: `api/tests/`, `web/tests/e2e/`
  - 작업 내용: 백엔드 워크플로우 자원 반환, 422 및 403 예외 처리 동작을 확인하는 Pytest 단위/통합 테스트 작성. `http://localhost:3100` 환경에서 프론트엔드 휴먼 게이트 동작 및 에러 UI를 검증하는 Playwright 기반 E2E 테스트 구현.

## 2. MVP scope / out-of-scope

- **MVP Scope**
  - 워크플로우 엔진의 내결함성(Fault Tolerance) 확보 및 메모리 누수 방지.
  - 휴먼 게이트 로직의 보안성(RBAC, 동시성 Lock, Audit Log) 강화 및 화면 연동.
  - SSE 스트림 안정화 및 지수적 백오프 기반의 부드러운 클라이언트 재연결 UX 달성.
  - 프론트엔드 Web 포트 3100, API 포트 3101 고정 및 통신 안정성 확보.
- **Out-of-Scope**
  - n8n 수준의 완전한 Visual Workflow Builder(ReactFlow 기반 에디터 기능) 완성은 MVP 이후 단계로 연기.
  - 다중 쿠버네티스(K8s) 클러스터 기반 스케일아웃 및 Temporal과 같은 거대 외부 오케스트레이션 엔진 전면 도입.
  - GitHub 인테그레이션을 넘어선 Jira, Slack 양방향 액션 등 타 플랫폼의 딥 연동.

## 3. Completion criteria

- **Backend API**: 
  - 잘못된 페이로드 전송 시 HTTP 422 에러가 정확히 반환될 것.
  - 취소된 워크플로우에 할당된 모든 비동기 태스크 및 제너레이터 자원이 서버에 남지 않고 반환될 것.
  - 권한이 없는 사용자가 휴먼 게이트 승인 API 호출 시 403 에러가 반환될 것.
  - 병렬 테스트 환경에서 동일 휴먼 게이트에 대한 동시 승인/반려 요청이 충돌 없이 단일 트랜잭션으로 처리될 것.
- **Frontend Web**:
  - SSE 연결 단절 상황을 강제했을 때 Jitter가 포함된 백오프 알고리즘에 따라 네트워크 상태 배너를 띄우고 재연결에 성공할 것.
  - 403 권한 에러 응답 수신 시, 사용자가 현 상황을 인지할 수 있는 Fallback 안내 모달이 화면에 노출될 것.
  - 휴먼 게이트 모달에서 과거 의사결정 내역(Audit Log)을 조회할 수 있을 것.
- **Testing**:
  - 신규 작성된 백엔드 Pytest 및 프론트엔드 Playwright E2E 테스트 코드가 CI 환경에서 100% 통과할 것.

## 4. Risks and test strategy

- **Risks**
  - **Thundering Herd 병목**: 서버 재시작 직후 다수 클라이언트가 일시에 재연결을 시도하여 API 부하 발생 위험. (Jitter 난수 기반 백오프로 분산시켜 완화)
  - **DB 트랜잭션 데드락**: 휴먼 게이트 동시성 Lock 적용 시 타 트랜잭션과의 경합으로 인한 데드락 발생 위험. (최소 범위의 Row-level Lock 적용 및 적절한 타임아웃 튜닝으로 완화)
  - **비동기 컨텍스트 유실**: `asyncio.CancelledError` 처리 시 기존 데이터의 무결성이 훼손될 위험.
- **Test Strategy**
  - **Backend (Pytest)**: Mock 객체를 활용하여 비동기 취소 시나리오 강제 유발 후 자원 해제 여부 검증. RBAC 인가 에러 및 422 데이터 검증 테스트. 동시성 Lock 동작 확인을 위한 병렬 비동기 요청 단위 테스트.
  - **Frontend (Playwright)**: `http://localhost:3100` 로컬 환경에서 브라우저 컨텍스트를 제어하며 오프라인 전환/복구 시나리오를 통한 재연결 배너 표시 검증. 승인/반려 클릭 및 권한 부족 모달 노출 여부 자동 검증.

## 5. Design intent and style direction

- **기획 의도**: 복잡한 워크플로우 실행 상태와 AI 에이전트의 로그를 투명하게 관측하고, 휴먼 게이트의 의사결정을 안전하고 명확하게 수행할 수 있는 "신뢰성 높은 SDLC 관리 경험"을 제공합니다.
- **디자인 풍**: 대시보드형 디자인. 정보 밀도가 높은 테이블 및 상태 트리를 깔끔하게 배치하는 모던/미니멀 스타일을 지향합니다.
- **시각 원칙**:
  - 컬러: 시스템의 현재 상태를 직관적으로 파악할 수 있는 시맨틱 컬러(완료: Green, 대기/휴먼게이트: Amber, 실패: Red, 진행 중: Blue)를 적극 활용합니다.
  - 패딩/마진: 정보 위계에 맞춰 컴포넌트 내부 패딩은 촘촘하게, 논리적 섹션 간 마진은 여유롭게 두어 대비감을 줍니다.
  - 타이포: 터미널 로그 및 코드 뷰 영역은 고정폭 폰트(Monospace)를 사용하여 가독성을 극대화하고, 일반 UI 텍스트는 가독성 높은 산세리프 폰트를 적용합니다.
- **반응형 원칙**: 모바일 우선(Mobile-First) 규칙을 적용합니다. 데스크톱에서는 다단 레이아웃(좌측 노드 캔버스, 우측 세부 로그 및 Audit Log)으로 확장 제공하며, 모바일 화면에서는 휴먼 게이트 승인 패널 및 Fallback UI를 하단 시트(Bottom Sheet) 형태로 띄워 화면 공간을 절약합니다.

## 6. Technology ruleset

- **플랫폼 분류**: web 및 api
- **web**: React 라이브러리 기반 프레임워크(React.js 또는 Next.js)로 계획.
- **api**: FastAPI 기반으로 계획.

## 7. 고도화 플랜 (TODO 반영 외 인접 확장 기능)

현재 리뷰에 명시된 TODO를 선행 완료한 후 구현할 수 있는 가장 자연스러운 인접 기능입니다.

- **추가 기능 1: 휴먼 게이트 장기 대기 시 Slack/메신저 자동 알림 연동**
  - 근거: 휴먼 게이트 상태에서 담당자 인지 지연으로 인한 SDLC 병목을 방지하기 위함입니다. 새로 구축되는 Audit Log 및 403 방어 로직과 결합하여, 권한이 있는 사용자에게만 웹훅 기반 알림을 보내도록 확장합니다.
  - 범위: `api/app/services/` 내 외부 메신저 연동 모듈 추가 및 `approval_pending` 상태 지속 시 알림 발송 크론 잡(또는 백그라운드 태스크) 구성.
- **추가 기능 2: 노드 및 휴먼 게이트 소요 시간(Time-to-Resolve) 시각화 위젯**
  - 근거: Jitter 로직 및 Audit Log 추가로 시계열 상태 데이터가 확보되므로, 이를 프론트엔드 대시보드의 상태 배너 주변에 노드별 소요 시간 차트로 보여주어 병목 구간 분석을 용이하게 합니다.
  - 범위: `web/src/components/`에 소요 시간 요약 위젯 추가. 백엔드에서 집계 API 추가 제공.
```
