```markdown
# PLAN

## 1. Task breakdown with priority
현재 구현된 `Resume` API와 보안 로직(`_enforce_localhost_spoof_guard`)의 안정성을 높이고, 엣지 케이스를 보완하기 위한 고도화 작업을 진행합니다. (REVIEW TODO 반영)

- **[P0] 이중화된 Resume API 호출 방어 (동시성 처리)**
  - 대상 파일: `api/app/services/workflow_engine.py`, `api/app/api/workflows.py`
  - 내용: 다수의 사용자가 동시에 동일한 워크플로우를 재개(Resume)하려 할 때, 엔진 내부에서 동일 노드가 중복 스케줄링되지 않도록 락(Lock) 체계 재검토 및 멱등성 보장 로직 추가.
- **[P0] 스푸핑 방어 포트 대역 환경변수화 (보안 확장성 보완)**
  - 대상 파일: `api/app/core/config.py`, `api/app/api/dependencies.py`
  - 내용: 하드코딩된 `3100 <= port <= 3199` 방어 대역을 `settings.spoof_guard_ports` 환경변수(List 형태)로 분리하여 유연성 확보.
- **[P1] 장기 방치 런타임 재개 시 우아한 실패(Graceful Failure) 처리**
  - 대상 파일: `api/app/services/workflow_engine.py`
  - 내용: 수일간 `paused` 상태로 방치되어 임시 저장소 아티팩트가 만료되었을 경우, 워크플로우 재개 시 크래시(Crash)를 방지하고 상태를 `failed`로 안전하게 전이하며 에러 메시지를 기록.
- **[P1] `timeout_override` 단위 테스트 보강**
  - 대상 파일: `api/tests/test_workflow_engine.py`
  - 내용: 노드 단위의 타임아웃 오버라이드 적용 유무에 따른 엔진의 스케줄링 변화와 동작 차이를 명확하게 검증하는 명시적인 엣지 케이스 테스트 보강.

## 2. MVP scope / out-of-scope

- **MVP Scope:**
  - `resume_run` 호출 시 락킹과 트랜잭션을 통한 중복 실행 원천 차단.
  - `_enforce_localhost_spoof_guard`의 검증 대역을 설정(Config)에서 주입받도록 리팩토링.
  - `paused` 노드 재개 시 필요 데이터/아티팩트 유효성 사전 검사 및 안전한 예외 핸들링.
  - `timeout_override` 적용 전후를 비교하는 백엔 단위 테스트(Unit Test) 작성.
  
- **Out-of-scope:**
  - 시각적 워크플로우 빌더(Visual Workflow Builder) UI 구현 등 거시적 신규 기능.
  - 전체 워크플로우 엔진의 분산 큐(Redis 등) 전면 전환 (현재 구조 유지 후 점진 도입).
  - Agent Marketplace 확장 등 코어 안정화와 무관한 추가 기능 개발.

## 3. Completion criteria
- 동일한 `run_id`에 대해 거의 동시에 여러 번의 `resume` API 요청이 인입되어도 노드 실행 스레드가 1개만 생성됨을 테스트(또는 로그)로 증명.
- 환경변수에 정의된 포트 범위에 따라 `_enforce_localhost_spoof_guard`가 유연하게 403 차단을 수행함.
- `paused` 런타임에서 필수 아티팩트가 만료되거나 유실되었을 때, 엔진 셧다운 없이 해당 노드가 `failed`로 처리되고 클라이언트에 에러가 전파됨.
- `pytest`를 통해 `timeout_override`가 적용된 신규 엣지 케이스 단위 테스트가 `PASS` 상태를 반환함.

## 4. Risks and test strategy
- **Risks:** 
  - 동시성 제어(`resume_run` Lock) 로직 수정 시, 자칫 데드락(Deadlock)에 빠지거나 정상적인 단일 재개 요청도 블로킹되는 부작용 발생 가능성.
  - 아티팩트 유효성 검사 로직이 무거워질 경우 재개 지연시간(Latency) 증가.
- **Test Strategy:**
  - **단위 테스트(Unit Test):** `timeout_override` 및 `_enforce_localhost_spoof_guard` 환경변수 처리 로직 검증.
  - **통합 테스트(Integration Test):** 파이썬 `concurrent.futures` 등을 활용해 `POST /runs/{run_id}/resume` 엔드포인트에 동시 다발적 요청을 생성, 중복 스케줄링이 일어나지 않음을 검증.
  - **안전성 테스트:** 고의로 임시 데이터를 만료(삭제)시킨 뒤 Resume을 실행하여 Graceful Failure 처리가 동작하는지 관측.

## 5. Design intent and style direction
- **기획 의도:** 관리자가 예기치 않은 시스템 에러나 외부 요인(장기 방치, 중복 클릭) 앞에서도 시스템 붕괴 없이 워크플로우를 제어할 수 있는 "신뢰성 높은 자동화 관제 경험" 제공.
- **디자인 풍:** 에러나 예외 상황에서도 명확하고 절제된 피드백을 주는 미니멀한 대시보드형 스타일 유지.
- **시각 원칙:** 실패나 경고 상태를 직관적으로 인지할 수 있도록 명확한 컬러 시스템(Red/Yellow)을 활용하고, 정보의 가독성을 높이는 넉넉한 여백(Padding/Margin) 및 모던한 타이포그래피 규칙 준수.
- **반응형 원칙:** 모바일 기기에서의 외부 관제를 고려한 모바일 우선(Mobile-first) 레이아웃 적용 및 유연한 화면 대응.

## 6. Technology ruleset
- **플랫폼 분류:** web / api
- **web:** React 기반 프레임워크 (TypeScript, Vite 환경)로 계획.
- **api:** FastAPI (Python) 기반으로 계획.
- **실행 가이드:** 컴포넌트 구동 및 로컬 테스트 진행 시 3000번대 포트(예: Web 3000, API 3100)를 활용.
```
