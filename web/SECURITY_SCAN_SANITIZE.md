# sanitizeAlertText 정적 보안 점검

- 점검 도구: `web/scripts/check-sanitize-security.mjs`
- 실행 명령: `npm run security:scan`
- 점검 범위:
  - `src/utils/sanitize.ts`
  - `src/components/SystemAlertWidget.tsx`

## 점검 기준

- `javascript:` URI 차단 정규식 존재
- `DOMPurify` 속성 훅(`uponSanitizeAttribute`) 존재
- 고위험 태그/속성 차단(`script`, `iframe`, `onerror`, `onload`, `onclick`) 설정
- 알림 메시지/경로 렌더링 전 `sanitizeAlertText`, `sanitizeAlertPath` 적용

## 결과

- 현재 기준 통과 시 출력: `[security:scan] sanitize 정적 점검 통과`
- 실패 시 누락 규칙을 항목별로 출력하고 종료 코드 `1` 반환
