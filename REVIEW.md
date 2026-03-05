```markdown
# REVIEW

## Functional bugs
- **가상화 리스트 높이 계산 오류 가능성:** `SystemAlertWidget.tsx` 내에서 아이템의 높이를 `ESTIMATED_ALERT_ROW_HEIGHT`(116px)로 고정하여 스크롤 위치(`startIndex`, `visibleCount` 등)를 계산하고 있습니다. 긴 로그 메시지가 Word-wrap 되어 개별 아이템 높이가 116px를 초과하는 가변 높이 환경(특히 모바일 환경)에서는, 실제 스크롤된 거리와 인덱스 계산이 어긋나 화면에 아이템이 보이지 않거나 빈 공간(`spacer`)의 높이가 과도하게 잡히는 렌더링 버그가 발생할 수 있습니다.

## Security concerns
- **XSS 및 링크 파서 우회 우려:** `alertHighlighter.ts`의 `toSafeExternalUrl` 함수를 통해 `http:`와 `https:` 외의 프로토콜(`javascript:`, `data:` 등)을 효과적으로 방어하고 있으며, React의 특성 상 기본적인 텍스트 이스케이프 처리가 적용되어 비교적 안전합니다. 
- 하지만 기존 `security.ts`의 `MASKED_TOKEN` 치환 로직 이후에 하이라이터가 동작하는 구조상, 특수 제어 문자와 이스케이프 문자가 기형적으로 결합된 복합 페이로드를 삽입했을 때 정규식을 우회하여 잘못된 외부 링크를 생성할 여지가 있는지에 대한 심층적인(Defense-in-depth) 검토가 필요합니다.

## Missing tests / weak test coverage
- **복합 악성 데이터 검증 누락:** `PLAN.md`의 테스트 전략(Test Strategy)에 명시된 "XSS 페이로드 및 시크릿 키 복합 데이터 주입"에 대한 단위 테스트가 현재 `security.test.ts` 및 `alertHighlighter.test.ts`에 포함되어 있지 않습니다.
- **가변 높이 윈도잉 렌더링 테스트 부족:** Playwright 기반 E2E 테스트(`system-alert.spec.ts`)에서 긴 문자열이 가로로 이탈하지 않는지(레이아웃 붕괴)는 확인하고 있으나, 대량(수만 건)의 로그 중 "높이가 각기 다른" 알림 아이템들이 섞여 있을 때 가상화 스크롤이 끊기거나(Scroll Jumping) 스크롤 위치가 튀는 현상에 대한 E2E 시나리오가 부재합니다.

## Edge cases
- **`visualViewport` 미지원 환경 예외 처리:** 브라우저의 렌더링 오차를 잡기 위해 `window.visualViewport?.scale`을 참조해 동적으로 여유값(`bottomThreshold`)을 조절하는 로직은 훌륭합니다. 하지만 `visualViewport` API를 완벽하게 지원하지 않는 일부 특수 환경(WebView 내장 브라우저 등)에서는 기본값 `16px`로 고정되므로, 디바이스 자체의 텍스트 배율을 극단적으로 키웠을 때(300% 이상) 스크롤 하단 자동 고정 감지(PAUSED 전환)가 너무 민감하게 반응할 수 있습니다.
- **복잡한 구두점과 괄호가 포함된 URL 파싱:** 로그 메시지 내에 괄호로 둘러싸인 외부 링크(예: `(참고: https://example.com/guide/12)` ) 혹은 URL 쿼리 파라미터 끝에 마침표나 쉼표가 여러 개 붙은 경우, `stripTrailingPunctuation` 정규식이 실제 링크의 일부(예: `?version=1.2`)를 구두점으로 잘못 판단하여 링크를 자를 수 있는 엣지 케이스가 존재합니다.

---

## TODO checklist
- [ ] `web/src/utils/security.test.ts` 내에 XSS 공격 페이로드와 시스템 시크릿 키가 혼합된 텍스트에 대한 방어 검증 테스트를 추가할 것.
- [ ] `web/src/utils/alertHighlighter.test.ts` 내에 URL 뒷부분에 다중 구두점 및 괄호가 섞인 엣지 케이스(`http://test.com/api?v=1.0.` 등) 파싱 테스트를 추가할 것.
- [ ] `SystemAlertWidget.tsx`의 가상화 로직(Virtualization)이 가변 높이(Dynamic Item Height)를 안전하게 지원할 수 있도록 `ResizeObserver`를 활용한 캐시된 아이템 높이 매핑 방식을 도입하거나, 검증된 가상화 렌더링 라이브러리 연동을 재검토할 것.
- [ ] 개발 서버 실행 시 3100 포트 환경(`PORT=3100 npm run dev` 등)에서 대량의 더미 로그를 주입한 뒤, 동적 높이 아이템들이 연속으로 스크롤될 때 브라우저 프레임 드랍이 없는지 실제 테스트를 거칠 것.
```
