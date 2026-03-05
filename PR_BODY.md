## Summary

이슈 #71 **[초장기] 루프엔진 설계해서 초안을 준비하시오**에 대한 구현 초안입니다.

`Idea → Plan → Code → Test → Evaluate → Improve → Repeat` 사이클을 자율 반복하는 **Self-Improvement Loop 엔진**의 핵심 구조를 설계·구현하고, 개발자가 루프 상태를 실시간으로 모니터링하고 제어할 수 있는 프론트엔드 대시보드를 보완하였습니다. 아울러 리뷰에서 지적된 보안 결함·UI 버그·테스트 누락을 우선 처리하여 MVP 품질을 확보하였습니다.

---

## What Changed

### 1. 루프 모니터 위젯 추가 (`LoopMonitorWidget`)
- 루프 실행 횟수, Quality Score, 엔진 상태(`running` / `paused` / `stopped`)를 실시간으로 표시하는 대시보드 카드 컴포넌트 신규 추가
- 최대 루프 횟수 초과 시 '0' 표기 버그 수정 → 초과 횟수를 명시하고 `color.status.failed(#EF4444)` 붉은색 경고 텍스트로 강조
- 상태별 색상 토큰(`qualityTone`) 적용: 정상-`success`, 주의-`waiting`, 위험-`failed`

### 2. XSS 보안 취약점 수정 (`web/src/utils/security.ts`)
- `sanitizeAlertText` 함수의 DOMPurify 설정 오류 수정
- 악성 스크립트 태그(`<script>`, `<img onerror=...>` 등)는 완전 제거, 제네릭 문법(`<T>`) 등 정상 텍스트는 안전하게 보존되도록 필터링 로직 재설계

### 3. SSE 이벤트 렌더링 최적화
- 루프 엔진의 빈번한 상태 갱신 이벤트에 디바운싱(Debounce) / 쓰로틀링(Throttle) 적용
- 브라우저 리렌더링 스파이크 방지 및 UI 반응성 안정화

### 4. 루프 제어 UX 개선
- `Start` / `Pause` / `Stop` 버튼 클릭 시 백엔드 응답 전까지 로딩 스피너 표시 및 버튼 비활성화 처리 → 중복 요청 방지
- 에러 발생(큐 오버플로우, 루프 중단 등) 시 토스트 알림과 함께 상세 에러 로그 모달 추가

### 5. 테스트 코드 보강
- `web/src/components/LoopMonitorWidget.test.tsx` 신규 작성: 컴포넌트 마운트, 색상 톤 분기, 루프 수치 렌더링 검증
- `web/src/App.test.tsx` 에러 상태 통합 테스트 추가: `dropped`(queue_overflow) 수신 시 경고 토스트 렌더링 확인
- 보안 단위 테스트 강화: XSS 패턴 및 정상 텍스트 조합에 대한 필터링 정확도 검증

---

## Test Results

| 구분 | 항목 | 결과 |
|---|---|---|
| 단위 테스트 | `LoopMonitorWidget` 렌더링 / 색상 톤 분기 | 통과 |
| 단위 테스트 | `sanitizeAlertText` XSS 필터링 및 정상 텍스트 보존 | 통과 |
| 통합 테스트 | 에러 상태(`dropped`) 수신 시 토스트 알림 노출 | 통과 |
| 성능 테스트 | 다중 SSE 이벤트 주입 시 디바운싱 전후 리렌더링 횟수 비교 | 개선 확인 |
| Docker Preview | 컨테이너 빌드 및 포트(`7004`) 서빙 | **실패** (Connection reset by peer) |

> **Docker Preview** 빌드 자체는 완료되었으나 컨테이너 기동 시 네트워크 연결 오류가 발생하였습니다. 로컬 환경(`npm run dev -- --port 3100`)에서는 정상 동작을 확인하였습니다.

### Docker Preview 정보

| 항목 | 값 |
|---|---|
| 컨테이너 | `agenthub-preview-cdb309bd` |
| 이미지 | `agenthub/new-mind-cdb309bd:latest` |
| 컨테이너 포트 | `7000` |
| 외부 URL | http://ssh.manbalboy.com:7004 |
| 상태 | `failed` — Connection reset by peer |

---

## Risks / Follow-ups

### 위험 요소

- **쓰로틀링 적용 시 상태 불일치(Race Condition)**: 디바운싱/쓰로틀링으로 인해 수동 개입(Pause/Stop) 시점과 화면에 표시된 엔진 상태 간 미세한 시간차가 발생할 수 있습니다. 크리티컬 제어 이벤트는 쓰로틀링 우선순위를 높여 별도 처리해야 합니다.
- **XSS 수정에 따른 신규 렌더링 버그 가능성**: DOMPurify 설정 변경 후 예상치 못한 마크업 패턴에서 정상 텍스트가 유실될 수 있습니다. 추가 엣지 케이스 입력에 대한 회귀 테스트가 필요합니다.
- **Docker Preview 기동 실패**: 컨테이너 네트워크 오류의 원인(포트 충돌, CORS, 방화벽 정책 등) 규명이 필요하며, 프리뷰 환경 안정화가 후속 작업으로 남아 있습니다.

### 후속 과제 (Out-of-Scope → 다음 이터레이션)

- [ ] SSE 연결 끊김(장기 실행 중 네트워크 오류) 발생 시 자동 재연결 및 상태 재동기화 로직 구현
- [ ] 루프 엔진 Analyzer / Evaluator / Planner / Executor 각 컴포넌트의 백엔드 핵심 로직 고도화
- [ ] Docker Preview 네트워크 오류 원인 분석 및 안정적 컨테이너 기동 환경 확보
- [ ] Live Run Constellation(DESIGN_SYSTEM WOW Point) — 실시간 노드 상태 인터랙티브 미니맵 구현

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
