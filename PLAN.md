```markdown
# PLAN

## 1. Task breakdown with priority

**High Priority (Core API & Infrastructure Stability)**
- `api/app/main.py` 및 `scripts/run-api-31xx.sh` 수정: 포트 3100 충돌 시 `Address already in use` 예외를 감지하여 Graceful Shutdown 및 자동 재시도 로직 구현
- `api/app/api/loop_engine.py` 엔드포인트 신규 작성: SPEC에서 요구하는 루프 제어 API (Start, Pause, Resume, Stop) 구현 및 내부 엔진 상태 연동
- [고도화 추가 기능] 루프 엔진 상태 조회 API (`GET /api/loop/status`): 루프 엔진 제어와 더불어 프론트엔드 대시보드에서 현재 상태(running, paused, stopped 등)를 실시간 반영하기 위해 필요함. `loop_engine.py`에 조회 라우트 추가.

**Medium Priority (Web UI Rendering Stability)**
- `web/src/components/ErrorLogModal.tsx` 최적화: 대용량 에러 로그(10만 자 이상) 렌더링 시 브라우저 OOM 및 프리징 현상을 방지하기 위한 가상화(Virtualization) 또는 텍스트 청크 분할 렌더링 로직 추가
- `web/src/components/ErrorLogModal.tsx` 호환성 보완: `Intl.Segmenter` 미지원 구형 브라우저 환경에서 복합 ZWJ 이모지 및 특수 문자가 깨지지 않도록 정규식 기반 Fallback 엣지 케이스 로직 추가

**Low Priority (Testing & Validation)**
- `api/tests/test_loop_simulator.py` 단위 테스트 추가: `max_loop_count`, `budget_limit` 파라미터에 대한 경계값(초과, 음수 할당 등) 주입 시 즉각적인 `stopped` 상태 전이 검증
- 비동기 Race Condition 방어 테스트: `_lock` 범위 밖에서 비동기 큐잉 작업이 누락되는 타이밍 이슈를 모의(Mocking)하여 동시성 검증 시나리오 작성
- `web/src/components/ErrorLogModal.test.tsx` 벤치마크: 10만 자 이상의 스트레스 텍스트 및 ZWJ 이모지를 렌더링할 때의 UI 프리징 방지 성능 테스트 추가
- 쉘 스크립트 기반 인프라 통합 테스트: 의도적으로 `nc -l 3100`을 실행해 포트를 강제 점유한 뒤 서버 구동 시, 올바른 예외 처리 및 종료 코드가 반환되는지 확인

## 2. MVP scope / out-of-scope

**MVP Scope**
- 외부에서 Self-Improvement Loop를 제어(Start, Pause, Resume, Stop)하고 모니터링할 수 있는 기본 API 엔드포인트 초안 완성.
- 백엔드 서버 구동 시 3100번대 포트 충돌에 대비한 시스템의 견고성(Graceful Shutdown) 확보.
- 프론트엔드에서 대용량 로그 파일 및 이모지가 포함된 결과를 안정적으로 화면에 렌더링하여 클라이언트 마비를 방지.
- 상기 기능들을 보증하기 위한 자동화된 테스트 코드 작성 및 검증.

**Out-of-Scope**
- AI 코드 자동 수정, 테스트 생성 및 실제 PR 생성 로직(Executor Engine)의 상세 비즈니스 로직 연동 (현재는 제어 인터페이스와 인프라 안정화에 집중).
- 텍스트 외의 미디어 로딩이나 완벽한 국제화(i18n) 번역 지원.
- 분석(Analyzer) 엔진의 복잡도 계산 및 구체적인 평가 메트릭 수식 확정.

## 3. Completion criteria

- 3100 포트가 이미 점유된 환경에서 `run-api-31xx.sh` 스크립트를 실행했을 때, 서버가 크래시되지 않고 우아하게 종료 과정을 거치거나 의미 있는 에러 로그를 남겨야 한다.
- `loop_engine.py`의 제어 API가 정상적으로 호출되며 상태 전이가 이루어져야 한다. 추가로 제안된 `GET /api/loop/status`를 통해 현재 상태를 확인할 수 있어야 한다.
- `ErrorLogModal.tsx`에서 10만 자 이상의 로렘입숨 및 이모지 데이터 주입 시, UI 스레드 멈춤 없이 1초 이내에 모달이 부드럽게 렌더링되어야 한다.
- 명시된 단위 테스트, 통합 테스트, UI 벤치마크 테스트가 CI 환경에서 모두 성공(Pass)해야 한다.
- 최종 산출물이 Docker 환경에서 구동 가능해야 하며, Preview 외부 노출 시 7000-7099 포트 대역 및 허용된 Origin CORS 정책(`https://manbalboy.com` 등)을 엄격하게 준수해야 한다.

## 4. Risks and test strategy

**Risks**
- 대용량 텍스트 가상화 시 리액트 컴포넌트 라이프사이클과 충돌하여 스크롤 이벤트 지연(Jank) 발생 가능.
- 루프 상태가 강제로 전이되는 찰나(ms 단위)에 새 명령이 주입될 경우 발생하는 동시성 충돌 이슈.

**Test Strategy**
- **단위 테스트:** Pytest 기반으로 API 라우트 검증 및 도메인 로직 내 한계 조건(음수 값, Limit 초과) 예외 처리를 철저히 테스트한다.
- **UI 스트레스 테스트:** Jest와 React Testing Library를 활용하여 DOM 요소 개수를 제한하면서 대규모 텍스트가 렌더링되는 속도를 프로파일링한다.
- **통합 및 인프라 테스트:** 실제 쉘 스크립트 실행 환경에서 Mock 포트 점유를 발생시켜, OS 수준의 소켓 예외가 앱 레벨에서 어떻게 핸들링되는지 블랙박스 형태로 검증한다.
- **Race Condition 테스트:** Python의 `asyncio` 툴을 활용해 수 밀리초 차이로 제어 명령과 시스템 상태 전이가 교차하는 엣지 케이스를 강제로 유발해 Lock의 유효성을 검증한다.

## 5. Design intent and style direction

- **기획 의도:** 무인으로 동작하는 AI 시스템(Autonomous Developer)의 상태와 로그를 언제든 투명하게 모니터링하고 즉각적으로 제어할 수 있는 신뢰감 높은 경험을 제공한다.
- **디자인 풍:** 데이터를 효율적으로 나열하고 조작에 방해되지 않는 '터미널 콘솔/대시보드형' 미니멀 모던 디자인.
- **시각 원칙:**
  - 컬러: 다크 모드를 기본(Default)으로 하여 개발자에게 친숙한 테마를 제공. 에러 로그는 붉은색, 성공 로그는 녹색 계열을 사용하여 시인성을 확보.
  - 마진/패딩: 8px/16px 기준의 규칙적인 그리드 시스템을 적용해 정보의 밀도를 높이고, 컴포넌트 간 명확한 계층 분리를 유도.
  - 타이포그래피: 본문 로그 텍스트는 Monospace 글꼴을 적용하여 코드 및 터미널 출력 가독성을 높임. UI 제어 요소는 깔끔한 Sans-serif 사용.
- **반응형 원칙:** 모바일 우선(Mobile-First)으로 설계하되, 대시보드의 특성상 넓은 뷰포트(태블릿/데스크톱)에서 화면 분할이나 플렉스(Flex) 구조를 최대한 활용하여 모니터링 가독성을 극대화한다.

## 6. Technology ruleset

- **플랫폼 분류:** web, api
- **web:** React 프레임워크 (Vite 기반, TypeScript 활용)
- **api:** FastAPI 프레임워크 (Python 기반 비동기 설계)
- **추가 포트 규칙:** 개발 로컬 환경에서는 충돌을 피해 API는 3100번 대역을 사용하고, 외부 노출 및 프리뷰 배포 시에는 반드시 7000~7099 대역 포트만 할당하도록 구성한다.
```
