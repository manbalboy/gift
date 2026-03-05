# PLAN

## 1. Task breakdown with priority

- **[P0] 프론트엔드 에러 로그 모달 안정성 및 보안 강화 (REVIEW 반영)**
  - `web/src/components/ErrorLogModal` 내 로그 출력 영역 UI 개선: `overflow-y: auto`, `word-break: break-all` 적용 및 5000자 초과 텍스트 Truncation ('Show more' 버튼) 구현.
  - 전역 Toast 알림 기능 추가 및 클립보드 복사 성공/실패 결과 피드백 연동 (연속 클릭 시 디바운싱 처리 포함).
  - 비정형 XSS 페이로드(예: `<scr<script>ipt>`) 차단 로직 고도화 및 제네릭 문법(`<T>`) 오탐 방지 예외 처리 적용.
  - `web/src/components/ErrorLogModal.test.tsx` 내 클립보드 API Mock 단위 테스트 및 `web/src/utils/security.test.ts` XSS 심화 엣지 케이스 단위 테스트 추가.
- **[P1] Self-Improvement Loop Engine 핵심 API 구조 설계 (SPEC 반영)**
  - FastAPI 기반 4대 핵심 컴포넌트(`Analyzer Engine`, `Evaluator Engine`, `Improvement Planner`, `Executor Engine`) 기본 구조 및 라우팅 설계.
  - Loop Control(반복 제어, 예산 제한 등) 및 장기 기억(Memory) 시스템 연동을 위한 데이터 스키마 초안 작성.
- **[P2] 로컬 실행 환경 및 보안 설정 최적화**
  - 로컬 테스트 실행용 포트 3100 점유 설정 및 충돌 방지 확인.
  - API 및 웹 서버 간 CORS 정책(manbalboy.com 및 localhost 계열 허용) 기준값 검증 및 적용.

## 2. MVP scope / out-of-scope

- **MVP Scope**
  - 에러 로그 대용량 텍스트의 안정적인 UI 렌더링(최대 5000자 제한, 'Show more' 확장) 및 안전한 XSS 방어 로직 적용.
  - 클립보드 복사 API 예외 처리 및 사용자를 위한 시각적 피드백(Toast 알림) 제공.
  - Self-Improvement Loop 엔진의 전체 흐름(Plan -> Code -> Test -> Evaluate)을 지원하는 FastAPI 기본 뼈대 및 모의(Mock) 응답 엔드포인트 구축.
- **Out-of-scope**
  - AI 모델(LLM)을 직접 연동하여 코드를 분석하고 자동으로 코드를 생성 및 커밋하는 완전한 구동 로직.
  - 장기 기억(Memory) 데이터의 실제 영구 데이터베이스(DB) 연결 및 히스토리 기반의 심화 학습 알고리즘 구현.

## 3. Completion criteria

- `web/src/components/ErrorLogModal.test.tsx`에서 `navigator.clipboard.writeText` 성공 및 실패 상황에 대한 Mock 테스트가 100% 통과해야 합니다.
- `web/src/utils/security.test.ts`에서 신규 우회 XSS 패턴 방어 및 제네릭 타입 문법 예외 처리에 대한 교차 검증 테스트가 통과해야 합니다.
- 로컬 웹 구동(포트 3100) 시, 5000자 이상의 에러 로그가 브라우저 멈춤이나 레이아웃 붕괴 없이 렌더링되며 'Show more' 버튼이 정상 동작해야 합니다.
- 로그 복사 버튼 클릭 시 클립보드 API 예외가 발생하더라도 앱 크래시 없이 알맞은 Toast 에러 상태가 표시되어야 합니다.
- FastAPI 프로젝트 내에 Loop Engine 모듈 구조가 정의되고, 로컬 서버 실행 시 에러 없이 기본 엔드포인트 응답이 확인되어야 합니다.

## 4. Risks and test strategy

- **Risks**
  - 대용량 로그(수만 자 이상)를 정규식 기반으로 XSS 필터링할 경우, 메인 스레드 병목으로 인해 렌더링 성능이 저하될 위험이 있습니다.
  - 클립보드 권한이 제한된 특정 브라우저 환경에서 명시적 예외 처리가 누락될 시 앱 전체가 다운될 수 있습니다.
  - 루프 엔진 상태 제어 누락으로 인해 테스트 환경에서 API가 무한 루프에 빠지거나 리소스 한도를 초과할 가능성이 존재합니다.
- **Test strategy**
  - **렌더링 UI 테스트:** 극단적인 대용량 더미 에러 로그 주입 및 빈 문자열(`null`) 입력 시 뷰포트 붕괴 여부를 확인하고, 대체 텍스트("No logs available") 노출 상태를 검증합니다.
  - **단위 테스트:** Jest 환경에서 복잡한 XSS 패턴과 정상적인 코드 패턴이 혼합된 데이터로 방어 로직의 정확성을 심층 검증합니다.
  - **통합 수동 테스트:** 로컬 3100 포트 환경에서 복사 버튼 연속 클릭 시 Toast 알림이 무한 증식하지 않는지 디바운싱 로직을 직접 테스트합니다.

## 5. Design intent and style direction

- **기획 의도:** 개발자가 발생한 에러 로그를 쾌적하게 확인하고 안전하게 복사할 수 있는 환경을 제공하여 신속하고 정확한 디버깅 경험을 유도합니다.
- **디자인 풍:** 불필요한 장식 요소가 완전히 배제된 개발자 친화적인 미니멀 대시보드형 스타일을 지향합니다.
- **시각 원칙:**
  - **컬러:** 어두운 터미널(Dark Mode) 톤을 바탕으로, 에러 및 경고 텍스트는 명도 높은 Red 계열을 사용하고 성공 및 시스템 안내(Toast)는 선명한 Green/Blue 포인트 컬러를 사용해 직관적인 가시성을 확보합니다.
  - **패딩/마진:** 로그를 둘러싼 모달 내부에 넉넉한 여백(최소 24px 이상)을 두어 정보의 밀도로 인한 시각적 피로감을 줄입니다.
  - **타이포:** 실제 로그 출력부에는 코드를 읽기 쉬운 Monospace 계열 폰트를 강제 적용하며, 그 외의 일반 UI 텍스트와 버튼은 깔끔한 시스템 산세리프 폰트를 사용합니다.
- **반응형 원칙:** 모바일 우선(Mobile First) 규칙에 따라 설계하여, 어떠한 해상도나 화면 크기에서도 로그 영역이 화면 밖으로 넘치지 않고 내부에서 안정적으로 스크롤되도록 CSS를 제어합니다.

## 6. Technology ruleset

- **플랫폼 분류:** web 및 api
- **web:** React 기반 프레임워크(Vite 환경)를 중심으로 UI 컴포넌트(에러 모달 확장, 전역 Toast 알림 등)를 구성하며, 테스트는 Jest 생태계를 활용하여 구축합니다.
- **api:** FastAPI 프레임워크를 기반으로 Self-Improvement Loop 엔진의 4가지 핵심 컴포넌트를 설계하고, 장기 실행과 확장성을 고려한 RESTful 라우팅 구조를 계획합니다.
