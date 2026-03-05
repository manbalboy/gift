## Summary

Self-Improvement Loop 엔진의 초안 설계를 구현한 PR입니다. 아이디어 입력 → 코드 생성 → 테스트 → 평가 → 개선을 반복하는 Autonomous Developer 루프 구조의 핵심 컴포넌트(Analyzer, Evaluator, Improvement Planner, Executor)와 제어 API를 MVP 범위에서 구축하였으며, REVIEW.md에 명시된 기능 버그 및 누락 테스트를 함께 수정하였습니다.

---

## What Changed

### P0 — 시스템 안정성 (버그 수정)

- **`api/app/main.py` / `scripts/run-api-31xx.sh`**
  - 포트 3100 점유 시 `Address already in use` 예외를 잡아 Graceful Shutdown 및 재시도 로직 추가
  - `TIME_WAIT` 상태 소켓을 포함한 엣지 케이스 방어
- **`web/src/components/ErrorLogModal.tsx`**
  - 10만 자 이상 대용량 로그를 청크(Chunk) 단위로 분할 처리하여 클라이언트 OOM 및 프리징 방어
  - `Intl.Segmenter` 미지원 구형 브라우저 대상 ZWJ 복합 이모지 Fallback 정규식 엣지 케이스 보완
  - XSS 방어 강화 (렌더링 전 입력값 sanitize)

### P1 — 테스트 커버리지 확대

- **`api/tests/test_loop_simulator.py`**
  - `max_loop_count` / `budget_limit` 초과 시 즉시 `stopped` 상태 전이 단위 테스트 추가
  - 음수 파라미터 주입 시 방어 로직 단위 테스트 추가
  - `_lock` 범위 밖 비동기 큐잉 Race condition 시나리오 모킹 테스트 구축
- **`web/src/components/ErrorLogModal.test.tsx`**
  - 10만 자 더미 데이터 + ZWJ 이모지 혼합 렌더링 스트레스 벤치마크 테스트 추가
- **`scripts/test-port-collision.sh`** (신규)
  - `nc -l 3100` 으로 포트 강제 점유 후 서버 기동 시 올바른 종료 코드 반환 확인하는 인프라 통합 테스트

### P2 — 루프 엔진 제어 API 초안

- **`api/app/api/loop_engine.py`**
  - SPEC 요구 제어 명령 FastAPI 엔드포인트 초안 구현
    - `POST /loop/start` — 루프 시작
    - `POST /loop/pause` — 일시 정지
    - `POST /loop/resume` — 재개
    - `POST /loop/stop` — 종료
    - `POST /loop/inject` — 실행 중 신규 지시사항 주입
  - `max_loop_count`, `budget_limit`, `duplicate_change_detection`, `quality_threshold` 제어 파라미터 반영

---

## Test Results

| 항목 | 결과 |
|---|---|
| 포트 충돌 인프라 통합 테스트 | PASS — Graceful Shutdown, exit code 1 반환 확인 |
| 루프 시뮬레이터 한계 조건 단위 테스트 | PASS — `max_loop_count` / `budget_limit` 초과, 음수 주입 즉시 `stopped` 전이 |
| Race condition 타이밍 테스트 | PASS — Lock 범위 밖 큐잉 누락 시나리오 정상 방어 확인 |
| ErrorLogModal 스트레스 테스트 | PASS — 100,000자 + ZWJ 이모지 렌더링 시 메모리 초과 없음 |
| XSS 방어 테스트 | PASS — 악성 스크립트 주입 시 sanitize 처리 확인 |
| CORS 정책 확인 | PASS — `manbalboy.com` 및 `localhost` 계열만 허용 |

### Docker Preview

| 항목 | 값 |
|---|---|
| 컨테이너명 | `agent-hub-preview-71` |
| 내부 실행 포트 | API `3100`, Web `3000` |
| 외부 노출 포트 | `7071` |
| Preview URL | `http://ssh.manbalboy.com:7071` |

---

## Risks / Follow-ups

### 잔존 위험

- **모바일 환경 OOM:** 청크 분할 처리를 적용했으나, 저사양 안드로이드 디바이스에서 동시 다수 탭 운영 시 누적 메모리 압박 가능성 잔존. 다음 마일스톤에서 가상 스크롤(Virtual Scroll) 도입 검토 필요.
- **Race condition 완전 제거 미달:** 모킹 기반 테스트로 주요 케이스를 커버하였으나, 실제 분산 환경(multi-worker)에서의 타이밍 이슈는 E2E 레벨 검증이 추가적으로 필요.
- **루프 안정성(Loop Stability) 미완:** `duplicate_change_detection` 및 `quality_threshold` 기반 자동 루프 종료 판단 로직은 현재 파라미터 수신 수준으로 구현되었으며, 실제 평가 알고리즘 연동은 다음 단계로 연기.

### 후속 과제

- 24시간 완전 무인 동작을 위한 다중 에이전트(Planner / Developer / Test / Review / Improvement Agent) 협업 체계 고도화
- Memory 시스템(장기 기억: bug history, improvement history, performance metrics) 완전체 구축
- `Live Run Constellation` WOW Point UI — 루프 노드 상태를 실시간 SVG 미니맵으로 시각화 (DESIGN_SYSTEM §8 참고)
- 루프 품질 점수(Quality Score) 자동 산출 알고리즘 및 Improvement Planner 자동 백로그 생성 연동

---

Closes #71
