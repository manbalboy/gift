# REVIEW

## Functional bugs
- **Toast 큐 및 식별자(dedupeKey) 누수 오류**: `web/src/App.tsx` 내 `enqueueToast` 로직에서 Toast 배열을 `.slice(-3)`으로 자르고 있습니다. 이로 인해 화면에 4개 이상의 Toast가 연속으로 발생하여 기존 Toast가 배열에서 밀려나 렌더링에서 제외될 경우, `closeToast`가 정상적으로 호출되지 않습니다. 결과적으로 큐에서 강제로 탈락한 Toast의 `dedupeKey`가 `dedupedToastKeysRef`에 영구적으로 남아, 이후 동일한 식별자를 가진 Toast가 영원히 노출되지 않는 버그가 발생합니다.

## Security concerns
- **CORS 정규표현식 점검**: `api/app/main.py`의 `allow_origin_regex`에 작성된 정규표현식(`rf"^https?://{_CORS_ALLOWED_HOST_PATTERN}{_CORS_PORT_PATTERN}$"`)은 SPEC 요구사항(`manbalboy.com`, `localhost`, `127.0.0.1`, 포트 대역 등)을 충족하여 의도대로 구현되었습니다. 단, `http://`와 `https://` 모두를 허용하고 있으므로, 추후 프로덕션 단계에서는 HTTPS를 강제하는 방향으로 HSTS 등의 추가 보안 조치가 필요할 수 있습니다. 

## Missing tests / weak test coverage
- **Toast 전역 큐 상태 관리 단위 테스트 부재**: `web/src/components/Toast.test.tsx`에서 컴포넌트 내부 생명주기 관련 테스트는 충실히 작성되었으나, `App.tsx` 레벨에서의 큐 상태 관리(최대 3개 유지 등) 및 중복 방지 키(`dedupeKey`) 라이프사이클을 검증하는 통합 단위 테스트가 누락되어 있습니다.
- **Z-Index E2E 테스트의 한계**: `web/tests/e2e/toast-layering.spec.ts`에서 시스템 알림 래퍼(`.toast-stack`)의 Z-index 레이어를 검증하고 있지만, 실제 에러 상황을 트리거하여 실제 Toast 항목 요소(`.toast-content`)가 노출되었을 때의 렌더링을 완전히 포착하지 않습니다. 실제 Toast 발생 시나리오 기반의 E2E로 보강이 필요합니다.

## Edge cases
- **모바일 환경 레이아웃 및 상호작용 충돌**: 뷰포트가 좁은 모바일(세로 방향) 환경일 때 `mobile-blocker`가 캔버스를 가리고 편집을 제한합니다. 이때 경고 Toast의 "해당 노드로 이동" 액션 버튼을 클릭하게 되면 내부적으로 캔버스의 `setCenter`가 호출되나, 사용자의 시야는 여전히 블로커 화면에 막혀 있어 시각적 피드백의 인지 부조화가 발생할 수 있습니다. 모바일 상태일 경우 해당 액션 버튼의 노출을 숨기거나 작동 방식을 다르게 처리하는 방안이 필요합니다.
- **다수 노드 Fallback 시의 메시지 오버플로우**: 워크플로우 로드 시 Fallback되는 노드가 지나치게 많을 경우, Toast 내 메시지가 너무 길어져 뷰포트를 벗어나거나 UI가 깨질 위험이 존재합니다. 텍스트 말줄임(text-overflow) 처리 또는 메시지 가이드의 간소화가 권장됩니다.

---

## TODO (Checklist for Coder)

- [ ] `web/src/App.tsx` 내 Toast 큐 밀어내기(`.slice(-3)`) 시 제거되는 항목의 `dedupeKey`를 `dedupedToastKeysRef`에서 안전하게 삭제하는 로직(useEffect 또는 커스텀 훅 활용) 추가 구현.
- [ ] `web/src/App.test.tsx` 등을 생성하여 최대 3개의 Toast 유지 동작과 중복 식별자(dedupeKey) 관리 및 해제에 대한 통합 단위 테스트 작성.
- [ ] 모바일 모드(세로)에서는 Toast 알림의 '노드 이동 액션'을 비활성화 하거나 클릭 시 `mobile-blocker` 우회 안내 텍스트를 제공하는 조건부 렌더링 로직 추가.
- [ ] 워크플로우에 심각한 Fallback이 일어날 경우를 대비해 Toast 알림 내부 텍스트에 `overflow: hidden; text-overflow: ellipsis;` 등 긴 문자열 처리용 CSS 클래스 보완.
- [ ] `web/tests/e2e/toast-layering.spec.ts` 내 테스트 스텝에 실제로 버튼 클릭이나 훅을 트리거하여 Toast 알림 아이템이 등장한 직후의 Z-index 겹침을 확정 검증하는 절차 추가.
