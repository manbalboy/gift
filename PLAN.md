# PLAN

## 1. Task breakdown with priority

### Priority 1: Critical Core & Stability (REVIEW 반영)
- **API (FastAPI)**: `api/app/main.py` 내 CORS 정책을 `manbalboy.com` 및 `localhost` 파생 도메인으로 엄격히 제한.
- **API (FastAPI)**: `api/app/api/loop_engine.py`에 루프 제어 API(Start, Pause, Resume, Stop) 및 상태 조회 API(`GET /api/loop/status`) 구현.
- **API (FastAPI)**: 비동기 작업 및 상태 전이 중 발생하는 동시성 문제를 방지하기 위해 락(Lock)을 활용한 방어 코드 추가.
- **Infra/API**: `scripts/run-api-31xx.sh` 및 백엔드에 3100번 포트 충돌 상황 감지 시 Graceful Shutdown 및 자동 재시도를 처리하는 로직 추가.

### Priority 2: UI/UX & Reliability (REVIEW 반영)
- **Web (React)**: `web/src/components/ErrorLogModal.tsx`에 10만 자 이상 렌더링에 대비한 가상화(Virtualization) 로직 적용.
- **Web (React)**: 구형 브라우저 렌더링 방어를 위해 `Intl.Segmenter` API 미지원 환경용 정규식 Fallback 추가.

### Priority 3: Testing & Validation (REVIEW 반영)
- **Test (API)**: `api/tests/test_loop_simulator.py`에 `max_loop_count`, `budget_limit` 경계값(음수 등) 검증 및 Race Condition 상황 모사 단위 테스트 추가.
- **Test (Web)**: `ErrorLogModal.test.tsx` 내에 대량 로그 및 ZWJ 이모지 주입 시 1초 내 렌더링 완료를 검증하는 벤치마크 테스트 작성.
- **Test (Infra)**: 3100번 포트 강제 점유(`nc -l 3100`) 후 구동 스크립트 실행 시 정상 에러 처리 및 종료 여부를 확인하는 인프라 통합 테스트 스크립트 구현.

### Priority 4: Deployment & 고도화 (REVIEW 반영 및 추가)
- **Infra**: Docker Preview 환경 구동 시 컨테이너 포트가 7000~7099 범위 내에서 매핑되고 정상 통신 가능한지 검증.
- **추가 기능 1 (Web)**: 클라이언트 API 폴링 최적화(Debouncing/Throttling) 구현
  - **근거(Why)**: 리뷰에서 지적된 대시보드의 상태 조회 API 빈번한 호출(Polling)로 인한 서버 락(Lock) 경합 병목을 방지하기 위해, 웹 클라이언트 단에서 요청 주기를 최적화하는 훅(`useLoopStatus` 등) 고도화가 필수적입니다.

## 2. MVP scope / out-of-scope

**MVP Scope**
- 사람이 개입하지 않아도 지속 작동하는 루프 엔진의 핵심 상태 제어(Start, Pause, Resume, Stop) API 완성.
- 3100번 포트를 점유하는 로컬/서버 실행 환경에서 포트 충돌을 안전하게 방어하는 스크립트 및 런타임 종료 로직 구현.
- 브라우저 멈춤 없이 10만 자 이상의 로그 텍스트를 안정적으로 보여줄 수 있는 가상화 적용 대시보드 컴포넌트(React) 구축.
- 허용된 Origin(`manbalboy.com` 및 `localhost` 대역) 기반의 강력한 CORS 보안 구축.
- 7000~7099 대역의 외부 노출 포트를 가지는 Docker 기반 단일 런타임 Preview 구동 템플릿 제공.

**Out-of-scope**
- 코드를 직접 스캔하고 LLM을 호출하여 품질 점수(Quality Score)를 매기는 Analyzer/Evaluator의 상세 추론 비즈니스 로직(기반 뼈대와 제어 흐름만 완성).
- 다중 사용자 워크스페이스 격리 및 권한(Role) 관리.
- 장기 메모리(Memory) 시스템을 위한 외부 Vector DB 연동(로컬 파일 기반 또는 In-memory 객체 상태로 대체).

## 3. Completion criteria

- `scripts/run-api-31xx.sh`를 실행할 때, 이미 3100번 포트가 사용 중이면 서버가 예외를 잡고 안전하게 종료(Graceful Shutdown)됨을 콘솔 로그로 확인할 수 있어야 한다.
- FastAPI에서 제공하는 상태 제어 API를 비동기 멀티스레드 환경에서 동시 호출하는 테스트(Pytest)를 통과하며, 엔진 상태의 무결성이 100% 유지되어야 한다.
- React 대시보드에서 `ErrorLogModal.tsx`에 10만 자의 텍스트와 이모지를 주입하는 테스트를 실행 시, 브라우저 스레드 블로킹 없이 1초 이내에 렌더링이 완료되어야 한다.
- API 서버 구동 시 CORS가 `*`가 아닌 명시적인 `manbalboy.com` 및 `localhost` Origin만 허용하고 있음을 검증하는 자동화 테스트가 성공해야 한다.
- 빌드된 Docker Preview 컨테이너가 7000~7099 포트로 바인딩되며, 외부 도메인(`http://ssh.manbalboy.com:7000`)에서 접속 시 응답을 반환해야 한다.

## 4. Risks and test strategy

**Risks**
- 백그라운드 스레드나 비동기 코루틴으로 실행되는 Loop 엔진 동작 도중 Stop/Pause API가 수신될 때, 락(Lock) 데드락이나 상태 불일치가 발생할 가능성.
- 거대한 문자열 청크가 브라우저 DOM에 마운트될 때 React의 렌더링 큐가 막혀 UI가 멈추거나 Out Of Memory가 발생할 가능성.

**Test Strategy**
- **동시성 및 락 테스트**: 멀티프로세스 혹은 코루틴 풀을 이용해 `test_loop_simulator.py`에 Race Condition 모의 환경을 구축하여 상태 덮어쓰기나 데드락 징후를 자동 검사.
- **스트레스 및 렌더링 테스트**: Jest 및 React Testing Library 환경에서 대량 로그 청크 배열을 `ErrorLogModal` 컴포넌트에 주입한 뒤, DOM 렌더링 소요 시간을 측정하고 Timeout 경계선을 1초로 제한하여 검증.
- **인프라 결함 주입 테스트**: `nc -l 3100` 명령어로 네트워크 자원을 점유시킨 뒤, `run-api-31xx.sh` 스크립트를 백그라운드 실행하여 정상 에러 코드 뱉음 및 좀비 프로세스 미발생을 확인하는 bash 테스트 스크립트 작성.

## 5. Design intent and style direction

- **기획 의도**: 개발자(사용자)가 24시간 자가 발전하는 엔진을 조작함에 있어, 복잡한 시스템의 톱니바퀴를 한 치의 오차 없이 "안정적이고 투명하게" 통제하고 모니터링할 수 있다는 신뢰감을 주어야 합니다.
- **디자인 풍**: 모던 개발자 중심의 대시보드형 (Modern Dashboard). 복잡한 지표를 군더더기 없이 보여주는 터미널 인터페이스(CLI) 기반의 감성.
- **시각 원칙**:
  - 컬러: 어두운 다크 테마(Slate/Charcoal 바탕)를 기본으로 하며, 작동 중 시그널은 터미널 그린(Terminal Green), 정지 및 경고 시그널은 아토믹 레드(Atomic Red)를 사용합니다.
  - 패딩/마진: 화면 낭비를 줄이기 위해 모니터링 로그 리스트는 촘촘한 마진(Tight margin)을 유지하고, 굵직한 제어 버튼 및 모달 창에는 넉넉한 여백을 두어 조작 실수를 방지합니다.
  - 타이포: 시스템 출력 로그와 에러 메시지는 시인성 높은 Monospace 글꼴을 적용하여 코드 렌더링 방향성을 따릅니다.
- **반응형 원칙**: 고해상도 모니터(Desktop-First)에 최적화된 로그 모니터링 비율을 우선 구성하되, 모바일 환경 접근 시 텍스트 박스가 수평 스크롤 처리되고 핵심 제어 버튼이 탭 가능하도록 최소한의 반응형 처리를 준수합니다.

## 6. Technology ruleset

- **플랫폼 분류**: web / api
- **web**: React (Vite 기반, TypeScript) 환경. UI 가상화 및 대용량 성능 렌더링 최적화를 위해 `react-window` 또는 `react-virtuoso`와 같은 기술 도입. 상태 관리와 API 폴링 통신은 커스텀 React 훅으로 모듈화.
- **api**: FastAPI 기반 비동기 설계. `asyncio` 기반의 백그라운드 루프 엔진과 `Lock`을 통한 메모리 상태 스레드 세이프 제어 구현. 테스트 환경은 `pytest` 및 `httpx` 활용. 배포 스크립트는 POSIX 호환 쉘 스크립트(`bash`)를 사용.
