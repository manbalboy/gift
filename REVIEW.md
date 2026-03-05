> [!IMPORTANT]
> 우선순위: `ex-code` 내부 코드를 분석해 현재 프로젝트에 모든 기능을 구현한다.

# REVIEW

## Functional bugs
- **API 서버 테스트 실패 (Workflow Engine 검증 충돌)**: `api/tests/test_workflow_engine.py`에 위치한 `test_engine_runs_independent_nodes_without_forced_sequential_fallback` 테스트가 `KeyError: 'id'` 에러를 내며 실패합니다. PLAN.md의 목표에 따라 단절된 노드(Disconnected Graph)를 엣지 케이스로 취급하여 서버 측에서 400/422 에러로 거부하도록 유효성 검증 로직이 보완되었으나, 해당 테스트 코드는 여전히 독립된(단절된) 노드 배열을 POST 요청하고 `workflow['id']`를 통해 생성 성공을 기대하고 있어 발생하는 충돌 결함입니다.
- **Web (Human Gate 폼 프리셋 텍스트 병합 UI 결함)**: `web/src/App.tsx` 파일 내 `handleRejectReasonPreset` 함수에 논리적 오류가 있습니다. `body = current.trimEnd();`를 선언하여 텍스트 후행의 모든 공백 및 개행을 제거한 직후, `/\n$/.test(body)`로 개행 문자로 끝나는지 확인하고 있습니다. 이 조건은 항상 `false`가 되어 `separator` 변수에 무조건 `\n\n` (두 줄 바꿈)이 할당됩니다. 따라서 사용자가 프리셋 버튼을 연속 클릭할 때 의도치 않게 항상 불필요한 두 줄 개행이 추가되어 자연스러운 Append 동작을 방해합니다.

## Security concerns
- **Preview 환경 및 일회성 토큰 우회 접근 통제**: 일회성 뷰어 토큰 발급을 통한 무단 접근 차단 로직이 구현 및 테스트(test_preview_port_requires_one_time_viewer_token)되어 있으나, Nginx를 거치지 않고 로컬 우회 포트(예: 3100번대)로 직접 접근할 경우에도 백엔드 및 미들웨어 단에서 인증 제어가 동일하게 강제되는지 보안 레이어 검토가 필요합니다.
- **대용량 아티팩트를 악용한 공격 (DoS)**: 50MB 이상의 극단적 대용량 아티팩트를 렌더링하는 E2E 부하 테스트가 도입되어 프론트엔드 메모리 안정성을 입증하였으나, 악의적인 대용량 파일 생성 시 백엔드 스토리지 파티션 용량 고갈 또는 네트워크 대역폭 점유를 방어하기 위한 파일 저장 크기 상한선(Rate & Size Limiting) 제어가 철저히 구현되어 있는지 확인이 요구됩니다.

## Missing tests / weak test coverage
- **Frontend 비정상 엣지 케이스 검증 (다중 Entry 및 단절 노드)**: 프론트엔드 Playwright E2E 테스트(WorkflowBuilder.spec.ts) 내에 순환 참조 연결 방지 기능에 대한 검증은 존재하나, PLAN.md에 명시된 '단절된 노드(Disconnected Graph)' 및 '다중 Entry 노드'를 ReactFlow 캔버스에서 구성 후 저장을 시도했을 때, 서버 오류 응답을 처리하여 화면에 명확한 에러 모달/토스트를 표시하는지에 대한 UI 레벨의 시나리오 테스트가 누락되어 있습니다.
- **거절 사유 프리셋 병합 단위 테스트**: `App.tsx`의 텍스트 병합 버그 수정 후 재발을 막기 위해, 프리셋 버튼을 클릭했을 때 기존 텍스트(공백 유무, 개행 여부)의 다양한 상태에 따라 텍스트가 정확히 의도대로 병합되는지 확인하는 Jest 단위 테스트가 보강되어야 합니다.

## Edge cases
- **단일 노드 워크플로우 vs 단절된 그래프 엣지 케이스**: 워크플로우에 노드가 단 1개만 존재하는 경우(엣지가 0개)는 유효한 구조로 처리되지만, 노드가 2개 이상이면서 서로 엣지가 연결되지 않은 경우에는 단절된 그래프로 인식되어야 합니다. 이 두 상태의 검증 경계(Boundary)에서 엣지 케이스 오류가 없는지, 특히 시각화 빌더에서 1개 노드 추가 후 드라이런 시 문제가 발생하지 않는지 교차 검증이 필요합니다.
- **대용량 아티팩트 스트리밍 중 네트워크 단절 및 재연결**: 가상화 스크롤러가 50MB 이상의 아티팩트를 청크 단위로 렌더링하고 있을 때 SSE(Server-Sent Events) 스트리밍이 끊기거나 Nginx 모킹 지연 후 백오프로 재연결되는 상황에서, UI의 스크롤 좌표가 튀거나 메모리 누수가 발생하며 브라우저가 블로킹되는 현상이 발생할 가능성이 있습니다.

## TODO
- [ ] `api/tests/test_workflow_engine.py`에서 단절 그래프 정책 변경으로 인해 실패하는 `test_engine_runs_independent_nodes_without_forced_sequential_fallback` 테스트 코드를 삭제하거나 유효성 실패를 확인하는 테스트로 전면 수정할 것.
- [ ] `web/src/App.tsx`의 `handleRejectReasonPreset` 함수를 수정하여, `current.trimEnd()`로 인한 개행 문자 판단(`/\n$/`) 논리 오류를 바로잡고 연속 클릭 시 정상적으로 한 줄 띄어쓰기 또는 단일 개행이 이루어지도록 UI 버그를 픽스할 것.
- [ ] 프론트엔드 E2E(`WorkflowBuilder.spec.ts`)에 '다중 Entry' 및 '단절된 노드' 구성 후 저장 시 UI에 적절한 에러가 노출됨을 검증하는 테스트 케이스를 추가할 것.
- [ ] `App.tsx`의 수정된 폼 텍스트 프리셋 병합 로직에 대한 Jest 단위 테스트(`App.test.tsx` 등)를 보강할 것.
- [ ] Preview 및 아티팩트 저장소에 대해 로컬 3100번대 포트 우회 접근 시에도 일회성 토큰 인증 레이어가 우회되지 않는지 인프라/미들웨어 확인 작업을 진행할 것.
