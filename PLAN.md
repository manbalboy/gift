# PLAN

## 1. Task breakdown with priority

- **[P0] 기반 환경 구축 및 안정화 (REVIEW 반영)**
  - 프로젝트 루트 기준 Docker 컨테이너화 및 7000-7099 포트 바인딩 (`Dockerfile`, 실행 스크립트 작성)
  - SSE 로그 스트리밍 재연결 시 Sequence ID 기반 중복 방지 및 정렬 보장 로직 구현
  - Redis 락 획득 실패 및 장애(네트워크 파티션) 대비 Graceful Degradation 및 예외 복구(Fallback) 테스트 케이스 보강
  - 순간적 로그 Burst로 인한 OOM 방지를 위해 윈도잉 주기 단축 및 실시간 메모리 Cap 제한 추가
- **[P1] Self-Improvement Loop 코어 엔진 구현 (SPEC 반영)**
  - `Analyzer Engine`: 코드 구조, 아키텍처, 의존성, 테스트 커버리지, 복잡도 분석 파이프라인 구축
  - `Evaluator Engine`: 분석 결과를 바탕으로 한 품질 점수(Quality Score) 산출
  - `Improvement Planner`: 평가 결과를 기반으로 개선 작업 목록(Task List, Refactor Plan 등) 생성
  - `Executor Engine`: 작업 실행(코드 수정, PR 생성 등) 및 결과 피드백 처리
- **[P2] Memory 시스템 및 Long-Running 제어 구현 (SPEC 반영)**
  - Long-term Memory 데이터베이스 스키마 설계 (아키텍처 결정 사항, 버그 히스토리 등 저장)
  - Long-Running Workflow 제어 API 구현 (Start, Pause, Resume, Stop, Inject Instruction)
  - Loop Stability 제어 로직 적용 (max_loop_count, budget_limit, duplicate_change_detection 등)
- **[P3] 보안 및 권한 체계 고도화 (REVIEW 반영)**
  - 상세 RBAC(Role-Based Access Control) 연동을 통한 API 접근 권한 제어 기반 마련
  - 프론트엔드 XSS 공격 방어를 위한 `sanitizeAlertText` 정적 보안 분석 및 취약성 점검

## 2. MVP scope / out-of-scope

**MVP Scope**
- 사용자의 초기 아이디어 입력을 시작으로 시스템이 스스로 분석, 평가, 계획, 실행하는 자가 개선 순환 루프 완성
- 4대 코어 엔진(Analyzer, Evaluator, Planner, Executor) 간의 상태 전이 및 파이프라인 통합
- 사용자 개입이 가능한 제어 API (Pause, Resume, Stop, Inject Instruction) 제공
- 프로젝트 히스토리 학습을 위한 단일 노드 기반 Memory 저장소 연동
- 안정성 제어를 위한 루프 제한(최대 반복 횟수, 변경 임계치) 기능 포함
- Docker 기반 환경 구성 및 Preview 배포(7000 포트 등) 지원
- 네트워크 단절 시 UI 상의 로그 중복 방지 및 Redis 락 장애 대비 방어 로직 적용

**Out-of-Scope**
- 사람의 개입이 전혀 필요 없는 완전 자율형(AGI 수준)의 복잡한 소프트웨어 아키텍처 재설계
- 다중 서버 및 클러스터 단위의 복잡한 분산 애플리케이션 자동 배포/스케일링 제어
- Jira, Slack 등 서드파티 서비스와의 직접적인 외부 API 양방향 연동 기능

## 3. Completion criteria

- 아이디어 입력 후 기획 단계부터 코드 작성, 테스트, 품질 평가까지의 전체 사이클이 1회 이상 에러 없이 자동 실행되어야 함.
- 24시간 이상 루프가 중단 없이 가동되며, Pause/Resume 등의 제어 명령이 즉각적으로 엔진의 동작에 반영되어야 함.
- 프로젝트 최상단 `Dockerfile`을 이용해 빌드 및 컨테이너 실행 시 정상적으로 구동되어야 하며, `7000`번 포트를 통해 외부 Preview 접근이 가능해야 함.
- 의도적으로 브라우저 네트워크 단절 후 재연결 시에도 UI 상 로그의 순서가 보장되고 중복 렌더링되지 않아야 함.
- 분산 락 해제 지연이나 Redis 연결 순단 발생 시, 시스템이 데드락 상태에 빠지지 않고 안정적으로 복구되어야 함.

## 4. Risks and test strategy

- **Risks**
  - 평가 엔진(Evaluator)의 판단 오류로 인해 코드를 무한정 덮어쓰거나 퇴화시키는 부작용(Infinite Loop).
  - 다수 워커의 로그 Burst로 인한 순간적인 메모리 사용량 폭증(OOM Killer 발동) 및 가상 스크롤 백그라운드 렌더링 정체 현상.
  - Redis 분산 락 서버 장애로 인한 고아 프로세스 발생 및 루프 정지.
- **Test Strategy**
  - **Unit Test**: 4개 핵심 엔진의 단위 테스트 작성 및 모의(Mock) 응답을 통한 각 엔진의 입출력 정합성 확인.
  - **Integration Test**: Redis 서버 단절 및 락 획득 실패 시나리오를 강제 재현하여 Fallback 매커니즘 작동 여부 검증.
  - **E2E / Stress Test**: 수만 건의 대용량 스트리밍 데이터를 발생시켜 SSE 재연결 시나리오 및 메모리 Cap 제한 작동 여부 검증 (로컬 실행 시 3000번대 포트 활용하여 테스트 서버 구동).

## 5. Design intent and style direction

- **기획 의도**: 시스템이 코드를 스스로 발전시켜 나가는 과정을 사용자가 안심하고 관찰할 수 있도록 투명한 진행 상태와 통찰력 있는 평가 지표를 제공하는 것. 또한, 필요할 때 언제든 즉각적으로 개입(명령어 주입)할 수 있는 컨트롤 센터 역할을 함.
- **디자인 풍**: 모던 대시보드형 디자인. 개발 프로세스 현황, 품질 점수(Quality Score), 발생 로그 등을 논리적으로 구획하여 배치하는 터미널 감성의 인터페이스 구현.
- **시각 원칙**: 다크 모드 기반의 배경색에 시그널 컬러(진행 중: Blue, 개선됨: Green, 주의: Yellow/Orange, 에러: Red)를 명확히 사용하여 상태 인지를 돕고, 가독성이 뛰어난 모노스페이스 타이포그래피와 충분한 마진/패딩을 부여하여 복잡도를 낮춤.
- **반응형 원칙**: 모바일 우선(Mobile-First) 설계. 모바일 환경에서는 주요 상태 위젯과 로그 패널을 상하로 1단 스크롤 배치하며, 데스크탑 환경에서는 화면 분할 대시보드 형태로 확장하여 한눈에 많은 정보를 담도록 구성.

## 6. Technology ruleset

- **플랫폼 분류**: web 및 api 혼합
- **API**: FastAPI 기반 설계 (Self-Improvement Loop 코어 엔진 구동 및 제어, SSE 스트리밍 제공)
- **Web**: React 기반 (또는 Vite 환경의 React)으로 설계 (시스템 상태 모니터링 및 실시간 로그 렌더링 대시보드)

---

### 고도화 플랜 (추가 인접 기능 반영)

1. **상태 임계치 기반 경고(Alert) 웹훅 단순 연동**
   - **근거**: 장기 실행(Long-Running)이라는 핵심 요구사항 특성상 사용자가 화면을 계속 모니터링할 수 없으므로, 루프 품질 점수(Quality Score)가 급락하거나 연속된 에러 루프에 빠질 경우 이를 외부로 통지하는 수단이 필수적입니다.
   - **구현 경계**: 복잡한 알림 템플릿 처리 없이, 기존 루프 평가 단계에서 예외 상황 감지 시 사전에 등록된 단순 URL로 JSON 페이로드만 전송하는 수준(MVP)으로 구현합니다.
