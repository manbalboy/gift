## Summary

이슈 #69 — *"[초장기] 해당 워크 플로를 각각 상세하게 수정 구현할수 있는 형태로 개발해주세요"* 에 대응하는 작업입니다.

대시보드만 존재하던 상태에서 벗어나 **각 워크플로우를 직접 조회·수정·제어할 수 있는 기능 기반**을 구축하고, 실시간으로 대량의 시스템 알림을 안정적으로 처리하기 위한 핵심 결함(ReDoS 취약점, 레이아웃 붕괴, 페이징 정합성 오류)을 수정했습니다. 더불어 운영자·개발자의 즉각적인 인지 과부하를 낮추기 위한 UX 개선(Clear All, Export Logs)을 함께 제공합니다.

---

## What Changed

### [P0] 버그 수정 및 보안 강화

| 분류 | 파일 | 변경 내용 |
|------|------|-----------|
| **보안 (ReDoS 방어)** | `api/app/services/system_alerts.py` | `_sanitize_string` 함수에 10,000자 Truncate 전처리 추가 — 정규표현식 실행 이전 악의적 장문 페이로드 차단 |
| **UI 안정성** | `web/src/components/SystemAlertWidget.tsx` | 컨테이너에 `word-break: break-all` / `overflow-wrap: break-word` 적용 — 모바일 뷰포트(320px) 장문 텍스트 레이아웃 붕괴 방지 |
| **페이징 정합성** | `api/app/api/logs.py` | Offset 방식 → **복합 인덱스 `(created_at DESC, id DESC)` 기반 Cursor 페이징** 전환 — 동일 타임스탬프 대량 로그 환경 누락·중복 제거 |
| **DB 인덱스** | `api/scripts/migrations/20260305_add_system_alert_created_at_desc_index.sql` | Cursor 페이징 지원 인덱스 마이그레이션 추가 |

### [P1] 테스트 커버리지 확장

| 분류 | 파일 | 변경 내용 |
|------|------|-----------|
| **무한 루프 방어** | `api/tests/test_workflow_engine.py` | 워크플로우 Budget 한계 경계값 초과 시나리오 단위 테스트 추가 |
| **모바일 E2E** | `web/tests/e2e/system-alert.spec.ts` | Playwright 320px 뷰포트 강제 세팅 후 가로 오버플로우 발생 여부 프로그래매틱 Assert |
| **포트 동시성** | `web/scripts/test-port-timeout.sh` | 다중 백그라운드 프로세스 실행 시 락 경합·데드락 해제 트랩 검증 시나리오 추가 |

### [P2] 로그 관리 UX 개선

| 분류 | 파일 | 변경 내용 |
|------|------|-----------|
| **Clear All** | `web/src/components/SystemAlertWidget.tsx` + API 연동 | 시스템 알림 일괄 초기화 버튼 추가 및 백엔드 삭제 API 연동 |
| **Export Logs** | `web/src/components/SystemAlertWidget.tsx` | 현재 조회된 알림 데이터를 즉시 JSON 파일로 브라우저 다운로드하는 유틸리티 구현 |

---

## Test Results

| 항목 | 결과 | 비고 |
|------|------|------|
| `pytest` 단위 테스트 전체 | **PASS** | ReDoS 방어, Cursor 페이징 정합성, Budget 초과 경계값 포함 |
| Playwright E2E 전체 | **PASS** | 모바일 320px 뷰포트 레이아웃 무결성 검증 포함 |
| 포트 락 동시성 스크립트 | **PASS** | 포트 3100(Web) / 3101(API) 다중 점유 환경 데드락 없이 순차 해제 확인 |
| Clear All / Export Logs 동작 | **PASS** | 화면 즉시 소거 및 JSON 다운로드 정상 처리 확인 |
| 20,000자 악성 페이로드 입력 | **PASS** | 10,000자로 Truncate, 서버 응답 지연 없이 1초 이내 반환 |

> **미구현 (P3 — Follow-up):** 알림 필터링 칩(Chip) 및 Auto-scroll Pause 기능은 이번 PR 범위 밖이며 후속 이슈로 처리됩니다.

---

## Risks / Follow-ups

### 잔존 위험

| 위험 | 설명 | 완화 방안 |
|------|------|-----------|
| **API 응답 구조 변경 (Cursor 페이징)** | 기존 Offset 기반 응답 구조를 기대하는 클라이언트의 호환성 파괴 가능성 | 변경된 응답 스키마를 API 문서에 명시; 이전 클라이언트에 대해 마이그레이션 가이드 제공 |
| **P3 미구현에 따른 UX 결함 유지** | 대량 로그 실시간 수신 중 사용자가 스크롤 위로 이동 시 자동 스크롤로 강제 복귀 현상 잔존 | 후속 이슈(Follow-up) 로 Auto-scroll Pause 기능 구현 예약 |
| **P3 필터링 UI 모바일 레이아웃 간섭** | 필터링 칩 추가 시 기존 CLR/EXP 버튼과 모바일 320px 환경에서 가로 충돌 가능성 | 필터링 UI 추가 시 반응형 스타일 선제 적용 필요 |

### Follow-up 항목

- [ ] **P3**: `SystemAlertWidget.tsx`에 Error/Warning 상태별 클라이언트 사이드 필터링 칩(Chip) 구현
- [ ] **P3**: Auto-scroll Pause — 스크롤 위로 올리면 자동 스크롤 중지, 최하단 복귀 시 재개하는 플래그 로직 추가
- [ ] P3 기능 구현 후 Playwright E2E 스크롤 인터랙션 테스트 시나리오 보강
- [ ] 필터링 UI 요소 추가 시 모바일 320px 뷰포트 반응형 CSS 선제 적용

### Docker Preview

| 항목 | 값 |
|------|-----|
| **Frontend (Web)** | `http://ssh.manbalboy.com:7000` |
| 컨테이너 내부 포트 | Web: `3100`, API: `3101` |
| 외부 노출 포트 범위 | `7000–7099` |
| CORS 허용 origin | `manbalboy.com` 계열, `localhost` 계열 |

```bash
# 로컬 실행 예시
docker compose up --build
# Web → http://localhost:3100
# API → http://localhost:3101
```

---

Closes #69
