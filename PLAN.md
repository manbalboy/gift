# PLAN

## 1. Task breakdown with priority

### [P0] MVP 핵심 루프 엔진 구조 및 제어 API 구현 (API)
- `Analyzer`, `Evaluator`, `Planner`, `Executor` 4단계 핵심 엔진의 기본 파이프라인 로직 구현
- `Long-Running Workflow` 상태 관리를 위한 엔진 제어 API (`Start`, `Pause`, `Resume`, `Stop`) 연동
- `Inject Instruction` API 구현 및 인가되지 않은 외부 접근을 차단하기 위한 RBAC 권한 검증 미들웨어 맵핑 (REVIEW 반영)
- Loop Stability 제어를 위한 기본 정책(`max_loop_count`, `budget_limit` 등) 적용

### [P1] 실시간 상태 모니터링 대시보드 연동 (Web)
- `Self-Improvement Loop` 상태 시각화 대시보드 UI 컴포넌트 개발
- SSE(Server-Sent Events)를 활용한 루프 진행 상태 및 실시간 로그 스트리밍 파이프라인 구축
- 시스템 보안을 위한 CORS 허용 origin 목록(`manbalboy.com`, `localhost` 등) 엄격 제한 (REVIEW 반영)

### [P2] 고도화 플랜 및 안정성 강화 (API/Web/Test)
- **[Web] SSE 중복 렌더링 방지**: 네트워크 단절 후 재연결 시 Sequence ID 비교 로직을 추가하여 대시보드 로그 중복 표출 결함 수정 (REVIEW 반영)
- **[API] Graceful Shutdown**: `Pause`, `Stop` 제어 API 호출 시 현재 동작 중인 `Executor Engine`의 스레드/프로세스를 안전하게 종료하는 로직 구현 (REVIEW 반영)
- **[API] Safe Mode 방어 로직**: 시스템 오류로 품질 점수(Quality Score)가 비정상적으로 급락할 경우, 불필요한 코드 수정을 차단하고 안전 모드(Safe Mode)로 전환하는 방어선 구축 (REVIEW 반영)
- **[Test] 로컬 대용량 스트레스 검증**: `3100` 포트를 사용하는 로컬 대용량 로그 스트리밍 테스트 스크립트를 작성하여 윈도잉 주기 및 메모리 Cap 방어 기능 검증 (REVIEW 반영)
- **[Test] 분산 락 장애 통합 검증**: Redis 분산 락 타임아웃 및 네트워크 파티션 서버 단절 시나리오를 모사하는 Integration Test 케이스 추가 (REVIEW 반영)
- **[고도화] 데이터베이스 커넥션 풀 최적화**: 며칠 이상 장기 실행(Long-Running)되는 환경을 대비하여 DB 커넥션 반환 사이클을 고도화하고 누수를 방지하는 Connection Pool 타임아웃 로직 추가 (자연스러운 인접 기능 확장)

## 2. MVP scope / out-of-scope

### MVP Scope
- `Analyzer` → `Evaluator` → `Planner` → `Executor` 로 이어지는 단일 프로젝트 대상 핵심 파이프라인 뼈대 구축
- FastAPI 기반 제어 백엔드 API 및 React 기반 프론트엔드 모니터링 대시보드 구현
- SSE 기반 로그 실시간 스트리밍 전송 및 Sequence ID 정합성 관리
- Graceful Shutdown, Safe Mode, RBAC, 제한적 CORS 등 시스템 안정성/보안성 확보 로직 적용

### Out-of-scope
- 완벽한 수준의 고도화된 AI 코드 생성 및 인간 수준의 복잡한 아키텍처 리팩토링 로직 (MVP는 엔진 파이프라인 흐름 동작 검증에 초점을 맞춤)
- 다중 프로젝트 및 다중 워크스페이스 동시 개선 기능 (단일 프로젝트 대상으로 제한)
- 사용자별/그룹별 세분화된 권한 체계 (단일 Admin 기준 RBAC 토큰 검증만 수행)

## 3. Completion criteria
- 모든 핵심 엔진 간의 입출력 전이가 정상적으로 이루어지고 자동 개선 루프가 안정적으로 반복 실행되는가.
- 대시보드 UI에서 SSE를 통해 루프 상태 및 로그가 Sequence ID 기반으로 중복 및 지연 없이 실시간 표출되는가.
- 엔진 가동 중 루프 제어 API(`Pause`, `Stop`) 호출 시 즉시 혹은 안전하게 작업이 중단(Graceful Shutdown)되는가.
- 테스트 스크립트를 통해 `3100` 포트에서 대규모 로그 발생 시 OOM(Out of Memory) 없이 안정적으로 스트리밍됨을 검증하였는가.
- Redis 장애 및 락 획득 실패 상황을 가정한 Integration Test가 정상적으로 통과하는가.
- PR 본문에 Docker Preview 정보(호스트 `http://ssh.manbalboy.com:7000`, 7000~7099 포트 범위 활용)를 정확히 포함하여 제출하였는가.

## 4. Risks and test strategy

### Risks
- 장기간 무중단 실행 과정에서 데이터베이스 커넥션 고갈 및 메모리 누수 발생 위험
- 품질 점수(Quality Score)의 순간적인 하락으로 인해 `Planner`가 정상 코드를 파괴할 위험성
- 클라이언트 네트워크 단절 상황 시 SSE 재연결 과정에서 발생하는 대시보드 UI(React) 렌더링 부하

### Test Strategy
- **Unit Test**: 엔진 간 입출력 파이프라인 정합성 모의 테스트, 평가 점수 급락 시 Safe Mode 전환 동작 검증 단위 테스트 작성.
- **Integration Test**: Redis 네트워크 파티션, 락 획득 타임아웃 발생 시의 시스템 Fallback 및 데드락 방지 통합 검증.
- **E2E / Stress Test**: 포트 충돌을 방지하기 위해 `3100` 포트를 명시적으로 할당한 대용량 로그 스트리밍 스크립트를 실행하여 Burst 메모리 안정성 검증.
- **Security Test**: `Inject Instruction` API 호출 시 비인가 RBAC 토큰 차단 여부 검증 및 로그 데이터 렌더링 시 XSS 필터링(`sanitizeAlertText`) 완결성 확인.

## 5. Design intent and style direction

- **기획 의도**: 개발자의 개입 없이 24시간 자율적으로 코드를 진단하고 개선하는 Autonomous Developer의 추론 과정을 투명하게 관찰하고, 필요시 즉각적으로 통제할 수 있는 시스템 오너십 경험을 제공.
- **디자인 풍**: 모던하고 테크니컬한 감각을 주는 개발자 친화형 대시보드 및 터미널 콘솔 스타일.
- **시각 원칙**:
  - **컬러**: 딥 다크 그레이/블랙 기반의 배경을 사용하여 시각적 피로도를 낮추고, 시스템 상태(Start, Pause, Stop, Error)를 나타내는 네온 포인트 컬러(Green, Yellow, Red)를 대비감 있게 배치.
  - **패딩/마진**: 한눈에 많은 로그와 지표를 확인할 수 있도록 컴팩트한 마진을 사용하며, 메인 로그 뷰어 영역은 화면의 70% 이상을 차지하도록 와이드하게 설계.
  - **타이포그래피**: 데이터 및 코드 로그의 가독성을 극대화하기 위해 자간이 일정한 Monospace 폰트(예: Fira Code, JetBrains Mono 등) 적용.
- **반응형 원칙**: 모바일 우선(Mobile-First) 규칙을 준수하여 기본 컨테이너를 설계하되, 정보의 밀도가 높은 대시보드 특성상 데스크탑 뷰에 최적화된 Grid/Flex 확장 레이아웃을 제공. 모바일 뷰에서는 주요 상태 제어(Pause/Stop) 버튼과 핵심 요약 로그 위주로 간소화 배치.

## 6. Technology ruleset

- **플랫폼 분류**: web / api
- **web**: React 기반 라이브러리 및 프레임워크로 계획
- **api**: FastAPI 기반 프레임워크로 계획
