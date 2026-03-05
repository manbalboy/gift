```markdown
## Summary

Self-Improvement Loop Engine의 초안 설계 및 구현입니다.
사용자가 아이디어를 입력하면 시스템이 **코드 생성 → 테스트 → 평가 → 개선** 주기를 자동으로 반복하는 Autonomous Developer 파이프라인을 구축하였습니다.

FastAPI(api) + React(web) 기반으로 Analyzer → Evaluator → Improvement Planner → Executor 4단계 파이프라인을 구성하였으며, 리뷰에서 지적된 보안·안정성 결함을 함께 수정하였습니다.

---

## What Changed

### [P0] 루프 엔진 핵심 파이프라인 (api)
- `Analyzer`, `Evaluator`, `Improvement Planner`, `Executor` 4단계 파이프라인 구현
- 각 단계 간 상태 전이 및 교착 상태(Deadlock) 방지 로직 적용
- Memory 시스템(장기 기억) 연동 기본 구조 구현 — 프로젝트 아키텍처, 버그 이력, 개선 이력, 성능 메트릭 저장

### [P0] 제어 API 및 루프 안정성 (api)
- `Start` / `Pause` / `Resume` / `Stop` / `Inject Instruction` 5종 제어 API 구현
- `Pause` · `Stop` 호출 시 백그라운드 스레드 Graceful Shutdown 보장
- 중복 수정 방지 및 무한 루프 차단 (`max_loop_count`, `budget_limit`, `duplicate_change_detection`, `quality_threshold`)
- CORS 허용 origin 필터링 강화 (`manbalboy.com` 계열 및 `localhost` 계열로 제한)

### [P1] 대시보드 및 실시간 로그 스트리밍 (web, api)
- SSE 기반 실시간 로그 스트리밍 구현 (Sequence ID 동기화로 중복 렌더링 차단)
- `sanitizeAlertText`에 DOMPurify 적용 — HTML·Script 태그 완전 제거로 XSS 취약점 수정
- Live Run Constellation (Canvas/SVG 기반 실시간 노드 상태 미니맵) 구현
- 다크 테마 기반 모던 대시보드 UI, Mobile-First 반응형 레이아웃 적용

### [P2] 장기 실행 인프라 안정화 (api)
- DB Connection Pool 타임아웃 및 반환 누수 방지 로직 최적화
- `_pending_instructions` 큐에 `maxlen` 지정 — Inject Instruction 누적에 의한 OOM 방어
- Loop Simulator 일시정지 대기 로직을 `time.sleep` 방식에서 `threading.Event.wait()` 기반으로 교체 (Busy Wait 제거)
- Redis 락 획득 실패 시 Local Lock Fallback 제거 → Fail-fast 처리로 다중 노드 무결성 확보

---

## Test Results

| 구분 | 항목 | 결과 |
|------|------|------|
| 단위 테스트 | Safe Mode 전환, XSS 살균 로직, 파이프라인 상태 전이 | 통과 |
| 통합 테스트 | Redis 락 Fail-fast 분기, DB 커넥션 풀 반환 | 통과 |
| 스트레스 테스트 | 대규모 로그 스트리밍 OOM 방어 (포트 3100 타겟) | 통과 |
| E2E 시나리오 | `Start → Inject → Pause → Resume → Stop` 전체 생명주기 | 미작성 (Follow-up 참조) |

### Docker Preview

| 항목 | 값 |
|------|-----|
| 컨테이너 | `agenthub-preview-cdb309bd` |
| 이미지 | `agenthub/new-mind-cdb309bd:latest` |
| 외부 포트 | `7004` |
| External URL | http://ssh.manbalboy.com:7004 |
| CORS | `https://manbalboy.com`, `http://manbalboy.com`, `https://localhost`, `http://localhost`, `https://127.0.0.1`, `http://127.0.0.1` |
| 상태 | **failed** — `[Errno 104] Connection reset by peer` (인프라 레벨 원인 조사 필요) |

---

## Risks / Follow-ups

- **Docker Preview 실패:** 컨테이너 기동 후 `[Errno 104] Connection reset by peer` 발생. 포트 바인딩 충돌 또는 컨테이너 내부 앱 시작 실패 가능성 — 인프라 팀과 함께 원인 추적 필요.
- **E2E 테스트 미작성:** Loop Engine 전체 생명주기(`Start → Inject Instruction → Pause → Resume → Stop`)를 검증하는 `web/tests/e2e/loop-engine.spec.ts` 스크립트 신규 작성이 필요합니다. (`REVIEW.md` TODO 참조)
- **다중 프로젝트 동시 처리 미지원:** 이번 MVP 범위에서 제외. 단일 프로젝트 루프에 집중하였으며, 분산 처리는 향후 과제로 분류.
- **Quality Score 임계값 튜닝 필요:** 현재 `minimum improvement delta = 3%` 기준값은 초안 수준이며, 실제 사용 패턴을 반영한 보정이 필요합니다.

---

Closes #71
```
