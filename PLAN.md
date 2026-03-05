# PLAN

## 1. Task breakdown with priority
**P0: 워크플로우 엔진 v2 및 인프라 통합 (API/FastAPI)**
- `workflow_id` 기반 정의 기반 실행 엔진 설계 및 `node_runs` 저장 체계 연동
- [고도화] `api/app/api/workflows.py` 로직 내 휴먼 게이트 승인/거절 시 발생할 수 있는 Race Condition 방지를 위해 DB 레벨 트랜잭션 락(`with_for_update()`) 또는 분산 락 구현
- [고도화] Nginx SSE 타임아웃(`proxy_read_timeout`)과 백엔드 Heartbeat 인터벌 간 호환성 점검 및 설정 보완 (`api/scripts/nginx/`)

**P1: 아티팩트 중심 워크스페이스 및 프론트엔드 렌더러 (Web/React)**
- 상태 로그 중심에서 아티팩트 메타데이터(타입, 스키마, 해시 등) 중심의 저장소 연동
- [고도화] `web/src/utils/sanitize.ts`의 이스케이프 방식을 보완하여, XSS로부터 안전하게 리치 텍스트 및 HTML을 렌더링할 수 있는 `DOMPurify` 라이브러리 연동
- 아티팩트 뷰어 UI 및 실행 타임라인 컴포넌트 개발

**P1: 테스트 하네스 및 안정성 검증 보완 (Test)**
- [고도화] 백엔드 동시성(Concurrency) 호출 단위 시뮬레이션 테스트 작성 (다중 요청 환경의 락 충돌 방지 및 데이터 정합성 검증)
- [고도화] `api/tests/test_human_gate.py`에 `freezegun`을 활용하여 휴먼 게이트 24시간 초과 상태를 정확히 식별하는 Mocking 테스트 보강

**P2: Visual Builder 및 에이전트 확장 (Web/API)**
- ReactFlow를 활용한 워크플로우 시각화 캔버스(Node Palette, Edge Editor) 개발
- CLI 기반 Agent SDK 어댑터 표준화 및 마켓플레이스 데이터 모델 연동

## 2. MVP scope / out-of-scope
**MVP Scope:**
- `workflows.json` 기반의 워크플로우 실행 엔진 파이프라인 및 노드 상태 저장
- Race Condition 완벽 방어 및 동시성이 보장된 휴먼 게이트(승인/수정/거절/재개) API 구성
- XSS 보안 위협이 제거된 안전한 마크다운/HTML 아티팩트 뷰어 통합
- 3000번대 포트에서 띄운 웹 대시보드를 통한 진행 상태 모니터링 및 실시간 스트리밍 로그(SSE) 연동
- 동시성 시나리오 시뮬레이션 및 시간 경계 Mocking 테스트 케이스

**Out-of-Scope:**
- 복잡한 조직 기반의 권한 관리(RBAC)
- Temporal 등 대규모 분산 오케스트레이션 엔진으로의 전면 교체 (현재의 API/엔진 통합 구조 유지)
- CI 배포 및 GitHub PR 전체를 자동화하는 범용 이벤트 버스 및 복합 트리거 룰 엔진 (단순 이슈 트리거만 유지)

## 3. Completion criteria
- 휴먼 게이트 승인 엔드포인트에 10개 이상의 다중 동시 요청을 보냈을 때, DB 트랜잭션 락에 의해 중복 처리 없이 단 1건만 정상 처리되는가?
- 프론트엔드 아티팩트 뷰어에서 렌더링 시, 악의적인 `<script>` 태그 실행이 완벽히 차단되면서 마크다운 포맷은 깨지지 않고 정상 출력되는가?
- `freezegun`을 활용한 시간 조작 테스트에서 스케줄러가 타임아웃된 엣지 케이스 노드를 정확하게 감지하고 처리하는가?
- 3000번대 포트에서 서비스되는 클라이언트와 Nginx 프록시 환경 간의 SSE 로그 스트리밍이 15초 이상의 공백에도 끊김 없이 유지되는가?

## 4. Risks and test strategy
- **Risk (Race Condition):** 휴먼 게이트 API 다중 호출 시 중복 락 및 상태 불일치 발생
  - **Strategy:** SQLAlchemy `with_for_update()`를 적용하여 DB 레벨 락을 보장하고, `pytest.mark.asyncio` 및 비동기 병렬 호출(`asyncio.gather`)을 활용해 인위적인 동시성 충돌 단위 테스트를 구현합니다.
- **Risk (XSS 및 렌더링 오류):** 기존 텍스트 이스케이프 함수로 인해 리치 텍스트 아티팩트의 시각적 형태가 훼손됨
  - **Strategy:** `DOMPurify` 라이브러리를 통해 이스케이프가 아닌 전문 살균(Sanitization) 처리로 전환하며, 악성 페이로드 기반 Mock 데이터를 렌더링해 보는 자동화 UI 검증 테스트를 병행합니다.
- **Risk (네트워크 끊김):** Nginx 프록시 경유 시 설정 충돌로 인한 SSE 타임아웃
  - **Strategy:** `proxy_read_timeout` 값을 백엔드 Heartbeat 인터벌보다 충분히 길게 설정하고 클라이언트 재연결(last-event-id) 로직을 통합하여 종단간 네트워크 탄력성을 확보합니다.

## 5. Design intent and style direction
- **기획 의도:** 복잡한 개발 파이프라인과 에이전트 생성물(Artifact)을 투명하게 관측하고, 휴먼 게이트를 통한 최종 결정을 개발자가 직관적이고 안전하게 제어하도록 지원하는 통합 모니터링 경험을 제공합니다.
- **디자인 풍:** 정보 밀도가 높고 코드 분석에 유리한 "모던 대시보드형". 어두운 IDE 테마를 연상시키는 개발자 집중형 스타일.
- **시각 원칙:** 
  - 컬러: 다크 테마(Gray-900) 배경. 노드 및 워크플로우 상태를 직관적으로 표현하는 형광 포인트 컬러(대기 중: Amber, 진행 중: Blue, 완료: Green, 오류: Red) 사용.
  - 패딩/마진: 조밀한 상태 트래킹을 위해 4px/8px 등 컴팩트한 그리드 간격을 사용하고, 아티팩트 상세 뷰 영역은 가독성을 위해 넓은 패딩(24px) 제공.
  - 타이포그래피: 코드 및 시스템 로그 영역은 Monospace 폰트(예: Fira Code) 적용, 핵심 지표 및 UI 컨트롤은 산세리프 폰트를 사용하여 가독성 극대화.
- **반응형 원칙:** "모바일 우선 규칙(Mobile First)" 적용. 모바일 화면에서는 노드 플로우 그래프를 세로형 타임라인 카드 리스트로 압축하여 표현하고, 휴먼 게이트 승인/거절과 같은 필수 행동 유도 버튼을 최상단 썸네일로 고정 배치합니다.

## 6. Technology ruleset
- **플랫폼 분류:** web, api
- **web:** React (Vite 기반) 프레임워크로 계획. ReactFlow 기반 노드 에디터 및 렌더링 안정성 확보용 `DOMPurify` 라이브러리 도입. 실행 가이드 및 로컬 환경 테스트 시 3000번대 포트 사용.
- **api:** FastAPI 기반으로 계획. 비동기 DB 처리(SQLAlchemy), SSE 스트리밍 통신, `freezegun`을 활용한 시간 조작 테스트 및 트랜잭션 기반 동시성 락 로직 구현.
