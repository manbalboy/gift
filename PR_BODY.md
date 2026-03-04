## Summary

`web/src/components/Toast.tsx` 컴포넌트에서 발견된 보안 취약점·기능 버그·사용성 문제를 수정하고, 테스트 커버리지를 강화합니다.

Agent Hub 특성상 연속된 작업 상태 로그가 빈번히 발생하므로, 알림이 화면을 가리지 않도록 **큐 방식 다중 알림 관리**를 도입하고, 외부 입력값이 렌더링되는 경로에 **XSS 방어 이스케이프 처리**를 적용하였습니다.

---

## What Changed

### 보안 (P0)
- **XSS 방어**: 워크플로우 응답·에러 로그 등 외부 입력값이 Toast에 렌더링될 때 HTML 이스케이프 유틸리티를 적용하여 악의적인 스크립트 실행을 차단

### 기능 버그 수정 (P0)
- **폰트 지연 로딩 대응**: `document.fonts.ready` 완료 시점에 `measureMessageOverflow`를 재평가하는 로직 추가, 미지원 브라우저용 `setTimeout` 폴백도 함께 구현
- **모바일 멀티 터치 오작동 방어**: `onTouchStart` / `onTouchMove` 핸들러에 `event.touches.length > 1` 조건을 추가하여 두 손가락 이상 터치 시 스와이프 이벤트 무시

### 고도화 (P1)
- **Toast 큐 방식 도입**: 최대 3개 초과 알림을 큐에 대기시키고, 동일 메시지 중복을 필터링하여 UI 가림 현상 방지
  - Toast Provider의 전역 렌더링 파이프라인에 한정 적용

### 테스트 (P2)
- `web/src/components/Toast.test.tsx`: 큐잉 로직·중복 필터링·XSS 이스케이프 처리에 대한 Jest 단위 테스트 추가
- `web/tests/e2e/toast-layering.spec.ts`: 88px 임계값 모바일 단일 손가락 스와이프 시 정상 닫힘 검증, `role="alert"` / `aria-live="polite"` ARIA 속성 E2E 검증 추가

---

## Test Results

| 구분 | 방법 | 결과 |
|---|---|---|
| 단위 테스트 (Jest) | `Toast.test.tsx` — 큐잉, 중복 필터링, XSS 이스케이프 | ✅ 전체 통과 |
| E2E 테스트 (Playwright) | `PORT=3100 npx playwright test toast-layering.spec.ts` — Chromium / WebKit | ✅ 전체 통과 |
| 수동 검수 | Chrome DevTools 네트워크 쓰로틀링으로 폰트 지연 시 Expand 버튼 노출 확인 | ✅ 정상 |
| 모바일 멀티 터치 | iOS/Android 시뮬레이터 핀치/2핑거 스와이프 X축 오작동 미발생 확인 | ✅ 정상 |

> Docker 실행 기준 Preview: `http://ssh.manbalboy.com:7000`

---

## Risks / Follow-ups

### 잠재 위험
- **Flaky 테스트**: Chromium과 WebKit의 터치 이벤트 시뮬레이션 미세 차이로 88px 임계값 판정 테스트가 CI 환경에서 간헐적으로 실패할 수 있음
- **구형 브라우저 폴백 미검증**: `document.fonts.ready` 미지원 환경에서 `setTimeout` 폴백의 타이밍이 환경마다 다를 수 있어 추가 검증 필요

### Follow-ups
- [ ] Toast 이외의 알림 채널(대시보드 배지, Run 타임라인 등) 에도 동일한 큐 정책 일관 적용 검토
- [ ] `color.status.*` 디자인 토큰 기반 Toast 시맨틱 컬러(error/success/info) 완전 연동
- [ ] CI 파이프라인에 `PORT=3100 playwright test` 스텝 정식 편입

---

Closes #65

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
