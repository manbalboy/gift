```markdown
# PLAN

## 1. Task breakdown with priority

### [P0] 버그 픽스 및 안정성 강화 (REVIEW.md 반영)
- **Toast 알림 중복 렌더링 수정**: `web/src/App.tsx` (또는 전역 상태 큐) 및 `web/src/components/WorkflowBuilder.tsx`에 식별자(`signature`) 기반의 Flag 상태 관리 로직을 추가하여 React Strict Mode 등에서 발생하는 다중 렌더링 경합 버그 차단.
- **포트 충돌 방지 스크립트 구현**: `web/package.json`의 `dev` 스크립트 실행 전, `3100`번 포트의 점유 여부를 확인하고 선점 시 "이미 3100 포트를 점유 중인 프로세스가 있습니다."라는 명확한 에러 메시지를 반환 후 종료하는 가벼운 Node.js CLI 검사 스크립트 작성 및 연동.
- **CORS 및 허용 Origin 정책 적용**: `api/app/main.py`의 CORS 미들웨어 구성을 점검 및 업데이트하여 SPEC.md에 명시된 `manbalboy.com`, `localhost`, `127.0.0.1` (로컬 3000번대 및 프리뷰 7000번대 포트 포함) 호스트만 엄격하게 통신을 허용하도록 강제.

### [P1] UX 고도화 및 인접 기능 (REVIEW.md 반영)
- **Toast 컴포넌트 액션 확장**: `web/src/components/Toast.tsx` 인터페이스를 확장하여 사용자 선택적 액션 버튼(예: '해당 노드로 이동')을 추가하고, 클릭 시 ReactFlow의 `fitView` 또는 `setCenter`를 통해 문제 노드로 캔버스를 부드럽게 이동시키는 상호작용(UX) 강화 로직 구현.
- **모바일/데스크톱 뷰포트 전환 시 레이아웃 경합 해결**: `WorkflowBuilder`에서 창 크기 조절 시 ReactFlow 캔버스와 편집 블로커(`mobile-blocker`) 간 레이아웃 경합이 발생하지 않도록 Resize Observer를 활용하여 캔버스 상태 리셋 및 `fitView` 동기화를 보장하는 로직 추가.

### [P2] 테스트 커버리지 확대 (REVIEW.md 반영)
- **Toast 단위 테스트 고도화**: `web/src/components/Toast.test.tsx`에 다수 에러 푸시 시 식별자 충돌 방지, 그리고 타이머(`durationMs`) 자동 만료와 사용자 닫기 버튼 클릭이 동시에 발생할 때의 경합 조건(Race Condition)을 안전하게 방어하는 테스트 케이스 추가.
- **E2E 렌더링 충돌 테스트 도입**: Playwright (또는 동급 E2E 프레임워크)를 설정하여, ReactFlow `MiniMap` 및 `Controls` 요소(`LAYER_Z_INDEX.canvasOverlay`)와 전역 `Toast` 컴포넌트 간의 Z-index 시각적 겹침 현상을 확인하는 자동화 시나리오 구성.

## 2. MVP scope / out-of-scope

**MVP scope**
- 프론트엔드 환경에서 `3100`번 포트 충돌을 사전에 방지하는 검증 스크립트 도입.
- Toast 알림 시스템의 고유 식별자 상태 관리를 통한 중복 렌더링 해결 및 오류 노드 바로가기(화면 이동) 기능 구현.
- 캔버스 뷰포트 조절 시 발생하는 UI 깨짐 완화 및 안정적인 모바일 블로커 렌더링.
- 백엔드(FastAPI)와 프론트엔드(React) 환경에 명확한 CORS 및 도메인 화이트리스트 정책 적용.
- 식별자 기반의 Toast 생명주기와 요소 간 Z-index 계층 충돌을 검증하는 프론트엔드 단위/E2E 테스트 구축.

**Out-of-scope**
- 백엔드 Workflow Engine 코어 로직의 구조적 변경 (Temporal, LangGraph 등 대규모 아키텍처 도입은 별도의 고도화 페이즈에서 논의).
- React Flow 기반의 다중 연결 브랜치 조건 분기 및 신규 복합 노드 타입 대거 추가.
- CI/CD 파이프라인 상의 인프라 레벨 자동 배포 셋업.

## 3. Completion criteria
- `npm run dev` 실행 시 `3100` 포트가 이미 점유된 경우 올바른 에러 메시지와 함께 프로세스가 즉시 종료되어야 함.
- 에러 상황에서 워크플로우 화면에 Toast 알림이 단 1회만 정확히 노출되며, 닫기 버튼 및 자동 타이머가 에러 없이 독립적으로 동작해야 함.
- Toast 알림의 특정 노드 이동 액션 버튼 클릭 시 캔버스가 대상 노드를 중심으로 부드럽게 초점을 맞춰야 함.
- `web/src/components/Toast.test.tsx`의 생명주기 관련 단위 테스트가 모두 통과해야 함.
- 신규 구축된 E2E 시나리오를 통해 캔버스 오버레이와 알림 요소 간 Z-index 겹침이 없음을 확인해야 함.
- API 호출 시 인가되지 않은 외부 출처(Origin)의 요청은 철저히 CORS 예외로 차단되어야 함.

## 4. Risks and test strategy

**Risks**
- E2E 프레임워크 신규 도입으로 인한 프론트엔드 패키지 의존성 충돌 및 로컬 테스트 환경 구성 리소스 증가.
- 뷰포트 이벤트 및 React Flow 상태 동기화 과정에서 불필요한 컴포넌트 리렌더링 발생으로 인한 퍼포먼스 저하 가능성.
- 엄격한 CORS 적용으로 인해 로컬 개발 환경 통신 장애 및 외부 연동 포트(7000번대 등) 바인딩 오류 발생 위험.

**Test strategy**
- **Unit Test**: Jest를 활용해 Toast 상태 식별자 발급 및 타이머 기반 소멸 주기를 외부 환경과 격리하여 집중 검증 (`Toast.test.tsx`).
- **E2E Test**: 브라우저 기반 시각 테스트 도구(Playwright)를 구성해 뷰포트 강제 변환 및 레이어 간 Z-index 렌더링 충돌 테스트 진행.
- **Manual QA**: 터미널에서 3100 및 3000 포트를 임의 점유한 상태에서 스크립트 실행, manbalboy.com 외의 출처를 Origin으로 조작하여 API 요청 시나리오 등 코너 케이스 직접 점검.

## 5. Design intent and style direction
- **기획 의도**: 워크플로우를 편집하는 복잡한 과정에서 사용자가 오류나 알림을 마주했을 때, 작업 흐름의 방해 없이 직관적으로 상황을 인지하고 즉각적인 문제 해결(해당 노드로 뷰 이동 등)이 가능하도록 돕는 유연하고 신뢰도 높은 경험을 제공합니다.
- **디자인 풍**: 군더더기 없는 모던 대시보드형 디자인. 정보의 위계가 명확히 분리되며, 부가적인 장식 요소를 배제하여 기능과 내용이 돋보이는 실용적인 스타일을 지향합니다.
- **시각 원칙**: 
  - **컬러**: 에러 및 경고를 즉각 인지할 수 있는 명도 높은 Alert 컬러(적색, 황색 등)를 활용하며, 캔버스 배경은 피로도가 적은 차분한 무채색을 유지합니다.
  - **마진/패딩/타이포**: 가독성을 극대화하기 위해 여유로운 Line-height를 부여하고, Toast 알림과 주변 컴포넌트 사이의 Margin 및 Padding을 넉넉히 주어 답답함을 해소합니다.
  - **Z-index 레이어**: 알림(Toast) 요소는 캔버스 미니맵이나 컨트롤러를 절대 가리지 않고, 독립적이며 최상단 레이어에 명확하게 배치되어야 합니다.
- **반응형 원칙**: 데스크톱 기반의 복합 대시보드 환경에 최적화하되, 화면 너비가 좁아지는 모바일 환경에서는 레이아웃이 어그러지지 않도록 부드러운 편집 제한 화면(mobile-blocker)을 우선 노출하는 등 사용자를 보호합니다.

## 6. Technology ruleset
- **플랫폼 분류**: Web (Frontend App) 및 API (Backend).
- **Web**: React (Vite 환경) 기반 아키텍처. React Flow 프레임워크를 기반으로 캔버스를 구현하며 상태 관리 및 렌더링 최적화를 위해 React Hook(useEffect, useRef) 등을 적극 사용합니다.
- **API**: Python (FastAPI) 기반. 미들웨어를 통제하여 지정된 화이트리스트 도메인에만 서비스를 허가합니다.
- **포트**: 
  - 프론트엔드 구동 환경: `3100` 고정 (충돌 방지 CLI 도구 포함)
  - 백엔드(API) 로컬 실행: `3000` 고정
  - 외부 Preview 컨테이너 노출: `7000~7099` 대역 할당 규칙 준수
```
