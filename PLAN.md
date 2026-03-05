# PLAN

## 1. Task breakdown with priority
**P0: 백엔드 루프 제어 엔진 안정성 확보 (Loop Control)**
- 대상 파일: `api/app/services/loop_simulator.py`
  - 내용: 클래스 내에 `max_loop_count` 및 `budget_limit` 설정 상태를 추가하고, 메인 틱 루프(`_run_forever`) 구동 시 한도를 초과하면 엔진을 안전하게 중지(`stopped` 상태로 전이)하는 제어 로직 구현.
- 대상 파일: `api/tests/test_loop_simulator.py` (또는 신규 테스트 파일)
  - 내용: 예산 초과 및 최대 사이클 도달 조건에서 루프 엔진이 정상적으로 `stopped` 상태로 멈추는지 검증하는 단위 테스트(`pytest`) 보강.

**P1: 프론트엔드 UI/UX 대용량 텍스트 렌더링 개선**
- 대상 파일: `web/src/components/ErrorLogModal.tsx`
  - 내용: 기존의 코드 포인트 분할(`Array.from`) 로직에서 발생하는 Grapheme Cluster Break(글자 깨짐) 엣지 케이스를 해결하기 위해, `Intl.Segmenter` 기반의 안전한 텍스트 자르기 또는 줄바꿈 단위 분할 방식으로 개선.
- 대상 파일: `web/src/components/ErrorLogModal.test.tsx`
  - 내용: 10만 자 이상의 한글 및 ZWJ 조합형 이모지(👨‍👩‍👧‍👦 등)가 포함된 더미 텍스트를 주입하여, 브라우저 렌더링 프리징과 텍스트 깨짐 현상이 없는지 검증하는 테스트 추가.

**P2: 타입 안정성 및 보안 문서화**
- 대상 파일: `web/src/utils/security.ts`
  - 내용: `sanitizeAlertText` 함수의 반환값을 React의 `dangerouslySetInnerHTML` 등으로 오남용하는 것을 방지하기 위해, 반환값이 '순수 평문 텍스트'임을 강제하는 TypeScript Branded Type을 적용하거나 명시적 JSDoc 주석을 추가.

## 2. MVP scope / out-of-scope
- **MVP Scope**
  - Self-Improvement Loop 시스템의 폭주를 막기 위한 최소한의 안전 장치(반복 횟수 및 예산 제한) 백엔드 구현.
  - 관리자가 엔진 상태 로그를 조회할 때 대용량 텍스트와 다국어 텍스트가 깨지지 않고 쾌적하게 렌더링되는 모니터링 UI 확보.
  - 위 기능의 신뢰성 보장을 위한 필수 API 및 프론트엔드 자동화 테스트 케이스 작성.
  - 런타임 보안 향상을 위한 유틸리티 함수 타입 제어.
- **Out-of-scope**
  - 실제 대규모 언어 모델(LLM)을 연동한 프롬프트 코드 생성/분석 엔진의 세부 구현 (현재는 시뮬레이터와 오케스트레이터의 흐름 제어에 집중).
  - 다중 서버 인스턴스 환경에서의 복잡한 분산 엔진 상태 동기화 (기존 락 메커니즘만 유지).

## 3. Completion criteria
- 백엔드: `LoopSimulator`가 내부 한도(`max_loop_count` 또는 `budget_limit`) 도달 시 더 이상 틱을 실행하지 않고 즉각 `stopped` 상태로 전환된다.
- 프론트엔드: `ErrorLogModal`에서 10만 자 이상의 복합 텍스트(한글, 이모지 포함)를 여러 페이지로 청크 분할하여 렌더링해도 문자가 훼손되거나 UI가 멈추지 않는다.
- 테스트: 신규 작성된 백엔드 루프 제어 테스트(pytest)와 프론트엔드 렌더링 분할 테스트(Vitest/Jest)가 정상적으로 모두 통과한다.
- 배포: 완성된 사이클의 결과물 컨테이너가 정상 구동되며, 로컬 테스트 시 3000번대 포트를 원활하게 점유하고 배포 프리뷰 환경(7000번대 포트)에 접근 시 오류가 없다.

## 4. Risks and test strategy
- **Risks**
  - 프론트엔드 텍스트 분할에 `Intl.Segmenter` API를 사용할 경우 일부 구형 브라우저에서 호환성 문제가 발생하여 스크립트 에러를 유발할 수 있음.
  - 백엔드 루프 종료 조건을 잘못 설계하면 엔진 초기 구동 시 의도치 않은 조기 종료(Early exit) 현상이 발생할 수 있음.
- **Test Strategy**
  - **백엔드**: 모의 루프 횟수 및 예산 값을 각각 한계치로 설정한 뒤, 상태(mode)가 `running`에서 `stopped`로 정확히 바뀌는지 단언(assert)하는 엣지 케이스 단위 테스트 작성.
  - **프론트엔드**: 호환성 에러 방지를 위해 기능 미지원 브라우저용 폴백(Fallback) 방어 로직을 구현하고, 실제 복합 문자의 분할 경계에서 손실이 생기지 않는지 검증하는 단위 테스트 추가.

## 5. Design intent and style direction
- **기획 의도**: 개발자 및 관리자가 24시간 자율 동작하는 루프 엔진의 상태와 방대한 에러 로그를 직관적이고 끊김 없이 안전하게 모니터링할 수 있는 뷰를 제공한다.
- **디자인 풍**: 개발자 친화적인 대시보드 및 터미널 뷰 형식을 차용한 모던하고 미니멀한 UI.
- **시각 원칙**:
  - 타이포그래피: 로그 및 코드 영역은 가독성과 정렬을 위해 고정폭(Monospace) 폰트 적용.
  - 컬러/여백: 정상/경고/에러 등 시스템 상태를 뚜렷한 색상으로 구분하고, 대용량 로그 출력 시 눈의 피로를 최소화하도록 충분한 줄 간격 및 패딩 여백 확보.
- **반응형 원칙**: 모바일 우선(Mobile-First) 설계. 좁은 모바일 화면에서는 스와이프 가능한 하단 시트(Bottom Sheet) 모달 형태로 표시하고, 데스크톱에서는 팝업 형태의 넒은 카드형 모달로 확장 적용.

## 6. Technology ruleset
- **플랫폼 분류**: web, api
- 프론트엔드(web): React 기반 프레임워크와 TypeScript를 활용하여 대용량 로그 렌더링 최적화 및 타입 안전성을 확보.
- 백엔드(api): FastAPI 프레임워크와 Python을 활용하여 비동기 루프 엔진 제어 및 상태 모니터링 API 구현.

## 7. 고도화 플랜 (Advancement Plan)
*REVIEW.md에 명시된 TODO 항목을 최우선으로 반영하며, 현재 기능 구현과 자연스럽게 연결되는 인접 편의 기능을 제안합니다.*

- **반영 항목 (REVIEW.md TODO)**
  - `LoopSimulator` 무한 실행 방지 로직(max_loop_count, budget_limit) 추가 및 검증.
  - `ErrorLogModal` 대용량 분할 렌더링 로직 개선 및 10만 자 테스트.
  - `sanitizeAlertText` 함수의 반환값 타입 안전성 강화 문서화 적용.

- **추가 기능 1: 수동 루프 개입(Manual Override) API 확충**
  - **근거(왜 필요한지)**: 루프가 한계치 도달 및 예산 초과로 `stopped` 상태로 자동 정지되었을 때, 관리자가 상태 로그를 검토한 후 즉시 임계값 파라미터를 동적으로 재조정하여 엔진을 빠르게 재가동할 수 있는 운영 수단이 필요합니다.
  - **구현 경계**: 백엔드의 `LoopSimulator`에 기존 제한 설정을 덮어쓰고 강제로 `running` 상태로 복구하는 간단한 엔드포인트를 추가하는 것으로 범위를 한정합니다. 무거운 추가 비즈니스 로직 도입은 배제합니다.
