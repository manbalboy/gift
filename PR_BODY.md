```markdown
## Summary

이슈 #69 "해당 워크 플로를 각각 상세하게 수정 구현할 수 있는 형태로 개발해주세요" 요청에 따라, DevFlow Agent Hub의 워크플로우 수정·관제 기능을 단순 대시보드 관람 구조에서 **기능 중심의 직접 편집·제어 구조**로 전환합니다.

이번 PR은 SPEC에서 정의한 6개 확장 아이디어(Workflow Engine v2 · Autopilot Control Plane · Agent SDK · Artifact Workspace · Visual Builder · Event Bus) 중 **P0 우선순위 필수 픽스**를 완료하고, 리뷰에서 지적된 보안·버그·테스트 취약점을 전면 보강합니다.

---

## What Changed

### Backend (FastAPI / Python)

| 파일 | 변경 내용 |
|---|---|
| `api/app/services/system_alerts.py` | `_sanitize_string`에 입력 최대 길이(10,000자) 선제 절삭 로직 추가 → **ReDoS 취약점 차단** |
| `api/app/services/workflow_engine.py` | 노드 단위 예산(Budget) 한도 초과 시 즉시 중단 정책 적용, 루프 탐지 로직 강화 |
| `api/app/api/workflows.py` | 워크플로우 실행·중단·재시도 API 엔드포인트 보강 |
| `api/app/schemas/logs.py` | 커서 기반 페이징을 위한 스키마 필드 추가 |
| `api/app/core/config.py` | 허용 최대 입력 길이 등 운영 설정값 중앙화 |

### Frontend (React / TypeScript)

| 파일 | 변경 내용 |
|---|---|
| `web/src/components/SystemAlertWidget.tsx` | 텍스트 컨테이너에 `word-break: break-all` · `overflow-wrap: anywhere` 강제 적용 → **모바일 레이아웃 붕괴 버그 해결** |
| `web/src/styles/app.css` | 전역 반응형 텍스트 오버플로우 방어 스타일 추가, 다크 테마 토큰 정합 |
| `web/src/components/Dashboard.tsx` | 알림 일괄 초기화(Clear All) 버튼 위젯 연동 |
| `web/src/components/LiveRunConstellation.tsx` | 상태 이벤트 갱신 안정성 개선 |
| `web/src/components/StatusBadge.tsx` | 시맨틱 상태 컬러 토큰(`failed/running/waiting`) 정합 |
| `web/src/components/WorkflowBuilder.tsx` | 노드 편집 진입점 UI 연결 |
| `web/src/types/index.ts` | 커서 페이징 관련 타입 정의 추가 |

### Scripts / Infra

| 파일 | 변경 내용 |
|---|---|
| `web/scripts/check-port.mjs` | 포트 락 획득·해제 로직 강화, 타임아웃 여유(3초+) 보장 |
| `web/scripts/test-port-timeout.sh` | 다중 백그라운드 프로세스 경합 시 정상 릴리즈 커버리지 시나리오 추가 |

### Tests

| 파일 | 변경 내용 |
|---|---|
| `api/tests/test_workflow_engine.py` | Budget 한도 경계값(일치·초과 직후) 단위 테스트 보강 |
| `api/tests/test_logs_api.py` | 커서 기반 페이징 API 통합 테스트 추가 |
| `api/tests/test_workspace_security.py` | 20,000자 초과 페이로드 주입 → CPU 지연 없이 절삭 처리되는지 검증 |
| `web/tests/e2e/system-alert.spec.ts` | 모바일 뷰포트(320px) + 극단적 장문 텍스트 주입 시 레이아웃 이탈 없음 E2E 시나리오 추가 |

---

## Test Results

| 구분 | 결과 |
|---|---|
| pytest (백엔드 전체) | **165 passed / 0 failed / 0 errors** (36.44s) |
| E2E Playwright (모바일 뷰포트) | PASS — 오버플로우 없음 확인 |
| 포트 경합 쉘 스크립트 | PASS — 종료코드 `0`, 정상 릴리즈 확인 |
| ReDoS 방어 (20,000자 페이로드) | PASS — 절삭 후 정규식 미도달, CPU 지연 없음 |

> 전체 테스트 스테이지: `test_after_fix` / 테스터: Gemini / 소요: 39.05s

---

## Risks / Follow-ups

| 항목 | 내용 | 상태 |
|---|---|---|
| Workflow Engine v2 완전 전환 | 내장 엔진을 Temporal/LangGraph로 대체하는 작업은 본 MVP 사이클 **Out-of-scope** | 후속 P0-1 스프린트 예정 |
| Cursor 기반 페이징 전면 적용 | 현재 logs API에 부분 적용, 시스템 알림 전체 전환은 다음 사이클 | 후속 P2 Enhancement |
| Clear All API 백엔드 구현 | 프론트엔드 버튼 연결 완료, Soft-delete 엔드포인트 추가 필요 | 후속 P2 Enhancement |
| Autopilot Control Plane (B) | 지시 주입/중단/재개 Control Plane은 P0-3 단계로 별도 PR 예정 | 후속 4~8주 |
| Visual Workflow Builder (E) | ReactFlow 기반 편집 UI는 P1 단계 별도 PR 예정 | 후속 3~6주 |
| ReDoS 허용 길이 조정 | 현재 10,000자 절삭 — 운영 데이터 패턴 확인 후 조정 필요 | 운영 모니터링 후 결정 |

---

Closes #69
```

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
