# PLAN

## 1. Task breakdown with priority

- **[P0] 보안 및 시스템 안정성 결함 수정 (REVIEW.md 핵심 반영)**
  - `api/app/services/loop_simulator.py`: `_pending_instructions` 큐 생성 시 `maxlen` 속성을 할당하여, 대량의 명령어 주입 시 발생하는 메모리 누수 및 OOM 위험 차단.
  - `web/src/utils/security.ts` 및 `security.test.ts`: `sanitizeAlertText` 함수에 DOMPurify를 적용하여 XSS 페이로드(HTML/Script 태그)를 완전히 제거하고 검증 테스트 강화.
  - Lock Provider(`RedisLockProvider`): 다중 워커 환경의 무결성을 위해 Redis 락 획득 실패 시 로컬 락(Local Fallback)으로 전환되지 않고, 즉각 실행을 중단(Fail-fast)하도록 분기 로직 수정.
- **[P1] 엔진 리소스 최적화 (REVIEW.md 반영)**
  - Loop Simulator 대기 로직 개선: 엔진이 Paused 또는 Safe mode일 때 바쁜 대기(Busy Wait, `time.sleep`)를 수행하던 방식을 `threading.Event.wait()` 기반 블로킹 대기로 변경하여 불필요한 CPU 컨텍스트 스위칭 낭비 최적화.
- **[P2] 전체 파이프라인 E2E 검증 인프라 구축 (REVIEW.md 반영)**
  - `web/tests/e2e/loop-engine.spec.ts` 작성: API 서버(localhost:3100)를 타겟팅하여 루프 제어 파이프라인(Start → Inject Instruction → Pause → Resume → Stop) 생명주기를 시뮬레이션하고 검증하는 통합 테스트 작성.
- **[P3] 고도화 플랜 (인접 기능 확장)**
  1. **시스템 알림(System Alerts) 자동 클린업(TTL) 로직 추가**
     - 근거: Self-Improvement Loop 엔진이 장기간(Long-Running) 동작하면서 지속적으로 알림을 생성할 경우 DB가 무한히 커지는 현상을 방지해야 합니다.
     - 구현 경계: `api/app/services/system_alerts.py`에 일정 기간(예: 7일)이 지난 오래된 알림을 자동 삭제하거나, 조회 시점에 필터링 후 정리하는 백그라운드 클린업 로직 추가.
  2. **명령 주입(Inject Instruction) 처리 상태 조회 API 추가**
     - 근거: 프론트엔드 대시보드에서 명령 주입 후 해당 지시사항이 큐에 대기 중인지, 실행 성공/실패 했는지에 대한 피드백을 제공하여 사용성을 높입니다.
     - 구현 경계: `Inject Instruction` 시 고유 식별자(ID)를 반환받고, 이를 통해 상태를 확인할 수 있는 단일 API 엔드포인트(`GET /api/workflow/instruction/{id}`) 추가.

## 2. MVP scope / out-of-scope

**MVP Scope:**
- 기존에 발견된 코드 베이스의 메모리 누수 차단, XSS 취약점 제거, Redis 분산 락 동시성 결함 수정.
- 루프 엔진의 핵심 제어 생명주기(Start, Pause, Resume, Stop, Inject) 최적화 및 E2E 테스트 보장.
- 루프의 장기 실행 안정성을 뒷받침할 알림 클린업 로직 및 명령어 주입 상태 피드백 인터페이스 제공.
- 최종 산출물의 Docker 빌드 및 Preview 포트(7000번대)를 통한 배포 환경 구성 지원.

**Out-of-Scope:**
- LLM과 직접 연동하여 100% 자율적인 코드를 생성, 평가, 병합하는 실제 AI 로직의 완성도 향상 (현재 단계는 루프 엔진의 안정적인 인프라 및 제어 파이프라인 구축에 집중).
- 복잡한 사용자 역할(Role) 기반 권한 제어 시스템 연동.
- 단일 워크스페이스(Workspace)가 아닌, 다중 프로젝트 동시 제어를 위한 대규모 관제 시스템 확장.

## 3. Completion criteria

- `api/app/services/loop_simulator.py` 큐의 최대 길이가 제한되어 명령어 과다 주입 시 메모리가 비정상 증식하지 않아야 합니다.
- 악의적인 `<script>` 및 HTML 태그를 포함한 페이로드가 `sanitizeAlertText`를 통과했을 때 완전히 삭제됨을 `security.test.ts`가 증명해야 합니다.
- Mocking 또는 네트워크 단절을 통해 Redis 장애 상황 연출 시, 중복 워커 실행(Local Lock)이 발생하지 않고 에러 로그와 함께 즉각 중단(Fail-fast)됨을 확인해야 합니다.
- Loop Engine이 Pause 상태로 장기 대기할 때 CPU 사용량이 거의 0에 수렴하는지 `threading.Event` 블로킹을 통해 확인합니다.
- `web/tests/e2e/loop-engine.spec.ts` 시나리오 테스트가 API 포트 3100번을 대상으로 성공적으로 통과해야 합니다.
- 시스템 알림 클린업 및 명령 상태 조회 API가 의도대로 동작함을 나타내는 테스트가 추가 및 통과되어야 합니다.

## 4. Risks and test strategy

- **[Risk] 대기 모드 교착 상태(Deadlock) 위험:** `threading.Event` 기반으로 대기 로직을 변경함에 따라 Pause와 Resume, Stop 신호가 동시다발적으로 발생할 경우 데드락에 빠지거나 신호가 유실될 위험이 있습니다.
  - **[Strategy]** 단위 테스트 단계에서 멀티스레드 환경을 모사하여, 짧은 주기로 Start/Pause/Resume 신호를 무작위 발행하는 스트레스 테스트(`test_loop_simulator_concurrency`)를 추가합니다.
- **[Risk] Fail-fast 정책으로 인한 가용성 저하:** Redis 연결 실패 시 Local Fallback 없이 즉각 중단하므로 단일 인프라 장애가 전체 시스템 중단으로 이어질 수 있습니다.
  - **[Strategy]** 다중 워커의 데이터 오염(Split-brain) 방지가 우선순위이므로 정책을 유지하되, 에러 발생 시 외부 모니터링 시스템이나 관리자 알림 훅이 정상적으로 격발되는지 테스트 케이스를 강화합니다.
- **[Risk] XSS 살균 시 원본 코드 훼손:** DOMPurify 적용으로 인해 정상적인 코드 스니펫(특히 제네릭이나 꺾쇠괄호 구문)이 악성 코드로 오인되어 삭제될 수 있습니다.
  - **[Strategy]** 화이트리스트 태그를 명확히 정의하고, 악성 스크립트 삭제 검증 외에도 일반 텍스트 및 코드 블록이 원본 그대로 유지되는지 확인하는 역검증 시나리오를 `security.test.ts`에 추가합니다.

## 5. Design intent and style direction

- **기획 의도:** Self-Improvement Loop 시스템이 사람의 개입 없이 24시간 코드를 분석하고 개선하는 자율 엔진임을 시각화하며, 사용자가 현재 루프의 단계, 품질 점수(Quality Score), 발생한 알림을 직관적으로 관제 및 제어할 수 있는 모니터링 경험을 제공합니다.
- **디자인 풍:** 전문적인 개발자와 시스템 관리자를 위한 모던 대시보드형 스타일입니다. 군더더기 없는 미니멀리즘과 실시간 데이터 변화가 잘 드러나는 기술적(Tech) 느낌을 강조합니다.
- **시각 원칙:** 
  - **컬러:** 어두운 배경(Dark Theme)을 기본으로 하여 장시간 모니터링에 따른 눈의 피로를 줄입니다. 시스템 정상/실행은 초록/파랑, 대기/경고는 노랑, 오류/보안 이슈는 빨강으로 배색하여 명확한 의미를 전달합니다.
  - **타이포/여백:** 로그 및 코드 분석 지표는 고정폭(Monospace) 폰트를 적용해 가독성을 높입니다. 정보가 밀집된 화면이므로 내부 요소의 패딩은 조밀하게 하되, 각 위젯(모듈) 간의 마진은 넉넉하게 주어 시각적 답답함을 해소합니다.
- **반응형 원칙:** 모바일 우선(Mobile-First) 규칙을 적용합니다. 모바일 기기에서는 핵심 루프 제어 버튼(Start/Pause/Stop)과 품질 점수를 최상단에 세로로 배치하고, 태블릿 및 데스크톱 환경에서는 다중 위젯(로그, 분석 리포트, 구조도 등)이 좌우 그리드로 유연하게 확장되도록 설계합니다.

## 6. Technology ruleset

- **플랫폼 분류:** web 및 api
- **프론트엔드 (web):** React 기반 프레임워크(React + Vite + TypeScript)로 계획
- **백엔드 (api):** FastAPI (Python) 기반으로 계획
- **실행 및 배포 가이드:**
  - **API 서버 포트:** `3100` 포트를 고정하여 로컬 및 E2E 테스트 타겟으로 사용합니다.
  - **Web 프론트엔드 포트:** 로컬 개발 시 `3000`번대 포트를 사용합니다. (예: `3000` 또는 `3001`)
  - **Docker 및 외부 노출:** 1회 실행 사이클 결과물은 Docker 컨테이너화를 기본으로 하며, 외부 Preview 포트는 `7000-7099` 대역을 사용합니다. 외부 노출 기준 도메인은 `http://ssh.manbalboy.com:7000` 이며 CORS 정책은 `.manbalboy.com` 및 `localhost` 계열로 제한합니다.
