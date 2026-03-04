```markdown
# PLAN

## 1. Task breakdown with priority

- **[P0] 시스템 안정성 및 보안 강화 (REVIEW 기반 TODO)**
  - CORS 정책 완화 및 오류 수정: `api/app/main.py`의 `allow_origin_regex`를 정정하여 `manbalboy.com`의 모든 서브도메인, 포트와 `localhost`, `127.0.0.1`를 완전하게 허용.
  - Webhook 페이로드 용량 제한(DoS 방어): `api/app/api/webhooks.py`에 최대 5MB Request Body 제한을 두고 초과 시 HTTP 413 반환 로직 추가.
  - `workflow_id` 타입 파싱 엣지 케이스 수정: `api/app/api/webhooks.py` 내 검증 로직에서 Boolean 값이 1로 오인되는 파이썬 캐스팅 특성을 방어(HTTP 422 에러 반환).
  - 외부 자원 장애 시 연속 타임아웃 방어(Fail-Fast): `api/app/services/agent_runner.py`의 `_docker_ping()` 기능에 3~5초 기반의 Negative Cache 추가, `api/app/services/rate_limiter.py`에 장애를 인지하는 서킷 브레이커 도입.
  - 통합 보안/성능 테스트 작성: `api/tests/test_main.py` 등에 CORS 허용 검증, 5MB 페이로드 제한 검증, Fail-Fast 작동 시간 측정 테스트 추가.

- **[P1] Workflow Engine & Visual Builder 기반 구축 (SPEC 기반)**
  - 저장된 워크플로우 정의(workflow_id) 기반 실행 엔진 적용 및 노드별 단위 실행 로깅(`node_runs` 저장 체계 마련).
  - 웹 대시보드 내 워크플로우 캔버스 프로토타입 연결: `web` 프론트엔드 프로젝트에서 React Flow 기반의 Visual Builder 초기 UI 구성.

- **[P2] 고도화 플랜: Rate Limiting 및 시스템 Health 가시성 보강**
  - **근거(왜 필요한지)**: Webhook 엔드포인트에 대한 무분별한 호출(DoS 등)을 IP 레벨에서 일차적으로 방어하고, 관리자가 대시보드나 모니터링 시스템을 통해 Docker/Redis와 같은 핵심 외부 자원 장애 상태를 실시간으로 인지할 수 있도록 하기 위함입니다.
  - **구현 경계**: `api/app/api/webhooks.py` 상단에 IP 단위 Rate Limiting 검사 로직 적용(초과 시 HTTP 429 반환). `/health` 엔드포인트의 반환 스키마에 Redis 서킷 브레이커 상태 및 Docker Ping Negative Cache 상태 정보를 포함.

## 2. MVP scope / out-of-scope

- **MVP Scope**
  - Webhook API의 보안 취약점 보완 (용량 제한, 타입 캐스팅 방어, CORS 완전 허용).
  - 외부 인프라 장애(Docker, Redis) 시 시스템 자원 고갈을 막는 캐싱 및 Fail-Fast 구조 적용 완료.
  - React Flow를 활용한 Visual Builder의 화면 설계 및 기본 노드/엣지 연결 프로토타입 구현.
  - 기존 백엔드(FastAPI)와 워커의 안정적인 연동 및 에러 방어.

- **Out-of-scope**
  - LangGraph나 Temporal과 같은 완전히 새로운 대규모 워크플로우 인프라스트럭처로의 전환.
  - 사용자 인증(OAuth, JWT Auth) 체계 전면 도입 및 세밀한 역할 기반 권한 제어(RBAC).
  - Github 외 다수 플랫폼(Jira, Linear 등)에 대한 포괄적 통합 추가 (현재는 Webhook과 GitHub Issues 대응 집중).

## 3. Completion criteria

- CORS 에러 없이 로컬 프론트엔드(`localhost:3000` 등)에서 Webhook 및 Health API 호출 성공.
- 5MB 초과 Webhook 요청 전송 시 즉시 HTTP 413 상태 코드 반환 확인.
- Webhook Payload에 `{"workflow_id": true}` 전송 시 내부적으로 1번 워크플로우가 실행되지 않고 HTTP 422 상태 코드가 정상 반환.
- Docker 데몬을 끈 상태에서 Agent Task 호출 시 첫 번째 호출은 타임아웃을 거치나, 곧바로 이어지는 후속 호출들은 3~5초 내내 즉시 Fail-Fast(RuntimeError 등) 응답 반환 및 관련 시간 측정 테스트(Time Measurement Test) 통과.
- `web` 디렉토리 하위의 Visual Builder 화면이 렌더링되며 React Flow 기본 노드 드래그가 에러 없이 작동.
- 모든 기능이 포함된 자동화 테스트(`pytest`) 100% Pass.

## 4. Risks and test strategy

- **Risks**
  - Negative Cache TTL이 최적화되지 않으면 장애 복구 후에도 인위적 지연 상태가 발생할 수 있습니다.
  - CORS 정규식이 완벽하지 않으면, 악의적인 변조 도메인에 권한이 열릴 잠재 위험이 존재합니다.

- **Test strategy**
  - **Fail-Fast 단위 시간 테스트**: Mock 프레임워크를 사용해 Docker 응답 불가 환경을 설정한 후, 여러 번 함수를 호출하여 2회차 호출부터 O(1)에 가까운 시간 안에 예외가 발생하는지 검증.
  - **방어 메커니즘 통합 테스트**: 스트리밍 혹은 대용량 임의 더미 데이터 페이로드를 생성해 API로 전송한 후 OOM 없이 413 에러를 떨어지는지 검사.
  - **CORS 순회 테스트**: 화이트리스트 케이스(예: `localhost:3000`, `app.manbalboy.com`)와 블랙리스트 케이스(예: `evilmanbalboy.com`)를 다수 조합해 HTTP 상태 반환 검증.

## 5. Design intent and style direction

- **기획 의도**: 워크플로우를 코드가 아닌 시각적 노드로 확인 및 편집할 수 있도록 하여 사용자의 개발 흐름 제어권을 극대화하는 모던 대시보드 플랫폼 제공.
- **디자인 풍**: 대시보드형 캔버스 기반의 모던, 미니멀 스타일 (잡다한 배경과 선을 배제하고 노드 단위 블록이 강조되는 형태).
- **시각 원칙**:
  - Color: 화이트/라이트그레이 배경에 핵심 상호작용 요소(실행, 상태 노드 등)에 상태 컬러(성공: Green, 진행: Blue, 실패: Red) 명확히 적용.
  - Padding & Margin: 노드 내부는 조밀하게(8-12px), 대시보드 구역 간격은 넓게(24px 이상) 구성하여 시각적 피로도를 축소.
  - Typography: 직관적인 Sans-serif 시스템 폰트(Inter 등) 활용.
- **반응형 원칙**: 캔버스의 특성상 데스크탑 레이아웃을 최우선으로 제공하고, 모바일에서는 캔버스를 Read-Only 상태로 보여주거나 주요 상태 지표(KPI 카드)를 상단에 쌓아 올리는(Mobile-first adaptation) 방식으로 제공.

## 6. Technology ruleset

- **플랫폼 분류**: web, api
- **web**: React 기반(Vite 번들러 등 `web` 디렉토리 구성 반영), React Flow 라이브러리를 통해 워크플로우 캔버스 렌더링. 웹 프론트엔드 포트는 3000번 사용.
- **api**: FastAPI 기반 (`api` 디렉토리 파이썬 코드) 및 Pytest 적용. 백엔드 API 포트는 3100번 사용.
```
