```markdown
# PLAN

## 1. Task breakdown with priority

**P0 (Highest) - Core Stability & UI Fixes**
- [ ] `web/src/components/Toast.tsx` 버그 수정: `durationMs` 음수 입력 방어 로직 강화 및 긴 텍스트 UI 깨짐 방지를 위한 CSS(`word-break: break-all`) 적용.
- [ ] 노드 알림 폭주 제어: 실패 노드가 연쇄적으로 발생할 때 화면을 가리지 않도록 Toast 알림 Queueing(큐잉) 스케줄러 구현 및 동시 표시 개수 제한.
- [ ] Visual Workflow Builder 프론트엔드-백엔드 연동: ReactFlow 캔버스의 데이터 구조와 서버 측 `validate_workflow` API 페이로드 구조 불일치 문제 해결 및 저장 로직 통합.
- [ ] Human Gate API 보안 및 정합성 보강: 승인(Approve) 처리 시 권한 검증 및 기반 아티팩트/컨텍스트 정합성 체크 로직 추가.

**P1 (High) - Test Coverage & Reliability**
- [ ] 프론트엔드 E2E 테스트 강화: `web/tests/e2e/workflow-builder.spec.ts`에 캔버스 드래그, 순환 연결 시 에러 방어, 드라이런 시뮬레이션 등에 대한 E2E 시나리오 추가 (로컬 테스트 포트 기준: `3100`).
- [ ] SSE 스트림 누수 방지 검증: 로컬 부하 테스트를 통한 다중 연결/해제 시 `active_stream_connections` 누수 여부 확인 및 동기화 락커 검증.
- [ ] Webhook 보안 강화: 수신부 헤더의 HMAC 암호화 서명 검증 로직 점검 및 단위 테스트 보강 (IP Spoofing 및 Trusted Proxy 검증 포함).

**P2 (Medium) - UX Enhancements & Edge Cases (고도화 플랜)**
- [ ] 대용량 아티팩트 처리 최적화: 수십 MB 크기의 로그/아티팩트를 프론트엔드에서 렌더링할 때 발생하는 메모리 초과 현상 방지를 위해 청크 로딩(Chunk loading) 또는 제한된 크기의 뷰어 도입. (이유: 테스트 리포트나 E2E 스크린샷 텍스트 등이 화면에 일시적으로 로딩될 때 브라우저 크래시를 유발할 수 있으므로, 안정적인 Workspace 열람 경험을 제공하기 위한 인접 기능 추가)

## 2. MVP scope / out-of-scope

**MVP Scope**
- Workflow Builder 캔버스의 정상적인 노드/엣지 편집, 서버 검증 및 저장 (오류 없이 동작).
- 안정적인 Toast 알림 시스템 (타이머 버그 해결, 다중 메시지 큐잉 처리, 긴 텍스트 UI 처리).
- Human Gate 시스템의 안전한 승인/재개 프로세스 (접근 권한 확인 및 워커 실행 컨텍스트 유지).
- Webhook 수신 시 외부의 악의적인 요청을 차단할 수 있는 필수 서명 검증.

**Out-of-Scope**
- 완전한 형태의 Agent Marketplace 및 과금/빌링 시스템 연동.
- Kubernetes(EKS) 환경의 완벽한 오토스케일링 인프라 구축.
- 실시간 동시 편집(Multi-player) Workflow Builder 기능.

## 3. Completion criteria
- ReactFlow 기반의 Visual Workflow Builder에서 노드/엣지를 추가하고 성공적으로 서버 DB에 저장할 수 있다.
- 에러를 유발하는 워크플로우를 여러 개 동시 실행하여 실패 메시지가 쏟아질 때 브라우저 멈춤이나 UI 가림 없이 순차적으로 Toast 알림이 노출되고 소멸된다.
- Human Gate 대기 상태인 작업(`approval_pending`)을 장시간 방치 후 승인하더라도 정상적으로 다음 노드로 재개(Resume)된다.
- 승인되지 않은 IP 또는 유효하지 않은 HMAC 서명을 가진 Webhook 요청은 401/403 응답으로 차단되며 에러 로그를 남긴다.
- E2E 및 단위 테스트 커버리지가 Workflow Builder 및 Toast 기능에 대해 보강되어 CI 파이프라인을 통과한다.

## 4. Risks and test strategy

**Risks**
- ReactFlow와 커스텀 검증 API 간의 상태 동기화 문제로 인한 무한 렌더링 또는 브라우저 크래시.
- SSE 연결 누수로 인한 서버 쓰레드 고갈 및 로컬 테스트 환경의 포트 충돌.
- 거대한 크기의 Markdown 아티팩트 렌더링에 의한 프론트엔드 메모리 부족.

**Test Strategy**
- **Unit Test**: Toast 컴포넌트(`App.test.tsx`, `Toast.test.tsx`)에 비정상적인 입력(음수 타이머, 대용량 문자열) 주입 테스트 추가. Webhook의 서명 검증 로직에 대한 Mock 단위 테스트 보강.
- **E2E Test**: Playwright를 이용해 Workflow Builder 드래그 앤 드롭 저장/실패 검증 시나리오 구현 (`workflow-builder.spec.ts`). 로컬 테스트를 위한 실행 가이드 포트는 3000번대를 사용.
- **Load Test**: 다수 연결의 SSE 스트림 접속/강제 종료 반복 로컬 스크립트를 작성하여 `active_stream_connections`가 정상 반환되는지 백엔드 단위에서 검증.

## 5. Design intent and style direction

- **기획 의도**: 복잡한 AI 에이전트의 작동 흐름(Workflow)을 시각적으로 명확하게 파악하고, 발생하는 시스템의 에러나 승인 요청을 놓침 없이 안정적으로 관리할 수 있는 개발 중심 자동화 경험 제공.
- **디자인 풍**: 개발자 친화적이며 군더더기 없는 미니멀 모던 대시보드 및 노드 에디터 스타일.
- **시각 원칙**:
  - 컬러: 에러(Error)는 명확한 Red 계열, 경고(Warning)는 Yellow 계열을 사용하되 눈의 피로도를 줄이기 위한 채도 조절 적용.
  - 여백 및 타이포: 노드와 화면 요소를 구분하기 위한 넉넉한 패딩 적용. 긴 에러 메시지도 레이아웃을 해치지 않게 `word-break` 통제.
- **반응형 원칙**: 데스크톱(PC) 모니터 위주로 노드 에디터와 대시보드 뷰를 최적화하되, 모바일 환경에서는 Toast 알림 동작과 간이 승인(Human Gate) 응답이 깨지지 않는 모바일 우선 동작 레이아웃 고려(스와이프/터치 경험 방어).

## 6. Technology ruleset

- **플랫폼 분류**: web, api
- **web**: React 프레임워크 기반 설계 (현존 Vite/React/TypeScript 환경 연장선)
- **api**: FastAPI 기반 API 설계
```
