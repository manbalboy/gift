```markdown
# PLAN

## 1. Task breakdown with priority

본 계획은 DevFlow의 24/7 Autopilot 체계 구현이라는 장기 목표(`SPEC.md`)를 지향하며, 현재 시스템의 불안정성을 해소하기 위한 `REVIEW.md`의 수정 및 고도화 작업을 최우선(P0)으로 배치합니다.

### [P0] REVIEW.md 기반 결함 수정 및 안정성 확보 (고도화 플랜)
- **API 멱등성 및 상태 전이 개선**
  - `api/app/api/workflows.py` 내 `/resume` 엔드포인트에 비동기 동시성 제어(락) 적용. 동시 요청 시 락 경합 에러(`400`) 방지 및 `200 OK` 또는 `409 Conflict` 반환.
  - `api/app/services/workflow_engine.py`에서 시스템/파일 I/O 예외 발생 시 프로세스 크래시를 방지하고 `Run` 및 `NodeRun` 상태를 `failed`로 안전하게 DB에 커밋하도록 예외 처리.
- **설정 및 자원 접근 안전성 확보**
  - `api/app/core/config.py`의 `DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS` 등 환경변 파싱 시 포괄적인 예외 처리를 추가하고 안전한 기본값으로 폴백.
  - `api/app/services/workspace.py` 내 파일 읽기/쓰기 시 OS Lock 방어 로직 및 구조화된 에러 로깅 적용.
- **테스트 커버리지 확충**
  - **Unit Test:** `config.py` 설정 파싱 함수의 엣지 케이스(극한의 특수문자, 빈 문자열 등) 검증.
  - **Integration Test:** `/resume` 다중 동시 호출 멱등성 검증, 에러 시 상태 DB 커밋(`failed`) 검증 (포트 3100 환경 활용).
  - **E2E Test:** 아티팩트 손상 등의 에러 발생 후 대시보드 다이어그램 렌더링 확인.
- **대시보드 UI 시각화 및 UX 고도화 (인접 기능 추가)**
  - `web/src/...` (ReactFlow 노드 컴포넌트)에서 Failed 상태일 때 붉은색 시각적 렌더링 적용.
  - **[추가 고도화] 실패 복구 액션 유도:** 노드가 `failed`로 전이되었을 때 에러 알림과 함께 "Retry Node"를 바로 실행할 수 있는 액션 버튼(Banner/Toast)을 노출하여, 붉은색 렌더링 확인 직후 자연스럽게 재시도를 할 수 있도록 상호작용성 강화.

### [P1] 핵심 엔진 및 Autopilot 확장 (SPEC.md)
- **Workflow Engine v2:** `workflow_id` 기반 DAG 실행 및 `node_runs` 기록 체계 완성.
- **Autopilot Control Plane:** 지시 주입(Instruction Inbox) 및 장기 실행 루프에 대한 중단(Cancel/Pause) 기능 기반 마련.
- **Agent SDK & Marketplace:** Agent Spec 및 CLI 실행 어댑터 표준화.

### [P2] 부가 기능 (SPEC.md)
- **Artifact Workspace:** 산출물 기반 저장소 메타데이터 구축 및 대시보드 검색 기능.
- **Visual Workflow Builder:** ReactFlow 기반 워크플로우 편집 UI.

---

## 2. MVP scope / out-of-scope

### MVP Scope
- `REVIEW.md`에 명시된 기능적 버그(멱등성, 상태 커밋, UI 불일치) 완벽 해결.
- `REVIEW.md`에 명시된 보안 이슈(환경변수 파싱 취약점, 무음 파일 I/O 에러) 방어 코드 적용.
- 누락된 Unit, Integration, E2E 테스트 코드 추가 (포트 3100대 활용).
- 실패 상태에 대한 명확한 UI 시각적 피드백과 재시도(Retry) 유도 UX 구현.

### Out-of-Scope
- Github 웹훅 연동 및 PR 자동화, 분산 스케줄러 인프라 구축.
- 드래그 앤 드롭 방식의 완전한 시각적 워크플로우 에디터.
- Agent SDK 기반의 플러그인 생태계 확장 (MVP 단계에서는 기본 템플릿만 유지).

---

## 3. Completion criteria
- 모든 Unit/Integration Test가 로컬 환경(ex: API 서버 포트 3100)에서 Pass 해야 함.
- `/api/workflows/{id}/resume`에 50개의 비동기 동시 요청을 인가했을 때 시스템 크래시나 `400 Bad Request` 없이 `200` 또는 `409` 응답 비율이 100%여야 함.
- 임의로 잘못된 `DEVFLOW_LOCALHOST_SPOOF_GUARD_PORTS` 환경 변수를 주입해도 API가 기본값으로 정상 기동되어야 함.
- 워크플로우 실행 중 고의로 권한 예외를 발생시켰을 때, 백그라운드 프로세스가 죽지 않고 DB의 `status`가 `failed`로 기록되어야 함.
- React 대시보드 웹 환경 접속 시 Failed 처리된 노드가 명시적인 붉은색으로 표현되며, 화면에 Retry Node 액션 UI가 나타나야 함.

---

## 4. Risks and test strategy

- **동시성 락(Lock)에 의한 데드락 위험**
  - **전략:** DB Transaction 범위 밖에서 API 레벨의 분산/비동기 락을 짧게 잡도록 구현하며, Lock 타임아웃을 설정해 무한 대기를 방지합니다. 다중 클라이언트 동시 요청 테스트 툴을 사용해(로컬 테스트 서버 포트 3100 구동) 철저히 검증합니다.
- **파일 I/O 예외 무음(Silent) 처리 위험**
  - **전략:** 단순히 `pass`로 넘기지 않고 `logging.error`를 통해 구조화된 로그(예: 런타임 ID, 노드 ID, 에러 스택)를 남기고, 최종 상태 전이 로직으로 Error 객체를 위임하도록 테스트 코드를 통해 확인합니다.
- **포트 충돌 위험**
  - **전략:** 모든 테스트와 프리뷰를 위한 로컬 서버 구동 시 `3100`, `3101` 등 3000번대 포트를 동적으로 할당받아 충돌을 회피합니다.

---

## 5. Design intent and style direction

- **기획 의도:** 
  "신뢰할 수 있는 무인 시스템의 투명한 관측." 시스템 내부의 오류를 숨기지 않고 우아하게(Graceful) 처리한 뒤, 이를 사용자에게 즉각적이고 명확하게 전달하여 신속한 판단(재시도/중단)을 돕습니다.
- **디자인 풍:** 
  엔지니어 친화적인 모던 대시보드형 뷰. 불필요한 장식을 배제하고 데이터와 상태 흐름에 집중합니다.
- **시각 원칙:** 
  - 컬러: 성공은 녹색(Green), 대기/진행 중은 파랑/회색(Blue/Gray), 에러 발생 시 즉각 인지가 가능한 강렬한 붉은색(Red, `#ef4444` 계열)으로 노드 배경/테두리를 강조합니다.
  - 패딩/마진: 노드 다이어그램 간 충분한 여백(마진)을 두어 플로우를 쾌적하게 보여주고, 노드 내부의 에러 메세지는 좁은 패딩과 Monospace 폰트로 출력하여 코드/로그로서의 정체성을 부각합니다.
- **반응형 원칙:** 
  데스크톱 우선(Desktop-first). 노드 기반의 워크플로우 캔버스는 넓은 화면이 필수적이며, 모바일 환경 접근 시에는 캔버스 대신 리스트 형태의 폴백 뷰로 최소한의 상태만 확인할 수 있게 제한합니다.

---

## 6. Technology ruleset

- **플랫폼 분류:** api 및 web
- **api:** 
  - FastAPI 기반 구현.
  - 비동기 특성을 활용하여 동시성 제어(`asyncio.Lock` 또는 DB 기반 락) 로직 작성. Pydantic을 활용한 설정(Config) 안전 파싱.
- **web:** 
  - React/Vite 기반 프레임워크 (ReactFlow 포함).
  - TypeScript 적용으로 상태 타입 및 API 응답 객체 안정성 담보. Styled-components 또는 TailwindCSS를 이용해 동적인 컬러 렌더링(Failed 상태) 구현.
- **로컬 실행 가이드:** 가용한 3000번대 포트를 설정에 주입하여 테스트 및 프리뷰 모드를 안전하게 띄웁니다.
```
