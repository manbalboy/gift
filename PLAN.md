```markdown
# PLAN

## 1. Task breakdown with priority
- **[P0] `X-Forwarded-For` IP 스푸핑 취약점 수정 (API)**
  - 대상 파일: `api/app/api/webhooks.py`
  - 내용: `_extract_client_key` 함수에서 IP 후보 목록을 오른쪽(가장 마지막에 추가된 프록시)부터 역순으로 탐색하여 처음 등장하는 신뢰할 수 없는 IP를 진짜 클라이언트 IP로 식별하도록 개선하여 Rate Limiting 우회를 방어.
- **[P0] 웹훅 다중 IP 스푸핑 방어 단위 테스트 추가 (API)**
  - 대상 파일: `api/tests/test_webhooks_api.py`
  - 내용: `X-Forwarded-For: fake_ip, real_ip` 형태의 다중 IP 헤더를 주입했을 때 시스템이 스푸핑된 `fake_ip`를 무시하고 `real_ip`를 기준으로 제한을 적용하는지 검증하는 단위 테스트 추가.
- **[P1] `workflow_id` 엣지 케이스 파싱 보완 및 테스트 추가 (API)**
  - 대상 파일: `api/app/api/webhooks.py`, `api/tests/test_webhooks_api.py`
  - 내용: 음수(`-1`) 및 소수점(`1.0`) 형태의 `workflow_id` 페이로드 유입 시 `str(workflow_id).isdigit()` 파싱에서 누락되는 문제를 해결하도록 예외 처리나 정규식 방어 로직을 보완하고, 관련된 엣지 케이스 테스트 코드 추가.
- **[P1] 프론트엔드 노드 선택 해제 및 불완전 노드 데이터 테스트 추가 (Web)**
  - 대상 파일: `web/src/components/WorkflowBuilder.test.tsx` (필요시 `WorkflowBuilder.tsx` 보완)
  - 내용: 캔버스 바탕 클릭 시 노드 선택이 해제(`Selected Node === null`)되어 우측 속성 패널이 정확히 초기화되는지 상태 전이를 검증. `data`나 `nodeType`이 누락된 불완전 노드 유입 시 `task` 타입으로 fallback 렌더링되는 방어 로직 검증.
- **[P2] (고도화 플랜) 잘못된 웹훅/노드 유입에 대한 경고 알림 노출 (Web/API)**
  - 근거: `workflow_id` 타입 불일치 및 불완전 노드 렌더링 상황 시, 시스템이 무시하는 것을 넘어 사용자에게 피드백이 필요함.
  - 구현 경계: 유효하지 않은 웹훅 호출이나 노드 파싱 에러 발생 시 대시보 상단에 일시적인 Toast 경고 메시지를 노출하여 개발자의 디버깅을 돕는 선까지 구현 (복잡한 에러 로깅 DB 테이블 추가는 제외).

## 2. MVP scope / out-of-scope
- **Scope (포함)**
  - `REVIEW.md`에 명시된 TODO 항목 전면 이행 (스푸핑 취약점 조치, `workflow_id` 파싱 보완, React 컴포넌트 상태 전이 검증).
  - 웹훅 파싱 및 엣지 케이스 검증 로직 강화를 통한 서버 안정성 제고.
  - 프론트엔드 캔버스 클릭 상태 버그 유발 방지 및 로컬 테스트 구동 포트 규칙(`3100`) 적용 확인.
- **Out-of-scope (제외)**
  - 완전한 형태의 Role-Based Access Control(RBAC) 구현.
  - 외부의 본격적인 Workflow 엔진(Temporal, n8n 등) 통합 이관 (현재의 FastAPI Worker 엔진 구조 유지).
  - DB 스키마의 대규모 마이그레이션을 요구하는 에러 로깅 이력 관리 기능.

## 3. Completion criteria
- 백엔드 `_extract_client_key` 역순 탐색 로직 적용 후 관련 보안 테스트가 모두 통과해야 함.
- 다중 IP 주입 공격(`X-Forwarded-For: 10.0.0.1, 203.0.113.11` 등) 상황에 대해 `test_webhooks_api.py` 테스트 케이스가 성공해야 함.
- `-1`, `1.0` 등 비정상 `workflow_id` 값이 들어와도 서버 에러(500)가 발생하지 않으며 정상적인 무시 또는 422 상태 코드를 반환해야 함.
- `WorkflowBuilder.test.tsx`에서 캔버스 배경 클릭 이벤트를 시뮬레이션했을 때 선택 상태가 `null`로 초기화됨을 확인해야 함.

## 4. Risks and test strategy
- **Risks**: 
  - IP 역순 탐색 로직 오류 시, 정상적인 클라이언트 환경까지 Rate Limit에 걸려 웹훅 연동이 차단될 수 있음.
  - 프론트엔드 포트 및 의존성 설정 변경 시 기존 테스트/개발 환경과 충돌이 발생할 수 있음.
- **Test strategy**:
  - `Trusted Proxy` 목록을 모킹(mocking)하여 역방향 탐색 중 실제 클라이언트 IP가 정확히 추출되는지 검증하는 파라미터화(parameterized) 테스트 작성.
  - 프론트엔드 로컬 서버 및 테스트 포트는 `3100`번으로 고정하고 충돌 여부를 명시적으로 확인. 불완전 노드 데이터 처리는 Jest의 스냅샷 테스팅이나 DOM 렌더링 결과(Fallback UI)를 단언(assert)하는 방식으로 테스트.

## 5. Design intent and style direction
- **기획 의도**: 개발자와 운영자가 파이프라인의 보안 및 오류 상태를 명확히 인지하고, 안정성 높은 워크플로우 캔버스 조작 경험을 하도록 보장.
- **디자인 풍**: 대시보드형 (Data-dense, 모듈화된 패널 구조).
- **시각 원칙**: 모노톤 배경에 명확한 상태 컬러(성공: Green, 경고: Orange, 에러: Red)를 사용. 패딩과 마진은 최소화하여 정보 가독성과 한 화면 내 데이터 밀도를 높임.
- **반응형 원칙**: 워크플로우 캔버스 특성상 데스크톱 우선(Desktop-first)으로 설계. 모바일 환경 접속 시 시각적 손실을 줄이기 위해 수직 적층형 리스트 뷰로 폴백 고려.

## 6. Technology ruleset
- **플랫폼 분류**: api / web
- **api**: FastAPI 기반 파이썬 코드 구성. 보안 및 파싱 관련 로직은 파이썬 내장 라이브러리 및 정규식을 적극 활용.
- **web**: React (Vite) 및 TypeScript 환경에서 개발.
- **포트 규칙**: 프로젝트 실행 및 로컬 프론트엔드/테스트 서버 포트는 충돌 방지를 위해 **3100번** 대역(예: 3100)을 사용.
```
