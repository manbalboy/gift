---

## Summary

이슈 #71 "[초장기] 루프엔진 설계해서 초안을 준비하시오" 요건을 충족하는 **Self-Improvement Loop Engine MVP 초안**을 구현합니다.

아이디어 입력 → 계획 → 코드 생성 → 테스트 → 평가 → 개선을 24시간 반복 수행하는 Autonomous Developer 시스템의 핵심 4대 엔진(Analyzer / Evaluator / Planner / Executor) 아키텍처와 모의(Mock) 엔드포인트를 설계하였습니다. 동시에 프론트엔드 대용량 로그 렌더링 안정성 및 보안 취약점 패치를 병행하였습니다.

---

## What Changed

### Backend (FastAPI)

| 영역 | 내용 |
|---|---|
| Loop Engine API | Analyzer / Evaluator / Planner / Executor 4대 엔진의 Mock 엔드포인트 초안 (`/loop/analyze`, `/loop/evaluate`, `/loop/plan`, `/loop/execute`) |
| Loop Control | `max_loop_count`, `budget_limit`, `duplicate_change_detection`, `quality_threshold` 기반 루프 안정성 제어 스키마 (Pydantic / SQLAlchemy) |
| 루프 시뮬레이터 | `LoopSimulator` 백그라운드 스레드 Start / Pause / Resume / Stop / InjectInstruction 상태 제어 구현 |
| 장기 기억 스키마 | `project architecture`, `design decisions`, `bug history`, `improvement history`, `test results`, `performance metrics` 저장을 위한 Memory 스키마 정의 |
| CORS 수정 | `_CORS_ALLOWED_PORT_PATTERN` 정규식을 `(?:31\d{2})` → `(?:31\d{2}\|70\d{2})`로 수정하여 7000-7099 Preview 포트 허용 |

### Frontend (React / Vite)

| 영역 | 내용 |
|---|---|
| ErrorLogModal 컴포넌트 분리 | 인라인 렌더링 구조에서 별도 컴포넌트(`ErrorLogModal.tsx`)로 추출 |
| 대용량 로그 Truncation | 5,000자 초과 시 "Show more" 버튼 노출, `overflow-y: auto` / `word-break: break-all` 적용 |
| 루프 오버런 카운트 표시 | 루프 횟수 초과 시 UI 상 오버런 카운트 시각화 |
| XSS 보안 정규식 패치 | `SAFE_GENERIC_PATTERN` ReDoS 방지 처리 및 제네릭 문법(`<T>`) 오탐 방지 정규식 수정 |
| 클립보드 예외 처리 | `navigator.clipboard.writeText` 권한 거부 상황 예외 처리 및 Toast 알림 연동 |

---

## Test Results

| 구분 | 결과 | 비고 |
|---|---|---|
| API 단위 테스트 (`pytest`) | 통과 | Loop Engine 엔드포인트 Mock 응답 검증 |
| Web 단위 테스트 (`Vitest`) | 통과 | XSS 방어 페이로드 / 제네릭 교차 검증, 클립보드 Mock 테스트 |
| 로컬 수동 통합 테스트 | 통과 | 빈 문자열 / 극단적 대용량 텍스트 주입 시 UI 레이아웃 붕괴 없음 |
| CORS Preflight 테스트 | 통과 | `manbalboy.com` / `localhost` 계열 허용, 이외 도메인 차단 확인 |
| Docker Preview | **실패** | `http://ssh.manbalboy.com:7004` — `[Errno 104] Connection reset by peer` |

> Docker Preview 빌드 실패로 인해 외부 URL 접근 불가 상태입니다. 후속 작업으로 원인 조사 필요합니다.

---

## Risks / Follow-ups

### 잔존 위험

- **Loop Engine 좀비 상태**: `_run_forever` 내부 예외 발생 시 `self._mode`가 `"running"`으로 고착될 수 있습니다. 전역 `try-except` 블록 및 `self._mode = "stopped"` 복구 로직이 필요합니다.
- **XSS 복원 잠재 취약점**: `restoreSafeGenericTokens` 복원 후 `dangerouslySetInnerHTML` 사용 시 이벤트 핸들러 속성 기반 XSS가 실행될 수 있습니다. 허용 속성/태그 화이트리스트 교차 검증 로직 강화가 필요합니다.
- **멀티바이트 문자 절삭 깨짐**: `.slice(0, 5000)` 경계에 한글·이모지 등 멀티바이트 문자가 위치할 경우 깨진 문자가 렌더링될 수 있습니다.
- **ErrorLogModal 전체 보기 프리징**: "전체 보기" 전환 시 수만 자 이상의 텍스트가 DOM에 즉시 렌더링되면 브라우저 메인 스레드가 차단될 수 있습니다. 가상화(Virtualization) 또는 청크 페이지네이션 도입이 권장됩니다.

### 후속 과제

- [ ] `LoopSimulator._run_forever` 글로벌 예외 처리 및 상태 복구 로직 추가
- [ ] `security.ts` 복원 로직 XSS 화이트리스트 교차 검증 강화
- [ ] `ErrorLogModal` 전체 보기 렌더링 가상화 적용
- [ ] 멀티바이트 문자 안전 절삭(`Intl.Segmenter` 또는 유사 방법) 처리
- [ ] Docker Preview 빌드 실패 원인(`Connection reset by peer`) 조사 및 수정
- [ ] 백그라운드 루프 비정상 종료 / 예산 초과 시나리오에 대한 pytest 단위 테스트 추가
- [ ] 실제 AI 모델 연동 (현재 MVP는 Mock 수준)

---

Closes #71

## Deployment Preview
- Docker Pod/Container: `agenthub-preview-cdb309bd`
- Status: `failed`
- External port: `7004` (7000 range policy)
- Container port: `7000`
- External URL: http://ssh.manbalboy.com:7004
- Health probe: http://127.0.0.1:7004/
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Docker preview failed: [Errno 104] Connection reset by peer
