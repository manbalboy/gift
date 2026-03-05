## Summary

이 PR은 이슈 #71 **"루프엔진 설계해서 초안을 준비하시오"** 에 대응하여, AI가 코드 생성 → 테스트 → 평가 → 개선 사이클을 24시간 자율 반복하는 **Self-Improvement Loop Engine** 의 설계 초안 및 MVP 구현을 제출합니다.

기존 아키텍처에 급격한 변경 없이 `api/` 및 `web/` 디렉토리 구조를 연장하는 방식으로, Autonomous Developer 시스템의 핵심 4단계 엔진 파이프라인(Analyzer → Evaluator → Planner → Executor)을 설계하고 초안을 완성했습니다.

---

## What Changed

### [P0] 버그 수정 및 안정화

| 항목 | 변경 파일 | 내용 |
|------|-----------|------|
| P0-1 | `web/src/utils/security.ts` | DOMPurify 및 커스텀 정규식 과적합 수정 — `<T>` 등 제네릭/꺾쇠괄호 텍스트가 HTML 인코딩(`&lt;`, `&gt;`) 방식으로 안전하게 렌더링되도록 보완 |
| P0-2 | `web/tests/security.test.ts`, `SystemAlertWidget.test.tsx` | 변경된 보안 필터 로직에 맞춰 XSS 유닛 테스트 Assertion 수정 및 역검증 케이스 추가 |
| P0-3 | `web/src/components/` | 큐 오버플로우로 지시사항이 `dropped` 처리된 경우 사용자에게 명시적으로 안내하는 경고 Toast/알림 UI 연동 |
| P0-4 | `api/tests/test_workflow_engine.py` | Redis Lock 획득 실패(Fail-fast) → 시스템 에러 상태 전환 → 포트 3100 API 응답 경고 전파 전체 흐름을 검증하는 E2E 테스트 시나리오 추가 |

### [P1] Self-Improvement Loop 코어 엔진 설계 (MVP)

| 항목 | 변경 파일 | 내용 |
|------|-----------|------|
| P1-1 | `api/app/services/workflow_engine.py` | Analyzer → Evaluator → Planner → Executor 4단계 데이터 흐름 설계 및 Quality Score 계산 로직 초안 구현 |
| P1-2 | `api/app/api/workflows.py` | Long-Running Workflow 제어 API 추가 — `Start`, `Pause`, `Resume`, `Stop`, `Inject Instruction` 엔드포인트 구현 |
| P1-3 | `api/app/services/loop_simulator.py` | 루프 안정성 제어 정책 적용 — `max_loop_count`, `quality_threshold`, `budget_limit`, `duplicate_change_detection` 기반 무한반복/코드 퇴화 방지 로직 통합 |

### [P2] 상태 모니터링 UI 연동

| 항목 | 변경 파일 | 내용 |
|------|-----------|------|
| P2-1 | `web/src/components/LoopMonitorWidget.tsx` (신규) | 루프 엔진의 현재 Quality Score, 실행 중인 Task, 잔여 반복 횟수를 대시보드 카드로 실시간 표시 — 디자인 시스템(다크 테마, 시맨틱 상태 색상 토큰) 기준 준수 |

---

## Test Results

| 테스트 항목 | 결과 | 비고 |
|------------|------|------|
| `security.test.ts` XSS 역검증 유닛 테스트 | ✅ PASS | 악성 페이로드 차단 + 정상 제네릭 코드 텍스트 보존 모두 확인 |
| `SystemAlertWidget.test.tsx` 컴포넌트 테스트 | ✅ PASS | 수정된 DOMPurify 동작에 맞춰 Assertion 업데이트 완료 |
| `test_workflow_engine.py` E2E 장애 전파 테스트 | ✅ PASS | Redis Lock Fail-fast → 포트 3100 API 경고 전파 정상 확인 |
| 루프 제어 API (`Pause` / `Resume` / `Stop`) 동작 확인 | ✅ PASS | `max_loop_count` 도달 시 루프 안전 자동 종료 확인 |
| Web(3000), API(3100) 포트 충돌 없는 동시 구동 | ✅ PASS | 로컬 환경 Docker 실행 기준 정상 |

> **주의**: 다중 Pause/Resume/Stop 신호 동시 인가 시나리오(Race Condition 동시성 스트레스 테스트)는 아직 미완성으로, 수동 검증 단계에서 데드락 미발생을 확인하였으나 자동화 테스트 작성이 후속 과제로 남아 있습니다.

---

## Risks / Follow-ups

### 현재 잔존 위험

1. **Race Condition 자동화 테스트 부재**
   - Pause, Resume, Stop 제어 신호가 0.1초 이내 간격으로 복수 인가될 때 스레드 데드락 또는 상태 꼬임 발생 가능성이 이론적으로 존재합니다.
   - 현재는 수동 시나리오 검증으로 대체. 동시성 스트레스 테스트 자동화는 후속 이슈로 분리 추적 예정입니다.

2. **큐 오버플로우 Silent Drop 인지 지연**
   - 클라이언트가 API 폴링 타이밍을 놓칠 경우, `dropped` 처리된 지시사항을 영원히 인지하지 못하는 엣지 케이스가 잔존합니다.
   - 단기 대책: Toast 알림 UI 연동(P0-3)으로 최소 한 번 이상 알림이 노출되도록 처리.
   - 장기 대책: WebSocket 또는 SSE 기반 실시간 푸시 방식으로 전환 검토가 필요합니다.

3. **LLM 연동 및 실제 코드 분석 엔진은 Out-of-scope**
   - 현재 Analyzer/Evaluator/Executor는 실제 LLM 연동 없이 시뮬레이션 모드로 동작합니다.
   - 실 사용을 위한 프로덕션 레벨의 코드 리팩토링 자동화 및 PR 생성 로직 연동은 별도 이슈로 처리 필요합니다.

### 후속 작업 (Follow-ups)

- [ ] 동시성 스트레스 테스트 시나리오 자동화 구성
- [ ] 큐 드롭 알림 SSE/WebSocket 기반 실시간 푸시 전환 검토
- [ ] LLM 연동 기반 실제 코드 분석/리팩토링 엔진 고도화
- [ ] `LoopMonitorWidget` Live Run Constellation 인터랙티브 미니맵 구현 (DESIGN_SYSTEM WOW Point)
- [ ] 대규모 AST 파싱 기반 딥 분석 엔진 연구

---

Closes #71
