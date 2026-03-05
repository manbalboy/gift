# PLAN

## 1. Task breakdown with priority

- **P0 (Critical/Blocker - 보안 및 시스템 안정성)**
  - [API] 루프 엔진 제어 API(`api/app/api/loop_engine.py`)의 모든 제어 라우터(Start, Pause, Stop)에 인증/인가(`Depends`) 의존성 추가 및 권한 검증 구현.
  - [API] 다중 워커 환경에서 `loop_simulator.py`의 중복 실행 방지를 위한 분산 락(예: Redis Lock) 적용.
  - [API] 시스템 로그 데이터 급증 방지를 위한 오래된 더미 로그 정리(Retention/Windowing) 정책 구현.
  - [UI] `web/src/components/SystemAlertWidget.tsx`의 가상 스크롤 로직을 `@tanstack/react-virtual` 등 검증된 라이브러리로 마이그레이션.
  - [UI] 브라우저 메모리 최적화를 위한 UI 로그 데이터 윈도잉(일정 개수 초과 시 오래된 배열 제거) 정책 보강.

- **P1 (Core MVP - 엔진 기본 기능 고도화)**
  - [API] Self-Improvement Loop 엔진의 상태 전이 제어 기능(Start, Pause, Resume, Stop, Inject Instruction) 보강 및 예외 처리 강화.
  - [Test] `api/tests/test_loop_engine_api.py`에 권한 검증 실패 엣지 케이스 및 병렬 `start` 호출 방어를 위한 동시성 테스트 케이스 작성.

- **P2 (Performance/E2E - 성능 및 사용성 검증)**
  - [Test] 로컬 포트 3100번 대에서 대용량 상태 로그 스트리밍을 재현하여 UI 프레임 드랍 유무 및 렌더링 성능을 점검하는 E2E 스트레스 테스트 스크립트 작성.

## 2. MVP scope / out-of-scope

- **MVP Scope**
  - 다중 워커 환경에서 안전하게 동작하며 인증이 적용된 기본 Loop Engine 제어 API.
  - 무한 루프 및 장기 실행 시뮬레이션을 견딜 수 있는 로그 자동 정리(Retention) 시스템.
  - 대용량 데이터 스트리밍 시에도 브라우저 렌더링을 방해하지 않는 안정적인 프론트엔드 대시보드 UI (가상 스크롤 적용).
  - 변경 사항에 대한 통합 테스트 및 E2E UI 성능 검증.

- **Out-of-scope**
  - Analyzer, Evaluator, Planner, Executor 등 AI 모델 기반 엔진의 완전한 실제 비즈니스 로직 연동 (현재는 루프 시스템의 '구조'와 '인프라 안정성'을 확보하는 초안 및 시뮬레이터 단계로 한정).
  - 글로벌 트랜잭션 관리 및 복잡한 마이크로서비스 아키텍처로의 즉각적인 분리.
  - 사용자별 복잡한 권한 그룹(RBAC) 관리 화면 개발 (기본적인 토큰/권한 검증 수준으로 한정).

## 3. Completion criteria

- `loop_engine.py`의 제어 API가 유효한 권한을 가진 요청에만 정상 응답함.
- 서버 다중 워커 환경에서도 분산 락을 통해 루프 시뮬레이터가 단일 인스턴스로만 실행됨.
- 데이터베이스 및 시스템 메모리에 오래된 로그가 누적되지 않고 설정된 임계치에 따라 자동 정리됨.
- 프론트엔드 대시보드에서 대량의 로그 스트리밍 시 스크롤 점핑이나 메인 스레드 블로킹 현상 없이 원활하게 렌더링됨(`@tanstack/react-virtual` 적용 완료).
- 작성된 보안 및 동시성 제어 백엔드 테스트(pytest)가 100% 통과함.
- 로컬 포트 3100 환경을 타겟으로 한 대용량 E2E 스트레스 테스트가 성능 저하 없이 통과함.

## 4. Risks and test strategy

- **분산 락 교착 상태(Deadlock) 위험:** 시뮬레이터 비정상 종료 시 락이 해제되지 않을 수 있음.
  - **Test Strategy:** Redis Lock에 적절한 TTL(Time To Live)을 설정하고, 워커 프로세스 강제 종료 시나리오를 모사하여 락이 자동으로 만료 및 복구되는지 통합 테스트 수행.
- **UI 렌더링 성능 저하 위험:** 비활성 탭 복귀 시 혹은 데이터 급증 시 가상 스크롤 오작동.
  - **Test Strategy:** E2E 테스트 스크립트를 통해 수만 건의 로그 스트리밍을 발생시키고, 탭 전환(`visibilitychange`) 이벤트를 트리거하여 레이아웃 깨짐이나 스크롤 위치 점핑 현상이 없는지 검증.
- **리소스 고갈 위험:** 루프 엔진의 무한 동작으로 인한 OOM(Out of Memory).
  - **Test Strategy:** 더미 데이터를 지속 생성하는 스트레스 테스트 봇을 구동하고 일정 시간 경과 후 윈도잉 정책이 동작하여 API 및 브라우저의 메모리 사용량이 임계치 내에서 유지되는지 프로파일링.

## 5. Design intent and style direction

- **기획 의도:** 사람이 입력한 아이디어를 바탕으로 스스로 코드를 개선하는 'Autonomous Developer'의 24시간 가동 상태와 판단 내역을 실시간으로 투명하게 모니터링할 수 있는 관제 경험 제공.
- **디자인 풍:** 모던하고 전문적인 대시보드형 터미널 뷰. 불필요한 시각적 장식을 배제하여 정보의 밀도와 시인성을 극대화한 형태.
- **시각 원칙:**
  - **컬러:** 개발자에게 친숙한 다크 테마(Dark Theme)를 기본으로 하며, 로그 성격에 따른 명확한 상태 컬러(정상: Green, 경고: Yellow, 에러: Red, 정보: Blue) 적용.
  - **패딩/마진:** 한 화면에 많은 양의 로그와 지표를 표시하기 위해 컴팩트한 간격을 유지하되, 각 섹션(제어부, 로그 뷰어, 상태 요약) 간의 명확한 시각적 분리선 적용.
  - **타이포:** 로그와 코드 영역에는 모노스페이스(Monospace) 폰트를 적용하여 정렬과 가독성을 확보하고, 제어 및 헤더 영역에는 가독성 높은 산세리프 폰트 혼용.
- **반응형 원칙:** 모바일 우선(Mobile-First) 원칙 적용. 모바일 기기에서도 루프의 상태 확인과 긴급 제어(Stop/Pause)가 가능하도록 세로형 단일 컬럼 레이아웃을 제공하고, 데스크탑에서는 다단 분할 뷰로 화면을 넓게 활용.

## 6. Technology ruleset

- **플랫폼 분류:** web 및 api
- **web:** React 기반 프레임워크 (Vite, TypeScript 환경) 사용. UI 최적화를 위해 `@tanstack/react-virtual` 채택. 로컬 실행 포트는 `3100` 등 3000번대 사용.
- **api:** FastAPI 기반 프레임워크 (Python). 백그라운드 태스크 제어 및 비동기 처리 적용. 다중 워커 동기화를 위한 분산 락(Redis Lock 등) 매커니즘 구현. 로컬 실행 포트는 `3000`번대 사용.
