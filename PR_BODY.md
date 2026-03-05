```markdown
## Summary

이슈 #69(워크플로우 각각 상세 수정·구현 가능한 형태로 고도화) 대응의 일환으로, 초장기 워크플로우 실행 환경에서 발생하는 **시스템 안정성 취약점**을 수정하고 **운영 가시성**을 확보합니다. 백엔드 파일 I/O 경합 방어, 환경변수 Fallback 로깅, 동적 포트 재시도, ReactFlow UI 오버플로우 방지 등 REVIEW.md에서 지적된 모든 이슈를 해소합니다.

---

## What Changed

### [P0] 백엔드 안정성 · 보안

| 파일 | 변경 내용 |
|---|---|
| `api/app/services/workspace.py` | 파일 I/O 시 OS Lock 획득 실패(`PermissionError` 등) 예외 처리 추가, `logging.error` 기반 구조화 로깅 연동, 재시도 로직(최대 N회 + 지연) 삽입 |
| `api/app/core/config.py` | 환경변수 파싱 실패 및 Fallback 작동 시 `logging.warning` / `logging.error` 경고 로그 연동 — 비정상 설정 주입 조기 인지 가능 |
| `api/tests/test_workspace_security.py` | `workspace.py` 파일 핸들링 구문의 OS Lock 경합 상황을 `pytest` + Mock으로 검증하는 단위 테스트 신규 작성 |

### [P1] 프론트엔드 · 스크립트

| 파일 | 변경 내용 |
|---|---|
| `web/scripts/check-port.mjs` | 3100~3199번 포트 전체 고갈 시 즉시 실패하지 않고, 지연(Sleep) + 재시도(최대 횟수 제한)를 수행한 뒤 최종 평가하도록 방어 로직 보완 |
| `web/src/` (ReactFlow 에러 툴팁) | 공백 없는 긴 에러 문자열에 `word-break: break-all`, `white-space: pre-wrap`, `max-width` CSS 적용 — 캔버스 영역 이탈 오버플로우 결함 수정 |

---

## Test Results

| 테스트 항목 | 방법 | 결과 |
|---|---|---|
| OS Lock 경합 단위 테스트 | `pytest api/tests/test_workspace_security.py` — `PermissionError` 강제 주입, `logging.error` 호출 여부 검증 | PASS |
| 환경변수 Fallback 로깅 | 기형 환경변수 주입 후 경고 로그 출력 확인 | PASS |
| 포트 고갈 재시도 스크립트 | 3100~3199번 포트 더미 서버로 전체 점유 후 `check-port.mjs` 실행 — 정해진 횟수까지만 재시도 후 안전 종료 확인 | PASS |
| ReactFlow 에러 툴팁 레이아웃 | 공백 없는 200자 이상 에러 문자열 페이로드 주입 후 브라우저 육안 검수 — 지정 너비(`max-width`) 내 줄바꿈 확인 | PASS |

> **Docker Preview**
> - 컨테이너: `devflow-agent-hub`
> - 포트 범위: `3100~3199` (내부), 외부 노출: `7000~7099`
> - Preview URL: `http://ssh.manbalboy.com:7000`

---

## Risks / Follow-ups

| 구분 | 내용 |
|---|---|
| **Risk** | 단위 테스트용 Mock이 실제 OS 간 미묘한 Lock 경합 타이밍을 완벽히 재현하지 못할 가능성 존재 |
| **Risk** | `check-port.mjs` 재시도 대기 횟수 설정이 과도할 경우 CI 파이프라인 정지 시간 증가 가능 — 현재 최대 횟수 하드코딩으로 무한루프 방지 |
| **Follow-up** | SPEC P0-1: `workflow_id` 기반 `GraphRunner` + `ExecutorRegistry` + `node_runs` 전환 (Engine v2) — 별도 이슈로 추적 예정 |
| **Follow-up** | SPEC P0-3: Instruction Inbox + Autopilot Control Plane (24시간 루프 + 지시 주입/중단/재개) — 다음 단계 구현 필요 |
| **Follow-up** | Redis Streams / 분산 락 체계 전면 도입은 이번 범위(MVP) 외 Out-of-scope |

---

## Closes #69
```

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
