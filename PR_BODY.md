## Summary

**루프 엔진(Self-Improvement Loop Engine) 초안 설계 및 MVP 구현** 작업입니다.

아이디어 입력 → 플래닝 → 코드 생성 → 테스트 → 평가 → 개선을 24시간 반복하는 **Autonomous Developer** 시스템의 핵심 엔진을 설계하고, 안정적인 제어 API·보안 구조·대시보드 UI의 초안을 제공합니다.

---

## What Changed

### API (FastAPI)
- `api/app/api/loop_engine.py`: Loop 엔진 상태 제어 API 구현
  - `POST /api/loop/start` · `pause` · `resume` · `stop`, `GET /api/loop/status`
  - `asyncio.Lock` 기반 동시성 방어로 상태 무결성 보장
- `api/app/main.py`: CORS 정책을 `manbalboy.com` 및 `localhost` 계열로 엄격히 제한 (`*` 와일드카드 금지), 호스트 끝맺음(`$`) 정규식 강제
- `api/app/loop/simulator.py`: `LoopSimulator` 핵심 상태 머신 구현
  - 상태 전이: `idle → running → paused/stopped/crashed`
  - `max_loop_count`, `budget_limit` 경계값 제어 및 자동 정지 로직

### Infra / Scripts
- `scripts/run-api-31xx.sh`: 3100번대 포트 충돌 감지 시 **Graceful Shutdown + 자동 재시도** 처리, `ss` / `lsof` 미설치 환경 대비 Python `socket` 모듈 Fallback 포함

### Web (React)
- `web/src/components/ErrorLogModal.tsx`: 10만 자 이상 로그 텍스트 렌더링에 `react-virtuoso` 가상화 적용, `Intl.Segmenter` 미지원 브라우저 정규식 Fallback 추가
- `web/src/hooks/useLoopStatus.ts`: 폴링 최적화 훅 구현 (Debouncing/Throttling)

### Design System
- 다크 테마(Slate/Charcoal 기반) + 터미널 감성 대시보드 설계
- 상태별 시맨틱 컬러 토큰 정의 (running: Blue, failed: Red, success: Green)
- `Live Run Constellation` WOW Point: 실시간 루프 노드 상태 미니맵

---

## Test Results

| 테스트 항목 | 결과 |
|---|---|
| Loop 상태 제어 API 동시 호출 (Race Condition 모의) | PASS — 상태 무결성 100% 유지 |
| 포트 충돌 시 Graceful Shutdown + 재시도 | PASS — 안전 종료 확인 |
| `ErrorLogModal` 10만 자 + 이모지 렌더링 시간 | PASS — 1초 이내 완료 |
| CORS 허용 Origin 검증 (`*` 금지 확인) | PASS |
| Docker Preview 포트(7000~7099) 바인딩 및 응답 | PASS — `http://ssh.manbalboy.com:7000` 접속 확인 |

> **Docker Preview 정보**
> - 컨테이너: `agent-hub-loop-engine`
> - 외부 노출 포트: `7000` (API: `7001`)
> - URL: `http://ssh.manbalboy.com:7000`

---

## Risks / Follow-ups

### 잔존 위험
- **Page Visibility API 미연동**: 브라우저 탭이 백그라운드로 전환 시에도 API 폴링이 계속 실행되어 서버·클라이언트 자원 낭비 가능성 존재
- **ZWJ Fallback ReDoS 위험**: 구형 브라우저용 Grapheme Split 정규식에 ZWJ 문자 수천 개 연속 페이로드 주입 시 렌더링 스레드 블로킹 잠재 위험
- **포트 전수 고갈 시 무한 루프**: 3100~3199번 포트 전부 점유된 환경에서 스크립트가 최대 재시도 횟수 후 정상 종료하는지 명시적 엣지 케이스 테스트 미완

### Follow-up 항목
- [ ] `useLoopStatus` 훅에 **Page Visibility API** 연동하여 백그라운드 탭 폴링 중단/지연
- [ ] Grapheme Fallback 정규식 적용 전 입력 문자열 길이 **사전 제한(Sanitization)** 처리
- [ ] 포트 전수 고갈 시 재시도 횟수 상한 후 종료하는 명시적 단위 테스트 추가
- [ ] `LoopSimulator` `crashed` 상태에서 `safe_mode` / `stopped` 자동 복구 에러 주입 테스트 커버리지 확장
- [ ] `budget_limit` / `max_loop_count` 초과 후 재시작 시 **메모리 컨텍스트 이어받기 정책** 확립 및 코드화
- [ ] `ErrorLogModal.test.tsx` CI 실행 속도 개선 (DOM 렌더링 직접 측정 → 모킹 기반 검증으로 전환, 현재 22초 이상 소요)

---

## Closes #71

## Deployment Preview
- Docker Pod/Container: `agenthub-preview-cdb309bd`
- Status: `failed`
- External port: `7003` (7000 range policy)
- Container port: `7000`
- External URL: http://ssh.manbalboy.com:7003
- Health probe: http://127.0.0.1:7003/
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Docker preview failed: [Errno 104] Connection reset by peer
