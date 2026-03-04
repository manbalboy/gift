# REVIEW

현재 저장소 상태, `SPEC.md`, `PLAN.md`를 바탕으로 한 리뷰 결과입니다. 계획상 P0(우선순위 높음) 항목들은 대부분 완료 처리되었으나, P1 및 P2에 해당하는 UI 개선, 안정성 확보, 테스트 강화 작업이 아직 남아있습니다.

### Functional bugs
- **Workflow Builder 상태 동기화**: `Visual Workflow Builder` 기능이 미완료 상태로 남아있습니다. ReactFlow 캔버스에서 노드를 추가하거나 엣지를 연결한 후 서버 측 `validate_workflow` API를 호출할 때, 페이로드 구조 불일치로 인한 저장 실패 버그가 발생할 가능성이 높습니다.
- **Toast UI 컴포넌트 오류**: `PLAN.md`에서 지적된 바와 같이, 알림 컴포넌트에 음수 `durationMs` 값이 전달될 경우 즉시 언마운트되거나 타이머 렌더링에 버그가 발생할 수 있습니다.
- **SSE 스트림 동기화 누수**: Threading Lock이 적용되었다고 하나, 클라이언트가 비정상적으로 연결을 종료할 경우 `active_stream_connections` 카운터가 어긋나 리소스 누수로 이어질 잠재적 버그가 존재합니다.

### Security concerns
- **IP Spoofing 및 Trusted Proxy 검증**: 클라이언트 IP 추출 로직에 방어 기제가 추가되었지만, 다중 리버스 프록시(예: 로컬 테스트 시 `http://localhost:3100` 포워딩 환경)를 통과하는 `X-Forwarded-For` 헤더에 대한 정밀한 파싱 및 검증이 우회될 가능성이 있습니다.
- **Webhook 페이로드 변조**: `test_webhooks_api.py`가 존재하지만, GitHub 등 외부 연동에서 들어오는 이벤트 웹훅의 서명(Signature) 검증 로직이 불충분할 경우 악의적인 파이프라인 트리거가 발생할 수 있습니다.
- **권한 우회 (Human Gate)**: 승인/수정/거절(approval) API가 구현되었으나, 권한이 없는 사용자가 임의의 `run_id`에 대해 resume API를 호출할 수 있는 접근 제어(Authorization) 누락 우려가 있습니다.

### Missing tests / weak test coverage
- **프론트엔드 E2E 커버리지 부족**: `workflow-builder.spec.ts`가 추가되어 있으나, 복잡한 드래그 앤 드롭 동작, 노드 순환(Cycle) 연결 시도에 대한 브라우저 렌더링 락커 에러, 드라이런(Dry-run) 시뮬레이션 등에 대한 E2E 커버리지가 부족합니다.
- **에지 케이스 단위 테스트 누락**: 객체 직렬화 오류 시의 UI Fallback, 긴 에러 메시지 반환 시의 UI 렌더링에 대한 컴포넌트 단위 테스트(`App.test.tsx`, `Toast.test.tsx`) 커버리지를 강화해야 합니다.
- **데이터 무결성 통합 테스트**: 실행 이력이 있는 `workflow_id`에 대한 수정(PUT) 차단 로직이 구현되었으나, 동시에 여러 수정을 시도하는 경쟁 조건(Race Condition)에 대한 백엔드 부하 테스트가 누락되어 있습니다.

### Edge cases
- **초대형 아티팩트 처리 지연**: 아티팩트(리포트, 스크린샷 등) 레지스트리 구축 시, 수십 MB에 달하는 로그나 결과물이 반환될 때 객체 스토어에서 프론트엔드로 전달되는 과정의 메모리 초과 현상이 일어날 수 있습니다.
- **다중 Toast 알림 폭주**: 실패 노드가 연쇄적으로 발생하여 화면에 수십 개의 에러 알림이 동시에 뜰 경우, UI를 완전히 가리거나 브라우저 성능이 크게 저하될 수 있습니다. (최대 개수 제한 및 큐잉 로직 필요)
- **비정상 워크플로우 재개 (Resume)**: Human Gate에서 대기 중인(`pending`) 작업이 오랜 시간 방치되어 기반 데이터가 변경된 후 뒤늦게 승인(approve)될 경우, 컨텍스트 불일치로 인한 워커 실행 실패 엣지 케이스가 존재합니다.

---

# TODO

- [ ] `web/src/components/Toast.tsx`에 `durationMs` 음수 방어 로직 및 긴 텍스트 줄바꿈(`word-break: break-all`) CSS 적용
- [ ] 노드 알림 폭주 방지를 위한 Toast 알림 큐잉(Queueing) 스케줄러 구현
- [ ] `web/tests/e2e/workflow-builder.spec.ts`에 ReactFlow 캔버스 드래그 및 서버 검증 실패(에러 응답) 시나리오 E2E 테스트 추가 (로컬 테스트 환경 포트 예: `3100` 기준 작성)
- [ ] Visual Workflow Builder의 프론트엔드-백엔드 데이터 구조 연동 및 캔버스 저장 통합 구현 완료
- [ ] 로컬 부하 테스트 스크립트를 작성하여 SSE 스트림 다중 연결/해제 시 `active_stream_connections` 누수 여부 검증
- [ ] Human Gate API의 승인 처리 시 기반 아티팩트/컨텍스트 정합성 체크 로직 추가
- [ ] Webhook 수신부 헤더의 HMAC 암호화 서명 검증 로직 점검 및 단위 테스트 보강
