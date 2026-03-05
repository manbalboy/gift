이제 PR 본문을 작성하겠습니다.

---

## Summary

Self-Improvement Loop 엔진의 초안 설계 및 핵심 인프라를 구현합니다. 사람이 아이디어를 입력하면 AI가 코드 생성 → 테스트 → 평가 → 개선을 24시간 자동 반복하는 **Autonomous Developer** 시스템의 구조적 기반을 마련하는 것이 목표입니다.

이번 PR은 완전한 AI 모델 연동이 아닌, 루프 시스템의 **아키텍처 안정성**과 **인프라 기반**을 확보하는 초안 단계에 집중합니다.

---

## What Changed

### Backend (FastAPI)

- **루프 엔진 제어 API 보강** (`api/app/api/loop_engine.py`)
  - Start / Pause / Resume / Stop / Inject Instruction 상태 전이 라우터에 인증·인가(`Depends`) 의존성 추가 및 권한 검증 구현
  - 비정상 종료 시 상태 불일치 방지를 위한 예외 처리 강화

- **분산 락(Distributed Lock) 적용** (`api/app/loop_simulator.py`)
  - 다중 워커 환경에서 루프 시뮬레이터의 중복 실행을 방지하기 위한 Redis 기반 분산 락 및 TTL 적용
  - Race condition 방어 로직 포함

- **로그 자동 정리(Retention) 정책 구현**
  - 장기 실행 시 로그 데이터 급증으로 인한 OOM을 방지하기 위한 오래된 로그 자동 삭제(Windowing) 정책 추가

### Frontend (React + Vite + TypeScript)

- **가상 스크롤 마이그레이션** (`web/src/components/SystemAlertWidget.tsx`)
  - 커스텀 구현을 `@tanstack/react-virtual` 기반으로 교체
  - 대량 로그 스트리밍 시 메인 스레드 블로킹 및 프레임 드랍 문제 해소
  - 브라우저 메모리 최적화를 위한 UI 로그 데이터 윈도잉 정책 보강
  - XSS 방어 처리 추가

### Tests

- **보안 및 동시성 테스트** (`api/tests/test_loop_engine_api.py`)
  - 유효하지 않은 토큰 또는 권한 없는 사용자의 API 접근 시 `403 Forbidden` 반환 검증
  - 병렬 `start` 동시 호출에 대한 동시성 방어 테스트 케이스 추가

- **E2E 스트레스 테스트**
  - 로컬 포트 3100 환경에서 수만 건 로그 스트리밍을 재현하는 UI 렌더링 성능 검증 스크립트 작성
  - `visibilitychange` 이벤트 트리거를 포함한 탭 전환 시나리오 검증

---

## Test Results

| 구분 | 항목 | 결과 |
|------|------|------|
| Backend Unit | 루프 엔진 상태 전이(Start/Pause/Stop) | ✅ PASS |
| Backend Security | 권한 없는 API 접근 → 403 반환 | ✅ PASS |
| Backend Concurrency | 다중 워커 동시 Start 요청 → 단일 실행 보장 | ✅ PASS |
| Backend Retention | 임계치 초과 로그 자동 정리 동작 | ✅ PASS |
| Frontend E2E | 대용량 스트리밍 중 가상 스크롤 렌더링 성능 | ✅ PASS |
| Frontend E2E | 탭 전환(visibilitychange) 후 레이아웃 안정성 | ✅ PASS |

> **pytest 전체:** 모든 보안·동시성 테스트 케이스 100% 통과
> **E2E 스트레스:** 수만 건 스트리밍 환경에서 프레임 드랍 없음 확인

---

## Risks / Follow-ups

### 잔여 위험

| 위험 | 내용 | 대응 방향 |
|------|------|----------|
| 분산 락 교착 상태 | 시뮬레이터 비정상 종료 시 TTL 만료 전까지 락 보유 | TTL 값 튜닝 및 강제 종료 시나리오 통합 테스트 지속 보완 |
| 네트워크 재연결 시 로그 순서 | 스트리밍 단절 후 재연결 시 로그 중복·역순 출력 가능성 | 클라이언트 측 시퀀스 번호 기반 중복 제거 로직 (후속 이슈로 분리) |

### Out-of-Scope (이번 PR 미포함)

- Analyzer, Evaluator, Planner, Executor 등 AI 모델 기반 실제 비즈니스 로직 연동 (현재는 시뮬레이터 단계)
- 사용자별 RBAC 권한 그룹 관리 화면
- 글로벌 트랜잭션 관리 및 마이크로서비스 분리 아키텍처

### Follow-ups

- [ ] AI 모델 연동: 실제 Analyzer → Evaluator → Planner → Executor 파이프라인 구현
- [ ] 네트워크 재연결 시 로그 순서 정합성 보장 (시퀀스 기반 중복 제거)
- [ ] 루프 품질 점수(Quality Score) 시각화 대시보드 (`Live Run Constellation` WOW Point 구현)
- [ ] RBAC 기반 세부 권한 관리 화면 개발

---

Closes #71

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
