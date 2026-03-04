# PLAN

## 1. Task breakdown with priority
- **[P0] API - WorkflowEngine 로직 수정**: `WorkflowEngine.refresh_run` 내 노드 실행 시 기본 폴백인 `echo`가 아닌, 워크플로우 정의에서 실제 `command`를 파싱하여 `AgentTaskRequest` payload에 전달하도록 수정.
- **[P0] API - 보상 데몬 트랜잭션 스코프 개선**: `recover_stuck_runs`에서 복구 실패가 다른 노드의 복구를 롤백하지 않도록, 반복문 내에서 개별 혹은 청크 단위로 `db.commit()`을 수행하도록 변경.
- **[P1] Web - Workflow Builder UI 테스트 보강**: `web/` 디렉토리 내 `WorkflowBuilder.tsx`에 대해 React Flow 캔버스 조작 및 상태 전환 등 사용자 시나리오를 포괄하는 Jest/Testing Library 기반 테스트 코드 확충 (포트 3000 기반 환경 호환성 검증).
- **[P1] API - AgentRunner 단위 테스트 추가**: `AgentRunner.run` 실행 시 발생할 수 있는 시스템 예외(파일 I/O, 권한 부족 등) 브랜치에 대한 Mocking 테스트 코드 추가 작성.
- **[P2] API - 실행 워커 격리 방안 기획(보안)**: RCE 방지를 위한 컨테이너(Docker) 기반 임시 스크립트 실행 격리 구조 재검토 및 문서화.
- **[P2] API - 분산 락 구조화 계획 수립**: 다중 프로세스(Gunicorn 등) 확장 시나리오를 대비해 DB Row Lock 경합 방지를 위한 Redis 기반 분산 락 처리 로직 기획.

**고도화 플랜 (추가 기능)**
- **[P2] API - 실시간 상태 스트리밍(SSE) 엔드포인트 초안 작성**: 
  - **근거**: 노드 실행 커맨드 정상화 및 복구 데몬 트랜잭션 개선 이후, 빈번하게 갱신되는 상태(queued, running, done, failed)를 대시보드 UI에 지연 없이 반영하기 위해 기존 폴링 구조를 개선할 필요가 있음.
  - **구현 경계**: 실제 Redis Pub/Sub까지 연동하지는 않고, 현재 데이터베이스 상태를 기반으로 `workflow_id`에 따른 서버 센트 이벤트(SSE)를 송출하는 FastAPI 라우터 초안 및 기본 로그 스트림 로직 추가로 한정.

## 2. MVP scope / out-of-scope
- **Scope**:
  - 기존 FastAPI 백엔드에서 발견된 치명적 실행 버그(command 파싱 누락, 트랜잭션 롤백 위험) 수정.
  - 프론트엔드 React Flow(Visual Builder) 시각적 캔버스 조작 보장을 위한 Jest 주요 시나리오 UI 테스트 구축.
  - AgentRunner 관련 시스템 예외 상황 커버리지(단위 테스트) 확보.
  - 향후 확장을 위한 보안(샌드박싱) 및 분산 환경(분산 락) 계획의 문서화 구체화.
- **Out-of-scope**:
  - 즉각적인 Redis 기반 완벽한 분산 락 코드 구현 및 인프라 구축 (계획 수립까지만 범위).
  - 임시 스크립트를 완벽히 차단하는 Docker 샌드박스 코어 로직의 전면 재작성 (현재는 아키텍처 재검토/기획으로 한정).
  - 템플릿 마켓플레이스 화면 전체 신규 구현 (에디터 UI 안정성 확보에 집중).

## 3. Completion criteria
- `WorkflowEngine.refresh_run` 실행 시, 노드 정보의 실제 `command`가 파싱되어 `AgentRunner`를 통해 정상적으로 스크립트가 실행됨.
- `recover_stuck_runs` 데몬 실행 중, 특정 노드의 업데이트 에러가 발생하더라도 다른 정상 노드의 상태 갱신이 온전히 데이터베이스에 커밋됨.
- `AgentRunner.run`의 시스템 레벨 예외 케이스를 다루는 Mocking 기반 단위 테스트가 모두 통과함.
- 웹 프론트엔드의 `WorkflowBuilder.tsx` 관련 React Flow 캔버스 테스트 코드(노드 추가/연결, 모바일 상태 전환 등)가 정상 통과함.
- 보안 격리 기획 및 다중 프로세스 락 구조 기획안이 문서로 작성되어 리포지토리에 반영됨.

## 4. Risks and test strategy
- **Risk**: 동시성 환경에서의 DB 락 경합으로 인한 교착 상태, 무검증 임시 스크립트 실행에 따른 원격 코드 실행(RCE) 위험, 프론트엔드 그래프 상태와 백엔드 상태의 비동기화.
- **Test Strategy**:
  - **백엔드**: 비정상적인 스크립트 권한 문제나 파일 I/O 에러 상황을 `unittest.mock`을 통해 강제 발생시키고, 적절한 에러 핸들링 및 상태 기록이 되는지 검증. 복구 트랜잭션 롤백 방지 여부를 통합 테스트로 확인.
  - **프론트엔드**: Testing Library를 사용하여 사용자 동작(드래그 앤 드롭, 연결 끊기 등)을 모사하고 그래프 상태의 정확성을 검증.
  - **아키텍처**: 샌드박스 격리 방안 및 분산 락 도입을 위한 리뷰 세션을 거치고 위험을 문서로 관리.

## 5. Design intent and style direction
- **기획 의도**: 워크플로우 엔진이 지정한 단계를 신뢰성 있게 실행하고 복구하도록 하여, 개발 조직이 안심하고 AI Development Platform에 SDLC 자동화를 맡길 수 있는 경험을 제공함.
- **디자인 풍**: 직관적인 워크플로우 파악을 돕는 모던 대시보드형 뷰, 복잡한 노드를 깔끔하게 보여주는 카드형 디자인 적용.
- **시각 원칙**: 핵심 상태(review_needed, running, done, failed 등)를 직관적으로 구분할 수 있는 명확한 컬러 시스템 적용. 가독성 높은 타이포그래피와 여유로운 마진/패딩을 두어 개발자가 장시간 보아도 피로하지 않도록 구성.
- **반응형 원칙**: 모바일 우선 접근을 적용하여 작은 뷰포트에서도 노드 그래프의 상태를 확인하고, 패닝/줌 동작이 자연스럽게 이어지도록 최적화.

## 6. Technology ruleset
- **플랫폼 분류**: Web / API
- **Web**: React (Vite) 기반의 프론트엔드 앱, React Flow (노드/엣지 에디터), Jest/Testing Library (UI 테스트). 로컬 웹 개발 서버 및 프론트엔드 테스트 환경은 포트 3000을 사용.
- **API**: FastAPI 기반 백엔드, Python 3.x.
- **운영/통합 규칙**: Preview 환경 노출을 위한 외부 포트는 7000~7099 범위를 할당. CORS는 `*.manbalboy.com` 및 `localhost` 출처를 허용하도록 구성. 실행 가이드에 언급되는 로컬 포트는 3000번대로 엄격히 관리.
