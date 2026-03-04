# PLAN

## 1. Task breakdown with priority

### P0 (최우선: 보안/테스트 환경/핵심 버그 수정)
- `web/src/components/WorkflowBuilder.tsx` 모바일 뷰 안내 문구 오타 수정 ("모 니터링을" -> "모니터링을")
- `api/app/api/webhooks.py` 내 `X-Forwarded-For` 헤더 변조 방지를 위한 신뢰할 수 있는 프록시 설정 적용 및 IP 파싱 로직 보완
- `api/app/api/webhooks.py` 내 `workflow_id` 타입 파싱 실패(예: `isdigit()` 실패, 불리언 타입 유입 등) 시 원인 추적을 위한 Error/Warning 로거 추가
- `web/` 디렉터리의 Jest 테스트 환경 정비 및 `package.json` 스크립트 보완 (명령어 실행 시 전체 테스트 정상 통과 확인)

### P1 (우선: UI/기능 추가 및 테스트 커버리지 확대)
- `web/src/components/WorkflowBuilder.tsx`에서 노드 클릭 시 노드의 식별 정보(ID, 타입)를 보여주는 읽기 전용 속성 패널 기초 UI 구현
- `api/tests/test_webhooks_api.py`에 조작된 헤더, 잘못된 페이로드 타입 등 다양한 엣지 케이스에 대한 단위 테스트 추가 작성 및 검증
- 수정된 워크플로우 빌더 컴포넌트 및 속성 패널에 대한 프론트엔드 단위 테스트 작성 (로컬 서버/테스트 구동 시 3100번대 포트 활용)

### P2 (일반: 문서화 및 구조적 가이드라인)
- `api/app/services/rate_limiter.py`에 다중 워커 환경에서의 동시성 경합 문제 및 향후 분산 캐시(Redis 등) 도입 필요성에 대한 구조적 주석 및 문서화 추가

## 2. MVP scope / out-of-scope

### MVP Scope
- 프론트엔드 테스트 환경(Jest) 정상화 및 기존 테스트 컴포넌트 수정
- 웹훅(`webhooks.py`) 보안 취약점(`X-Forwarded-For` 변조) 대비 로직 강화 및 `workflow_id` 예외 처리/로깅
- 워크플로우 빌더 내 개별 노드 상태를 확인할 수 있는 읽기 전용(Read-only) 속성 패널 UI 기초 구현
- 위 변경 사항들에 대한 백엔드/프론트엔드 엣지 케이스 단위 테스트(Unit Test) 구축

### Out-of-scope
- 편집 가능한(Editable) 워크플로우 노드 속성 패널 전체 기능 구현 (읽기 전용 상태까지만 MVP에 포함)
- `rate_limiter.py`를 실제 Redis 기반 분산 캐시로 교체하는 아키텍처 변경 작업 (주석/문서화까지만 수행)
- 기존 워크플로우 실행 오케스트레이터 및 파이프라인 엔진의 전면 전환

## 3. Completion criteria

- `REVIEW.md`에 명시된 모든 TODO 항목이 소스코드 및 문서에 반영되어야 합니다.
- API 백엔드 테스트(`pytest`)가 모두 정상 통과해야 하며, 웹훅 관련 엣지 케이스(헤더 조작, 잘못된 `workflow_id` 타입) 검증이 포함되어야 합니다.
- 프론트엔드 컴포넌트 테스트(Jest 기반)가 에러 없이 모두 통과해야 합니다.
- `WorkflowBuilder` 화면에서 워크플로우의 임의 노드를 클릭했을 때, 지정된 패널 영역에 해당 노드의 고유 식별자(ID)와 타입(Type) 정보가 노출되어야 합니다.
- 프론트엔드 실행 및 테스트 환경에서 포트 충돌 방지를 위해 3100번대 포트(예: 3100)를 명시적으로 사용해야 합니다.

## 4. Risks and test strategy

### Risks
- 프론트엔드(Vite + React) 환경에서 Jest 설정 고도화 시, ESM 및 TypeScript 트랜스파일링 관련 설정 충돌로 인해 환경 구축에 예상보다 많은 시간이 소요될 수 있습니다.
- `X-Forwarded-For` 헤더에 대한 엄격한 검증 로직이 기존에 정상적으로 들어오던 웹훅 요청을 차단하는 오탐(False Positive)을 발생시킬 위험이 있습니다.

### Test strategy
- **프론트엔드**: Jest 설정을 최적화하여 기반을 다진 뒤, 단순 컴포넌트 렌더링 테스트부터 점진적으로 범위를 넓힙니다. 상태 변화(노드 클릭)에 따른 속성 패널 렌더링 로직을 집중적으로 검증합니다.
- **백엔드**: `test_webhooks_api.py` 파일 내에 정상 프록시 IP, 변조된 다중 IP, 비표준 형식 문자열 등 다양한 헤더 케이스를 모킹(Mocking)하여 단위 테스트를 구성합니다. 또한 유효하지 않은 타입의 페이로드 주입 시 로그가 정상적으로 출력되는지 검증합니다.

## 5. Design intent and style direction

- **기획 의도**: 개발/비개발 직군 모두가 워크플로우를 구성할 때 노드별 상세 정보를 직관적으로 파악할 수 있게 하여 조작 안정성을 부여하고, 백엔드 보안성을 강화하여 플랫폼 전체의 신뢰도를 높입니다.
- **디자인 풍**: 대시보드형 UI. 직관적이고 깔끔한 모던 스타일을 지향하며, 그래프 뷰를 방해하지 않는 간결한 카드형 패널 구조를 적용합니다.
- **시각 원칙**: 
  - 상태, 경고 및 에러 표시에 명확하고 일관된 컬러링(Semantic Colors)을 사용합니다.
  - 패널 영역 및 내부 텍스트 간 충분한 여백(Padding/Margin)을 두어 정보 시인성을 확보합니다.
  - 모던하고 가독성이 뛰어난 타이포그래피를 적용하여 사용자 피로도를 줄입니다.
- **반응형 원칙**: 모바일 우선(Mobile-first) 규칙을 적용합니다. 좁은 모바일 환경에서는 노드 속성 패널이 전체 그래프 UI를 가리지 않도록, 하단에 고정되는 시트(Bottom Sheet) 형태나 플로팅 카드로 자연스럽게 배치되도록 설계합니다.

## 6. Technology ruleset

- **플랫폼 분류**: Web / API
- **Web**: React 기반 계획. 기존 프로젝트에 설정된 Vite + React + TypeScript 스택을 그대로 활용하며, UI 컴포넌트 테스트에는 Jest와 React Testing Library를 사용합니다.
- **API**: FastAPI 기반 계획. Python 백엔드 환경에서 비동기 로직 및 웹훅 처리를 유지보수하며, `pytest`를 활용하여 견고한 테스트 코드를 작성합니다.
