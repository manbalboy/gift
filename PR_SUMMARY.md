```markdown
## Summary

Self-Improvement Loop 엔진의 **초안 설계 및 안전 제어 레이어**를 구현합니다.

이슈 #71의 요구 사항인 "Idea → Plan → Code → Test → Evaluate → Improve → Repeat" 반복 구조를 시뮬레이터 수준에서 구체화하고, 루프 폭주 방지를 위한 최소 안전 장치(max_loop_count / budget_limit)를 백엔드에 적용했습니다. 동시에 관리자가 장시간 실행 중인 루프 엔진의 방대한 로그를 안전하게 모니터링할 수 있도록 프론트엔드 렌더링 품질을 개선하고, XSS 방어 타입 안전성을 강화했습니다.

---

## What Changed

### 백엔드 (`api`)

- **`api/app/services/loop_simulator.py`** — 루프 제어 로직 구현
  - `max_loop_count` 및 `budget_limit` 설정 상태 필드 추가.
  - 메인 틱 루프 `_run_forever` 실행 시 두 임계값 중 하나라도 초과하면 즉시 `stopped` 상태로 안전 전이.
  - 초기값이 0 이하이거나 예산이 이미 소진된 상태에서 구동될 경우 조기 종료(Early exit) 처리.

- **`api/tests/test_loop_simulator.py`** — 루프 제어 단위 테스트 추가
  - `max_loop_count` 및 `budget_limit` 초과 시 상태가 `running → stopped`로 정확히 전이되는지 검증하는 엣지 케이스 단위 테스트(pytest) 작성.

### 프론트엔드 (`web`)

- **`web/src/components/ErrorLogModal.tsx`** — 대용량 텍스트 렌더링 개선
  - 기존 `Array.from` 기반 코드 포인트 분할 방식에서 `Intl.Segmenter` 기반 Grapheme Cluster 단위 안전 분할로 교체.
  - `Intl.Segmenter` 미지원 구형 브라우저를 위한 줄바꿈 단위 Fallback 로직 추가.

- **`web/src/components/ErrorLogModal.test.tsx`** — 스트레스 테스트 추가
  - 10만 자 이상의 한글 + ZWJ 복합 이모지(👨‍👩‍👧‍👦 등) 혼합 더미 텍스트로 렌더링 무결성 및 UI 프리징 부재 검증.

- **`web/src/utils/security.ts`** — XSS 방어 타입 안전성 강화
  - `sanitizeAlertText` 함수 반환값에 TypeScript Branded Type 적용.
  - `dangerouslySetInnerHTML` 등에 오남용되는 것을 타입 시스템 차원에서 차단.

---

## Test Results

| 구분 | 테스트 | 결과 |
|------|--------|------|
| 백엔드 | `test_loop_simulator.py` — 예산 초과 시 루프 중단 | ✅ 통과 |
| 백엔드 | `test_loop_simulator.py` — 최대 사이클 도달 시 루프 중단 | ✅ 통과 |
| 프론트엔드 | `ErrorLogModal.test.tsx` — 10만 자 대용량 텍스트 분할 렌더링 무결성 | ✅ 통과 |
| 프론트엔드 | `ErrorLogModal.test.tsx` — ZWJ 복합 이모지 경계 손실 없음 | ✅ 통과 |
| 보안 | `security.ts` — Branded Type 타입 오남용 컴파일 차단 | ✅ 통과 |

### Docker Preview 정보

| 항목 | 값 |
|------|-----|
| 컨테이너 | `agenthub-preview-cdb309bd` |
| 이미지 | `agenthub/new-mind-cdb309bd:latest` |
| 컨테이너 포트 | `7000` |
| 외부 URL | http://ssh.manbalboy.com:7004 |
| 헬스 체크 | http://127.0.0.1:7004/ |
| CORS 허용 오리진 | `https://manbalboy.com`, `http://manbalboy.com`, `https://localhost`, `http://localhost`, `https://127.0.0.1`, `http://127.0.0.1` |
| 상태 | ⚠️ `failed` — `[Errno 104] Connection reset by peer` |

> **참고**: Docker Preview 컨테이너가 현재 연결 오류(`Connection reset by peer`)를 반환하고 있습니다. 외부 포트 바인딩 또는 컨테이너 기동 상태를 별도로 확인해 주시기 바랍니다.

---

## Risks / Follow-ups

### 위험 요소

1. **`Intl.Segmenter` 브라우저 호환성**
   - 현재 Fallback 로직을 적용했으나, 매우 구형(Chrome 87 미만, Firefox 94 미만) 환경에서는 Fallback 분기가 동작하는지 실 환경 검증이 권장됩니다.

2. **루프 조기 종료(Early exit) 엣지 케이스**
   - `max_loop_count = 0` 또는 `budget_limit = 0` 상태로 엔진이 최초 구동되는 경우, 즉시 `stopped`로 전이됩니다. 운영 환경에서 설정값이 0으로 내려오지 않도록 인프라 단 검증 로직 추가를 검토하세요.

3. **Docker Preview 연결 오류**
   - Preview 컨테이너가 `Connection reset by peer`를 반환 중입니다. 네트워크 어댑터 지연 또는 포트 바인딩 실패일 수 있으므로, 외부 포트 7004 상태 점검이 필요합니다.

4. **하위 작업 취소 정책 미정**
   - 루프가 `stopped`로 전이될 때 대기 중인 하위 Task의 처리 방식(대기열 유지 vs 즉시 취소)이 현재 미정입니다. 리소스 누수 방지를 위해 후속 이슈에서 처리 정책을 명확히 정의해야 합니다.

### Follow-ups (후속 작업 제안)

- [ ] 수동 루프 개입(Manual Override) API 추가 — `stopped` 상태에서 임계값을 동적 재조정 후 엔진을 재가동할 수 있는 엔드포인트 구현.
- [ ] 서버 CORS 설정 감사 — 와일드카드(`*`) 허용 여부 점검 및 `manbalboy.com` / `localhost` 계열 오리진으로의 엄격한 제한 적용.
- [ ] `budget_limit` 외부 입력 검증 — 음수 또는 비정상값 주입에 대한 FastAPI Pydantic Validator 추가.
- [ ] Docker Preview 연결 오류 근본 원인 조사 및 포트 바인딩 재시도 로직 검토.
- [ ] 실제 LLM 연동 기반 Analyzer / Evaluator / Improvement Planner 구현 (현재는 시뮬레이터 수준).

---

Closes #71
```
