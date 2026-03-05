```markdown
# REVIEW

## Functional bugs
- **CORS 포트 정책 오류**: `api/app/main.py`의 `_CORS_ALLOWED_PORT_PATTERN`이 `(?:31\d{2})`로 설정되어 있어 3100~3199 포트만 허용됩니다. SPEC의 Deployment 요구사항인 "Preview 외부 노출 포트는 7000-7099 범위를 사용합니다." (예: `http://ssh.manbalboy.com:7000`)에 위배되어, 실제 배포/Preview 환경에서 프론트엔드 API 호출 시 CORS 차단 버그가 발생합니다.
- **Loop Engine 좀비 상태 버그**: `api/app/services/loop_simulator.py`의 백그라운드 스레드 루프(`_run_forever`) 내부에 `try-except Exception` 글로벌 예외 처리 블록이 없습니다. 루프 안에서 예기치 않은 오류가 발생하면 스레드가 종료되지만, `finally` 블록의 구조적 한계로 인해 `self._mode`가 `"running"` 상태로 남게 됩니다. 이후 `/start` API를 호출해도 상태 오판으로 인해 엔진이 재시작되지 않는 좀비(Zombie) 상태에 빠집니다.

## Security concerns
- **XSS 필터 우회 잠재 취약점**: `web/src/utils/security.ts`의 `SAFE_GENERIC_PATTERN`은 ReDoS 방지 처리가 잘 되어 있으나, `<img onerror>` 같은 속성 기반 태그가 입력될 경우 `UNSAFE_GENERIC_KEYWORDS` 필터망을 통과하고 `DOMPurify` 실행 이후에 그대로 복원(`restoreSafeGenericTokens`)되는 구조입니다. 현재 React 환경에서 텍스트로 바인딩되어 즉각적인 XSS 실행 위험은 낮지만, 향후 `dangerouslySetInnerHTML` 등의 방식으로 렌더링 될 경우 스크립트가 실행될 수 있는 잠재적 취약점입니다.

## Missing tests / weak test coverage
- **백그라운드 스레드 제어 커버리지 취약**: `api/tests/test_loop_engine_api.py` 등 API 단위 테스트는 작성되었지만, `LoopSimulator`의 스레드가 크래시 났을 때 시스템이 멈추는지, 혹은 예산(budget) 초과 및 최대 루프 수(`max_loop_count`)에 도달했을 때 안전 모드(Safe mode)로 올바르게 전환되는지에 대한 상세 백그라운드 모듈 단위 테스트가 누락되어 있습니다.
- **제네릭 복원 로직 교차 검증 부족**: `security.test.ts`에 ReDoS나 단순 XSS 방어에 대한 테스트는 통과했으나, 특이 속성(예: 이벤트 핸들러가 값 없이 포함된 태그)이 주입된 엣지 케이스에 대해 DOMPurify 복원 안전성을 증명하는 테스트가 부족합니다.

## Edge cases
- **에러 로그 전문 렌더링 프리징 (UI/UX 엣지 케이스)**: `web/src/components/ErrorLogModal.tsx`에서 5000자 Truncation 기능은 구현되었으나, '전체 보기(expanded)' 버튼을 눌렀을 때의 뷰포트 대비책이 없습니다. 만약 수만~수십만 자의 에러 로그가 들어올 경우, 클릭 즉시 DOM에 거대 텍스트가 렌더링되면서 브라우저 메인 스레드가 멈추는(Freezing) 현상이 발생할 수 있습니다.
- **문자열 절삭 시 멀티바이트 깨짐**: 5000자 자르기 로직(`payload.slice(0, MAX_VISIBLE_LOG_CHARS)`) 수행 시, 경계선에 한글, 이모지 등 멀티바이트 문자가 위치하면 문자가 깨진 채로 렌더링될 우려가 있습니다.

---

## TODO
- [ ] `api/app/main.py`의 CORS 포트 정규식을 Preview 환경에 맞게 `(?:31\d{2}|70\d{2})` 형식으로 수정하여 7000~7099 대역을 허용하도록 변경.
- [ ] `api/app/services/loop_simulator.py`의 `_run_forever` 메인 틱 루프 안에 전역 `try-except Exception` 구문을 추가하고, 비정상 크래시 발생 시 `self._mode`를 `"stopped"` 또는 `"idle"`로 초기화하는 복구 로직 반영.
- [ ] `ErrorLogModal.tsx`에서 '전체 보기' 전환 시 발생할 수 있는 UI 프리징을 방지하기 위해 가상화 렌더링(Virtualization) 또는 청크 단위 페이지네이션 적용.
- [ ] `security.ts`의 `sanitizeAlertText` 함수 반환값 사용 처에 대한 XSS 안전성 주석 추가 및 `restoreSafeGenericTokens` 복원 시 허용할 속성/태그 화이트리스트 교차 검증 로직 강화.
- [ ] 백그라운드 루프 시뮬레이터 비정상 종료 시 재시작 및 예산 초과로 인한 정지 상황을 검증하는 모듈 단위 테스트(pytest) 추가.
```
