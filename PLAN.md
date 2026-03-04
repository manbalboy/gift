# PLAN

## 1. Task breakdown with priority

- **P0: 보안 취약점 수정 (XSS 방어)**
  - `web/src/components/Toast.tsx`: 알림 메시지 렌더링 시 워크플로우 응답 데이터 및 에러 로그 등 외부 입력값에 대한 안전한 텍스트 이스케이프 처리 적용.
- **P0: UI 렌더링 및 폰트 지연 로딩 버그 수정**
  - `web/src/components/Toast.tsx`: `document.fonts.ready` API 완료 시점에 텍스트 오버플로우 높이를 재평가하는 `measureMessageOverflow` 로직 적용.
  - API 미지원 브라우저 대비용 폴백(Fallback) 로직 추가 (예: `setTimeout` 등을 활용한 재계산 보장).
- **P1: 모바일 멀티 터치 오작동 수정**
  - `web/src/components/Toast.tsx`: `onTouchStart`, `onTouchMove` 이벤트 핸들러에 `event.touches.length > 1` 조건을 추가하여 두 손가락 이상 터치 시 무시하는 방어 로직 보완.
- **P1: [고도화 추가 기능] Toast 다중 알림 큐잉(Queueing) 및 중복 방지 로직**
  - 짧은 시간 내에 동일한 상태/에러 메시지가 다수 발생할 경우, 중복을 필터링하고 일정 개수(예: 3개)를 초과하는 알림은 큐(Queue)에 대기시키는 로직 도입.
  - **근거:** Agent Hub 특성상 연속된 작업 상태 로그가 빈번히 발생하여 UI가 가려지는 현상을 방지하고 사용성을 개선하기 위함.
  - **구현 경계:** 전역 상태 관리 로직 내 알림 렌더링 파이프라인(Toast Provider 등)에 한정하여 적용.
- **P2: 테스트 커버리지 강화 및 자동화 (Port 3100)**
  - `web/tests/e2e/toast-layering.spec.ts`: 모바일 단일 손가락 스와이프로 임계값(88px) 이상 이동 시 정상적으로 닫히는지 검증하는 E2E 시나리오 작성. (테스트 포트 3100 지정)
  - `web/tests/e2e/toast-layering.spec.ts`: `role="alert"` 또는 `role="status"`, `aria-live="polite"` 등 필수 ARIA 속성이 올바르게 DOM에 렌더링되는지 확인하는 접근성 검증 보강.

## 2. MVP scope / out-of-scope

- **MVP scope:**
  - `REVIEW.md`에서 식별된 Toast 컴포넌트의 멀티 터치 오작동 방어 및 폰트 로딩 지연에 따른 텍스트 오버플로우 판별 버그 수정.
  - 악의적인 스크립트 실행 방지를 위한 XSS 이스케이프 처리 반영.
  - 다중 알림 시 화면 가림을 방지하기 위한 큐잉 및 중복 필터링 로직 구현.
  - Playwright 기반 E2E 테스트(스와이프 동작, 접근성) 추가 및 네트워크 쓰로틀링 수동 검증 보장.
- **Out-of-scope:**
  - Toast 이외의 대시보드 및 시각화 빌더 등 플랫폼 전반의 대규모 UI 리팩토링.
  - 백엔드 워크플로우 엔진 고도화 등 API 레이어의 구조적 변경 작업 (프론트엔드 UI 수정에 집중).

## 3. Completion criteria

- `REVIEW.md`에 명시된 모든 TODO 항목과 XSS 보안 이슈 해결 로직 반영 완료.
- 추가 고도화 항목인 다중 알림 큐잉 및 중복 메시지 방지 기능 정상 동작.
- `web/src/components/Toast.tsx` 관련 코드 수정 시 TypeScript 컴파일 에러 미발생.
- 3100번 포트로 구동된 E2E 테스트(`toast-layering.spec.ts`) 실행 시 스와이프 제스처 및 ARIA 접근성 관련 테스트 케이스 100% 통과.
- iOS/Android 기반 브라우저(또는 시뮬레이터)에서 두 손가락 핀치/스와이프 시 UI 렌더링 충돌이나 X축 오작동 미발생 증명.

## 4. Risks and test strategy

- **Risks:**
  - Chromium 및 WebKit 등 렌더링 엔진 간의 모바일 터치 이벤트 시뮬레이션 미세 차이로 인해, 자동화 테스트 시 스와이프 임계값(88px) 판정 테스트가 간헐적으로 실패(Flaky)할 수 있음.
  - 구형 브라우저 등 다양한 환경에 따른 폰트 로딩 시점 차이로 인해 폴백 로직 동작이 누락될 가능성 존재.
- **Test strategy:**
  - **단위 테스트(Unit Test):** `Toast.test.tsx` 파일에 큐잉 및 중복 필터링 로직, 텍스트 이스케이프 처리가 올바르게 동작하는지 확인하는 Jest 테스트 작성.
  - **E2E 테스트:** 충돌 방지를 위해 `PORT=3100 npx playwright test` 명령을 사용하여 로컬 환경을 독립적으로 띄우고, 브라우저 엔진별 스와이프 제스처와 ARIA 속성 유지 여부 검증.
  - **수동 검수:** 크롬 개발자 도구의 네트워크 쓰로틀링(Throttling)을 활용하여 폰트 다운로드를 지연시킨 뒤, 텍스트 재평가 및 확장(Expand) 버튼 노출 여부 점검.

## 5. Design intent and style direction

- **기획 의도:** 플랫폼의 복잡한 시스템 상태, 에러 로그, 에이전트 작업 결과를 사용자의 워크플로우를 방해하지 않으면서도 명확하게 전달하여 운영 신뢰감을 확보하는 모니터링 경험 제공.
- **디자인 풍:** 불필요한 장식을 배제한 모던 미니멀 스타일의 시스템 플로팅 카드(Toast).
- **시각 원칙:**
  - **컬러:** 에러(Red), 성공(Green), 정보(Blue/Gray) 등 상태별 명확한 시맨틱 컬러 사용. 텍스트는 고대비 컬러를 적용하여 가독성을 최우선으로 확보.
  - **패딩/마진:** 화면 모서리와의 여백을 넉넉하게 설정하고, 컴포넌트 내부 텍스트 및 닫기 버튼 간의 여유로운 패딩을 부여하여 밀도를 낮춤.
  - **타이포:** 시스템 폰트를 기준으로 하되 로드 후 지정 폰트로 변경 시, 정보 계층(Title: Bold, Message: Regular)을 뚜렷하게 구분.
- **반응형 원칙:** 모바일 우선(Mobile-First) 디자인 설계. 작은 뷰포트에서는 하단 폭을 꽉 채우는 하단 고정형 카드로, 데스크탑에서는 화면 우측 하단에 적절한 너비로 적재되는 플로팅 레이아웃 적용.

## 6. Technology ruleset

- **플랫폼 분류:** web
- **기술 스택:** React (Vite 기반), TypeScript
- **테스트 환경:** Playwright (E2E), Jest (Unit)
- **포트 정책:** `3100` 포트 사용 (로컬 개발 환경 및 E2E 테스트 실행 시 적용)
