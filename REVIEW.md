# REVIEW

## Functional bugs
- 현재 구현된 `LoopMonitorWidget` 컴포넌트에서는 루프 횟수가 최대치를 초과했을 때 `loopOverrunCount`를 계산하여 붉은색 경고 스타일(class `loop-monitor-value-overrun`)과 함께 초과 횟수(`+N`)를 정확하게 화면에 렌더링하고 있어 기존 시각적 버그가 해결되었습니다.
- 백엔드(3100 포트)에서 유입되는 잦은 SSE 이벤트 갱신에 대응하기 위해 프론트엔드 `App.tsx`에 `RUN_SYNC_THROTTLE_MS` (180ms) 주기로 쓰로틀링(Throttling)이 적용되어 브라우저 렌더링 병목을 성공적으로 방어하고 있습니다.
- 엔진 제어 버튼(시작/일시정지/재개/중지) 조작 시 `loopEngineActionLoading` 상태를 활용하여 버튼이 즉각적으로 비활성화(Disabled)되며, 인라인 로딩 스피너(`loop-engine-spinner`)가 표시되어 중복 실행 조작 방지 요구사항을 충족합니다.
- **[개선 제안]** 시스템 큐 오버플로우나 엔진 예외를 보여주는 에러 로그 모달(`Error Log Modal`)에서 수만 자 이상의 긴 로그 텍스트가 유입될 경우, `pre` 영역의 스크롤 처리 및 렌더링 지연을 완화할 수 있는 방어 로직 추가 검토가 필요합니다.

## Security concerns
- `web/src/utils/security.ts`에서 정규식(`SAFE_GENERIC_PATTERN`)을 통해 `<T>`, `<User>` 등 정상적인 제네릭 텍스트를 식별해 임시 토큰으로 보존하고, `UNSAFE_GENERIC_KEYWORDS`를 활용하여 `SCRIPT`, `IFRAME` 등의 악성 태그 키워드는 필터링하는 로직이 적용되었습니다. 
- 이후 `DOMPurify`를 2차로 통과시키며 XSS 방어 수준을 높게 유지하고 있어, 화면 유실 및 보안 위협을 동시에 해결했습니다.
- 토큰(token)이나 비밀번호(password), Bearer 인증 정보 등 민감한 키-값 데이터가 화면에 출력되지 않도록 `MASKED_TOKEN`으로 안전하게 치환하는 마스킹 로직이 올바르게 동작합니다.
- **[주의 사항]** 악의적 사용자가 DOMPurify의 예외 규칙을 우회하기 위해 다중 인코딩된 문자열이나 복잡한 구조의 중첩 태그(예: `<svg><script>`)를 주입하는 특수한 엣지 케이스 공격이 있을 수 있으므로, 주기적인 라이브러리 및 정규식 패턴 업데이트가 요구됩니다.

## Missing tests / weak test coverage
- `LoopMonitorWidget.test.tsx` 내에 루프 제한 횟수를 초과(`overrun`)했을 때 값이 어떻게 표기되고 스타일(클래스명)이 어떻게 적용되는지에 대한 컴포넌트 렌더링 단위 테스트가 포함되어 있으며 성공적으로 통과합니다.
- `App.test.tsx` 통합 테스트에 `dropped` 및 `queue_overflow` 상태 수신 시 경고 토스트와 상세 에러 모달이 순차적으로 노출되는 동작 검증이 반영되어 있습니다.
- `security.test.ts`를 통해 기본적인 XSS 공격 페이로드 방어와 정상적인 제네릭 문장(`<T>`) 보존에 대한 엣지 케이스 단위 테스트가 확보되었습니다.
- **[보완 필요]** 고도화 기능으로 추가된 `ErrorLogModal` 컴포넌트 내부의 **클립보드 복사 기능**(`navigator.clipboard.writeText`)에 대한 테스트 코드(Mocking 테스트)가 누락되어 있습니다. 복사 성공 및 실패에 따른 사용자 피드백 텍스트의 렌더링 단언(Assertion) 테스트 보강이 권장됩니다.

## Edge cases
- 장기 실행(Long-Running)이라는 Self-Improvement Loop 엔진의 특성을 반영하여, 네트워크 단절 상황 시 화면 상단에 재연결 상태 및 다음 재시도 지연 시간(`reconnectMeta`)을 안내하는 네트워크 뱃지 UI가 추가되었습니다. 재연결을 5회 초과 시 완전한 통신 실패 상태로 전환되어 수동 재시도를 유도하는 안전한 예외 흐름이 돋보입니다.
- 과도한 쓰로틀링으로 인해 사용자가 느끼는 답답함을 방지하기 위해 180ms라는 적절한 갱신 주기를 설정하였고, 상태 갱신 지연 도중 사용자가 'Pause' 등의 액션을 취할 때 발생할 수 있는 Race condition은 개별 액션 버튼의 `disabled` 제어를 통해 회피했습니다.
- 브라우저 클립보드 API가 지원되지 않는 환경이거나 권한 거부 상황(`navigator.clipboard` 미존재 혹은 Promise 에러 발생)에 대한 예외 처리가 `try-catch`로 방어되어 있으며, 조용히 "복사에 실패했습니다." 메시지로 상태를 변경해 애플리케이션의 크래시를 방지합니다.

---

## TODO (for Coder)
- [ ] `web/src/components/ErrorLogModal.test.tsx` 테스트 파일에 `navigator.clipboard.writeText` Mocking을 추가하여 클립보드 복사 버튼 클릭에 대한 성공/실패 동작 단위 테스트 작성.
- [ ] 에러 로그 모달 내부 `<pre className="mono error-log-detail">` 요소에 방대한 데이터가 렌더링될 때 레이아웃이 깨지지 않도록 CSS 상에서 오버플로우 스크롤(`overflow-y: auto`, `word-break: break-all`)이 충분히 안전하게 적용되어 있는지 점검.
- [ ] `web/src/utils/security.test.ts`에 다중 인코딩이나 비정형 XSS 페이로드(예: `<scr<script>ipt>`)를 주입하여 필터링 우회 여부를 확인하는 심화 엣지 케이스 1~2개 추가.
