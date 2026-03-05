# PLAN

## 1. Task breakdown with priority
**P0 (최우선) - 코어 엔진 및 안정성 강화**
- [ ] Workflow Engine v2 구현 (`workflow_id` 기반 실행, `ExecutorRegistry`, `node_runs` 저장 및 기본 fallback 적용)
- [ ] 파일 I/O 동시성 제어 및 예외 처리 (`api/app/services/workspace.py` OS Lock 실패/권한 에러 방어 및 `logging.error` 추가)
- [ ] 환경 변수 파싱 에러 방어 (`api/app/core/config.py` Fallback 시 명시적 `logging.warning` 또는 `logging.error` 추가)
- [ ] 프리뷰용 포트 동적 할당 스크립트 고도화 (`web/scripts/check-port.mjs` 포트 고갈 방지 대기/재시도/타임아웃 적용, 대상 포트: 3100~3199 대역폭 내 무한루프 방지)

**P1 (우선) - UI/UX 개선 및 제어 평면(Control Plane) 구성**
- [ ] 대시보드 워크플로우 캔버스 에러 툴팁 UI 수정 (`web/src/components/` 하위 컴포넌트 CSS 오버플로우 방어: `word-break: break-all`, `white-space: pre-wrap`, `max-width`, 12~16px 여백 적용)
- [ ] 시스템 경고 로그 조회 API 엔드포인트 신규 구현 (`api/app/api/logs.py` 최근 발생 로그 최대 50건 반환)
- [ ] 프론트엔드 대시보드 시스템 경고 위젯 추가 (`web/src/components/SystemAlertWidget.tsx` 반응형 디자인 원칙 적용)
- [ ] Autopilot Control Plane 구현 (Instruction Inbox, 중단/재개/취소, 백로그 스케줄러)
- [ ] Agent SDK & Marketplace 표준화 (Agent Spec, 버전, CLI 어댑터)

**P2 (보통) - 기능 확장**
- [ ] Artifact-first Workspace 스토리지 및 메타데이터 연결
- [ ] Visual Workflow Builder 편집/검증/버전 관리 연동
- [ ] 이벤트 버스 통합 (GitHub PR/CI/Deploy 이벤트 연동 및 재처리 로직 추가)

## 2. MVP scope / out-of-scope
**MVP Scope**
- `ex-code` 기반의 워크플로우 자동화 엔진(v2) 이식 및 24시간 작동 환경 구축
- 노드/워크플로우 단위의 실행 이력 저장 및 실패 시 3회 노드 단위 재시도 로직 구현
- 워커의 동시다발적인 파일 시스템 접근 시 충돌을 방어하기 위한 구조화된 예외 처리(OS Lock 경합 방어) 및 테스트
- 시스템 에러/경고 상황을 빠르게 파악할 수 있는 API(최대 50건)와 프론트엔드 대시보드의 Alert 위젯 연결
- 동적 포트 할당 시 발생하는 고갈 및 무한 루프 방지를 위한 안정화 로직(3100번대 포트 사용)
- ReactFlow 캔버스 툴팁의 긴 텍스트 레이아웃 깨짐 버그 수정

**Out-of-scope**
- 복잡한 사용자 권한 체계(RBAC) 및 고도화된 인증 시스템 구축
- 실제 상용 클라우드 리소스(AWS S3, Managed Redis, EKS 등)에 직접 의존하는 배포 파이프라인(현 단계는 Docker 로컬 실행 기준)
- 모든 노드를 마우스만으로 100% 코딩 없이 제어하는 완벽한 노드 에디터(단순 시각 편집/프리뷰 검증까지만 지원)
- 다중 DB 인스턴스를 활용한 글로벌 분산 트랜잭션 관리

## 3. Completion criteria
- 워크플로우를 구성하는 코어 노드들이 정상적으로 실행되고 상태가 DB에 저장될 것.
- `web/scripts/check-port.mjs`가 더미 프로세스로 3100~3199 포트를 모두 강제 점유당한 상태에서, 무한 대기 없이 지정된 재시도 횟수 후 정상 타임아웃/실패 처리됨을 증명할 것.
- 워크플로우 캔버스 에러 툴팁에 띄어쓰기가 없는 무작위 긴 문자열을 넣었을 때 UI 캔버스 밖으로 이탈하지 않고 개행됨을 시각적으로 확인할 것.
- `api/tests/test_workspace_security.py`에서 `unittest.mock`을 통해 OS Lock 권한 에러를 강제 유발했을 때 시스템 크래시 없이 로깅 및 안전하게 처리되는 단위 테스트가 통과할 것.
- 잘못된 `.env` 변수가 로드될 때 설정 Fallback이 작동하며 시스템 경고 로그가 남고, 이를 프론트엔드의 `SystemAlertWidget`에서 정상적으로 조회할 수 있을 것.

## 4. Risks and test strategy
**Risks**
- 초장기 자동 루프 워크플로우 실행 시 예산(budget) 초과 및 무한 반복 오류로 인한 시스템 부하 발생 위험.
- 워커 병렬 실행 중 발생하는 파일 접근 경합 및 Lock 획득 실패로 인한 데이터 무결성 훼손.
- 포트 할당 스크립트 결함 시 빌드/프리뷰 파이프라인 전체의 영구적인 지연 병목 현상.

**Test strategy**
- **단위 테스트 (Unit Test)**: `api/tests/test_workspace_security.py` 내에 Mock 객체를 활용, 런타임에 파일 읽기/쓰기 시 `PermissionError` 및 OS Lock 오류 상황을 모의하여 안전한 분기 처리를 입증한다.
- **통합 로깅 테스트**: 잘못된 설정 파일 주입 시 `api/app/core/config.py`의 예외 로깅이 동작하고, `logs.py` API가 최신 에러 50건을 정확히 파싱하여 응답하는지 검증한다.
- **포트 스크립트 검증**: 임의의 더미 프로세스를 띄워 3100번대 전역을 점유한 후, 타임아웃 및 재시도 대기(sleep)가 의도된 수치에 맞게 동작하고 정상 종료되는지 E2E 형태의 쉘 스크립트 테스트 수행.
- **시각적 UI 검증**: 극단적인 Edge Case 문자열(공백 없는 수백 자의 오류 메시지)을 툴팁에 렌더링하고, 데스크톱/모바일 비율에서 요소가 잘리지 않는지 시각적으로 검수.

## 5. Design intent and style direction
- **기획 의도**: 시스템의 자동화 과정에서 발생하는 모든 에러와 상태 변화를 운영자가 명확하고 즉각적으로 인지할 수 있도록, 투명성과 관측성에 집중한 워크플로우 제어 경험 제공.
- **디자인 풍**: 개발자 친화적인 대시보드형 모던 디자인. (정보 밀도가 높고 상태 구분이 뚜렷한 UI)
- **시각 원칙**:
  - **컬러**: 에러(Red), 경고(Yellow/Orange), 정상(Green), 정보(Blue) 등 상태를 직관적으로 표현하는 포인트 컬러 시스템 적용.
  - **패딩/마진**: 위젯과 툴팁 내부는 12px~16px의 균일한 안전 여백을 확보해 텍스트 가독성을 높임.
  - **타이포그래피**: 로그 데이터나 코드는 Monospace를 사용하고, UI 텍스트는 산세리프 폰트를 사용하여 구분. 특히 긴 메시지는 `word-break: break-all` 처리로 가시성 보장.
- **반응형 원칙**: 모바일 우선(Mobile-First) 규칙을 적용하여 작은 화면에서는 위젯이 세로형 스태킹 레이아웃으로 변환되고, 복잡한 플로팅 툴팁 요소는 모바일 환경에서 Bottom Sheet나 화면 내 팝업으로 유연하게 폴백(Fallback) 전환되도록 설계.

## 6. Technology ruleset
- **플랫폼 분류**: web, api
- **web**: React 라이브러리 기반 프론트엔드 (Vite + TypeScript 조합). 상태 관리 및 비동기 API 연동으로 워크플로우 뷰어 및 시스템 Alert 위젯 구축.
- **api**: FastAPI 기반 백엔드 (Python). 워크플로우 실행 엔진, 에러/로그 통합 수집 엔드포인트, 시스템 Lock 경합 제어 로직 등 구현. 비동기 I/O를 적극 활용.
