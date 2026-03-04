# REVIEW

## Functional bugs
- `web/vite.config.ts` 설정 파일에 `strictPort: true` 옵션이 누락되었습니다. PLAN에서 "프론트엔드 로컬 실행 시 3100번 포트만 엄격히 준수되도록" 요구했으나, 현재 설정으로는 로컬 환경에서 3100 포트가 이미 사용 중일 경우 Vite가 임의로 3101번대 포트로 넘어가 서버를 실행하게 됩니다.
- 프론트엔드의 `App.tsx`에서 Toast 알림 아이디를 발급할 때 사용하는 `Date.now() + Math.floor(Math.random() * 1000)` 로직은 동시에 여러 알림이 큐에 추가될 경우 아주 낮은 확률이지만 고유 식별자(ID) 충돌을 발생시킬 수 있습니다.

## Security concerns
- 전반적인 보안 아키텍처는 양호합니다. FastAPI 백엔드(`api/app/api/webhooks.py`)에서 5MB 이상의 대용량 페이로드를 차단하고 있으며, Webhook Secret을 통한 서명 검증이 포함되어 있어 인증되지 않은 잘못된 페이로드 접근을 제어할 수 있습니다.
- 다만 클라이언트 쪽 시뮬레이션용 액션이나 에러 유도 요청이 외부에서 악의적으로 자동화되어 API의 Rate Limiter 리소스를 점유할 가능성이 있으므로, 현재 구현된 `LocalSlidingWindowRateLimiter` 외에 추가적인 IP 차단 등의 관찰이 필요합니다.

## Missing tests / weak test coverage
- `npm run test`를 통한 단위 테스트(`Toast.test.tsx`, `Dashboard.test.tsx`, `WorkflowBuilder.test.tsx` 등)는 문제없이 통과하고 있습니다.
- 하지만 PLAN에서 언급된 **E2E/수동 테스트**(브라우저 포트 3100 접근 시 중첩 동작 검증, ReactFlow 캔버스의 확대/축소 패널 및 레이어 Z-index 시각 충돌)에 대한 자동화된 E2E 코드(예: Playwright 혹은 Cypress)는 확인되지 않습니다. 시각적 레이아웃이 깨지지 않는지 검증하는 프론트엔드 통합 테스트 보강이 필요합니다.

## Edge cases
- 여러 번의 웹훅 오류나 상태 예외가 짧은 간격으로 연속 발생할 때 상태 배열에서 `slice(-3)`으로 최대 노출 개수를 제한한 점은 훌륭합니다. 하지만 새 Toast가 추가되고 기존 Toast가 사라질 때 타이머와 리렌더링이 겹치면서 UI가 깜빡거리거나 애니메이션이 부자연스러울 수 있는 엣지 케이스가 존재합니다.
- `WorkflowBuilder.tsx`에서 노드가 누락 속성으로 인해 기본 `task`로 Fallback 될 때 `useEffect`를 통해 Toast가 트리거됩니다. 초기 마운트 시에는 정상 동작하지만, 데이터가 다시 로딩되거나 React Strict Mode가 켜진 3100번 로컬 개발 환경에서는 동일한 경고가 두 번 이상 중복 발생하여 사용성을 해칠 우려가 있습니다.

---

## TODO
- [ ] `web/vite.config.ts` 파일의 `server` 객체에 `strictPort: true` 설정을 추가하여 3100 포트 고정을 강제하기.
- [ ] `web/src/App.tsx` 내 Toast `id` 생성 로직을 단순 시간/랜덤 기반에서 글로벌 카운터(Increment ID)나 고유 식별자 라이브러리 기반으로 변경하여 Key 충돌 방지하기.
- [ ] Fallback 노드 발생 시 띄워주는 Toast 알림이 여러 번 렌더링되더라도 중복 노출되지 않도록, 한 번 띄운 에러에 대한 상태 제어(Flag) 추가하기.
- [ ] UI 레이어 및 Z-index 충돌(예: ReactFlow 미니맵 등 위젯과 Toast 팝업 겹침 현상)을 시스템적으로 보장하기 위해 프론트엔드 E2E 테스트 스크립트 작성 검토하기.
