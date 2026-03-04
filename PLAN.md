# PLAN

## 1. Task breakdown with priority
- **[P0] 대시보드 웹훅/노드 에러 인지용 Toast 알림 UI 구현**
  - 대시보드 화면 상단에 일시적으로 노출되는 플로팅 Toast 컴포넌트 개발.
  - 속성 패널/캔버스 기반 작업 시 경고(Warning)는 Orange, 에러(Error)는 Red 색상 테마 적용.
  - 영향 파일: `web/src/components/Dashboard.tsx`, `web/src/components/Toast.tsx` (신규 파일)
- **[P1] API 연동 및 클라이언트 에러 핸들링 고도화**
  - 웹훅 파싱 에러(422) 및 `workflow_id` 예외 데이터 유입 시 프론트엔드에서 즉시 캐치하여 Toast 알림을 트리거하는 로직 연동.
  - 불완전 노드가 유입되어 기본 노드로 폴백(fallback) 렌더링될 때 Orange 상태 알림 트리거.
  - 영향 파일: `web/src/services/api.ts`, `api/app/api/webhooks.py`
- **[P2] 로컬 서버 구동 포트 충돌 검증 및 보장**
  - 프론트엔드 로컬 실행 시 `3100`번 포트만 엄격히 준수되도록 `vite.config.ts` 및 `package.json` 스크립트 점검.
  - 개발 과정 중 다른 서비스와 포트 충돌이 없는지 확인.
  - 영향 파일: `web/vite.config.ts`, `web/package.json`

## 2. MVP scope / out-of-scope
- **MVP Scope:**
  - 잘못된 웹훅 데이터 수신 및 노드 데이터 파싱 에러 시 시스템 상태를 사용자에게 즉각적으로 알리는 Toast UI.
  - 에러(Red), 경고(Orange) 2가지 상태 및 자동 닫힘(예: 3초 후) 타이머 기능.
  - 프론트엔드 3100 포트 고정 실행 환경 보장.
- **Out-of-scope:**
  - 영구적인 알림 기록을 보관하는 Notification Center(알림 센터) 기능 제외.
  - 알림 지속 시간 등 사용자별 커스텀 설정 기능 제외.
  - 시스템 외부(이메일, 슬랙)를 통한 에러 발송 처리 제외.

## 3. Completion criteria
- 의도적으로 형식이 어긋난 웹훅 페이로드 전송 시, 대시보드 상단에 Red 색상의 Toast 에러 알림이 노출되고 일정 시간 후 사라져야 함.
- 캔버스에 속성이 누락된 노드가 폴백 렌더링될 때, 즉각적으로 Orange 색상의 경고 Toast 알림이 노출되어야 함.
- 로컬 개발 환경(`npm run dev`) 및 프로덕션 프리뷰에서 프론트엔드가 정확히 `3100` 포트에서 오류나 충돌 없이 구동되어야 함.
- 모든 신규 UI는 기존 ReactFlow 캔버스 및 대시보드와 시각적인 충돌 없이 Z-index 및 레이아웃을 유지해야 함.

## 4. Risks and test strategy
- **Risks:** 
  - 빈번한 웹훅 에러 시 Toast 알림이 연속으로 쌓여 사용자 화면을 가릴 위험 존재.
  - ReactFlow 캔버스의 확대/축소 레이어와 Toast 컴포넌트의 Z-index 충돌 가능성.
- **Test Strategy:**
  - **단위 테스트 (Unit Test):** `Toast.tsx`에 대한 Jest / React Testing Library 렌더링 검증, 타입별(에러/경고) CSS 클래스 매핑 및 자동 닫힘 타이머 로직 점검.
  - **통합 테스트 (Integration Test):** `Dashboard.tsx` 환경 내에서 불완전 노드 데이터 목업(Mock) 주입 시 경고 Toast가 정상 트리거되는지 확인.
  - **E2E/수동 테스트:** 브라우저에서 포트 `3100`으로 접근하여 실제 에러 상황 연출 후 UI 반응성 및 알림 중첩 동작 검증.

## 5. Design intent and style direction
- **기획 의도:** 시스템 내부의 데이터 처리 예외(웹훅 오류, 파싱 실패)를 묵음 처리하지 않고, 사용자에게 신속한 피드백을 주어 시스템 신뢰도 및 상황 인지력을 향상시킵니다.
- **디자인 풍:** 기존 대시보드와 어울리는 모던하고 미니멀한 플로팅 카드(Floating Card) 스타일.
- **시각 원칙:** 
  - 컬러: 시스템 에러는 Red(`#ef4444` 계열), 노드 폴백 등 경고는 Orange(`#f97316` 계열)를 배경 또는 좌측 인디케이터 색상으로 활용.
  - 패딩/마진: 가독성 확보를 위한 넉넉한 여백(패딩 `16px`, 화면 상단 마진 `24px`).
  - 타이포: 간결한 산세리프 폰트로 핵심 에러 메시지만 전달(14~16px 크기).
- **반응형 원칙:** 모바일 우선(Mobile-first) 접근으로 좁은 뷰포트에서는 화면 상단 중앙에 풀 위드(full-width)에 가깝게 표출하며, 데스크톱 뷰포트에서는 화면 가림을 최소화하기 위해 우측 상단 고정 위치에 노출합니다.

## 6. Technology ruleset
- **플랫폼 분류:** web / api
- **web:** React (Vite/TypeScript) 기반 프레임워크로 계획. `Toast` 컴포넌트는 함수형 컴포넌트와 Hooks(`useEffect`, `useState`)를 이용해 바닐라 CSS / 기존 토큰 시스템과 결합하여 구현.
- **api:** FastAPI 기반 기존 웹훅 라우터 로직을 유지하면서, 실패 이벤트가 프론트엔드 상태와 매끄럽게 연동되도록 HTTP 422 응답 처리 구조를 연계하여 계획.
