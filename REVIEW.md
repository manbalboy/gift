# REVIEW

현재 저장소 상태를 SPEC.md와 PLAN.md 기준으로 리뷰한 결과입니다. 전반적인 아키텍처 확장(Workflow Engine v2)과 휴먼 게이트의 동시성 제어, 마크다운 렌더링 최적화(DOMPurify + marked + VirtualScroll) 및 SSE 안정성(Nginx 180s Timeout) 등이 계획대로 충실히 구현되었습니다. 아래는 세부적인 리뷰 내역과 추가적으로 보완해야 할 사항들입니다.

## Functional bugs

- **휴먼 게이트 타임아웃 엣지 케이스**: `workflow_engine.py`에서 `with_for_update()`를 통해 노드 실행 시 동시성 락을 걸고 있지만, 매우 짧은 간격으로 동일한 워커 노드가 스케줄러에 의해 다중으로 트리거 될 때 Nginx의 proxy 환경 지연(Timeout)으로 인해 클라이언트 상태와 백엔드 트랜잭션의 상태 불일치가 일어날 수 있는 잠재적 이슈가 있습니다.
- **SSE 재연결 로직 실패 시 폴백**: SSE 연결이 180초 타임아웃으로 강제 종료된 이후, 클라이언트에서 즉시 재연결을 시도할 때 Redis의 Rate Limit(예: `SSEReconnectRateLimiter`)에 의해 단기간 내 재연결이 차단(429 Too Many Requests)되는 현상이 발생할 수 있습니다. 프론트엔드의 재연결 지수 백오프(Exponential Backoff) 구현이 올바르게 동작하는지 교차 검증해야 합니다.

## Security concerns

- **마크다운 산출물(Artifact) 보안 한계**: `DOMPurify`와 `marked`를 결합하여 XSS 방어를 성공적으로 적용했으나(`web/src/utils/sanitize.ts`), `FORBID_TAGS`와 `FORBID_ATTR` 설정만으로는 SVG 내부에 숨겨진 악의적 페이로드나 `javascript:` 프로토콜 기반의 하이퍼링크 주입을 완전히 막기 어렵습니다. `DOMPurify`의 추가적인 보안 훅(Hook) 설정이 필요합니다.
- **Approver Token 및 워크스페이스 권한 격리**: 휴먼 게이트의 비동기 승인 로직 테스트는 훌륭하게 구현되었으나, A 워크스페이스의 권한을 가진 사용자가 B 워크스페이스의 휴먼 게이트 승인 API를 악의적으로 호출할 때 403 Forbidden이 일관성 있게 반환되는지 확인하는 교차 검증 로직이 더 강화되어야 합니다.

## Missing tests / weak test coverage

- **분산 환경 대규모 부하 통합 테스트**: 현재 `test_human_gate.py` 내부에서 파이썬 `asyncio.gather`를 활용해 10건의 동시성 모의 테스트가 작성되어 성공적으로 통과하지만, 실제 컨테이너가 분산 배치된 다중 워커 환경에서의 DB Lock 경합 및 데드락 회복 상태를 검증하는 E2E 레벨의 테스트 시나리오가 부족합니다.
- **VirtualScroll UI 메모리 및 성능 테스트**: 수만 라인(예: 50MB 이상의 파일)의 산출물 텍스트가 뷰어 컴포넌트로 전달될 때, 렌더링 지연이 발생하는지 검증하는 극단적 대용량 DOM 처리 단위/성능 테스트 코드가 누락되어 있습니다.

## Edge cases

- **대용량 산출물 렌더링 시 메모리 누수**: UI에서 VirtualScroll이 적용되어 화면에 표시되는 DOM 노드의 개수는 효율적으로 통제되지만, 브라우저 힙(Heap) 메모리에 전체 원본 텍스트 데이터가 그대로 상주합니다. 따라서 사용자가 크기가 큰 다수의 Artifact를 연속해서 열람할 경우 클라이언트 측 메모리 누수(OOM)가 발생할 가능성이 높습니다.
- **Nginx 포트 설정 및 로컬 구동 충돌**: 로컬 실행 환경에서는 포트 충돌 방지를 위해 API와 Nginx를 3100번대(예: 프록시 3108, 백엔드 3101)로 구성하여 활용 중입니다. 그러나 환경 변수나 Docker 컴포즈 실행 시 설정이 일부 누락되거나 오버라이드될 경우 Nginx의 upstream 타겟(host.docker.internal:3101)에 접근하지 못하고 502 Bad Gateway 에러를 무한히 뱉어내는 엣지 케이스가 존재할 수 있습니다.

## TODO

- [x] 프론트엔드 Artifact 뷰어에서 대용량 텍스트 데이터를 한 번에 메모리에 로드하지 않고 청크 단위로 가져오는(Chunked Loading) 로직을 구현하여 브라우저 메모리 최적화하기.
- [x] SSE Reconnect 시 429 에러 방지를 위해 프론트엔드 연결 재시도 로직에 Exponential Backoff(지수 백오프) 적용 검토하기.
- [x] `web/src/utils/sanitize.ts`의 `DOMPurify` 옵션에 `javascript:` 링크 차단 및 안전하지 않은 SVG 속성 필터링을 위한 Hook 추가하기.
- [x] 다중 워크스페이스 환경을 모의하여 인가(Authorization)되지 않은 사용자의 휴먼 게이트 조작 시도를 방어하는 API 보안 통합 테스트 추가하기.
- [x] 로컬 구동 환경에서 3108 포트 등 3100번대 네트워크 지연 또는 타임아웃 발생 시, 프론트엔드에서 Graceful하게 상태를 복구하거나 안내하는 UI 화면 렌더링 보완하기.
