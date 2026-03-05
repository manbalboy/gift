# PLAN

## 1. Task breakdown with priority
- **[P0] Loop Engine 안정화 (고도화 플랜)**
  - `api/app/services/loop_simulator.py` 내 `_run_forever` 메인 틱 루프에 전역 예외 처리(`try-except Exception`) 추가.
  - 비정상 크래시 발생 시 엔진 상태를 `"stopped"` 또는 `"idle"`로 롤백하는 복구 로직 적용 (좀비 상태 방지).
- **[P0] CORS 정책 수정 (고도화 플랜)**
  - `api/app/main.py`의 `_CORS_ALLOWED_PORT_PATTERN`을 수정하여 Preview 노출 포트 대역(7000~7099)을 포함(`(?:31\d{2}|70\d{2})`)하도록 허용 정책 업데이트.
- **[P1] 백그라운드 엔진 검증 강화 (고도화 플랜)**
  - 루프 엔진 시뮬레이터 비정상 종료 후 재시작, 예산(Budget) 초과 정지, 최대 루프 도달 시 상태 전이를 검증하는 모듈 단위 테스트(pytest) 작성.
- **[P2] 대용량 에러 로그 렌더링 최적화 (고도화 플랜)**
  - `web/src/components/ErrorLogModal.tsx`에서 5,000자 이상 대용량 로그 '전체 보기' 시 발생하는 UI 프리징을 방지하기 위해 가상화 렌더링(Virtualization) 또는 청크 단위 페이지네이션 적용.
- **[P2] 보안 필터 안정성 강화 (고도화 플랜)**
  - `web/src/utils/security.ts` 내 `sanitizeAlertText`와 `restoreSafeGenericTokens` 로직에 XSS 방어 주석 추가 및 악의적 속성(빈 핸들러 등) 차단을 위한 화이트리스트 교차 검증 로직 구현.

## 2. MVP scope / out-of-scope
- **MVP Scope**
  - Self-Improvement Loop 엔진의 안전한 구동 및 중지, 재시작 제어(크래시 복구 포함).
  - Preview 환경(7000번대 포트)에서의 정상적인 프론트엔드-백엔드 API 통신(CORS 해결).
  - 대용량 로그 데이터 발생 시 브라우저 멈춤 없이 렌더링하는 UI/UX 제공.
  - XSS 등 프론트엔드 렌더링 기반 보안 위협에 대한 필터 검증.
- **Out-of-scope**
  - 실제 AI 모델(LLM)을 연동한 소스코드 자동 수정 기능 (현재는 시뮬레이션 기반 동작 유지).
  - 멀티 노드/분산 환경에서의 루프 엔진 병렬 실행.
  - 별도 DB나 파일 시스템을 활용한 장기 기억 시스템(Memory System) 영구 저장 기능.

## 3. Completion criteria
- Preview 환경 배포 시(`http://ssh.manbalboy.com:7000` 등), 프론트엔드에서 백엔드 API 호출 시 CORS 오류가 발생하지 않아야 함.
- 백그라운드 스레드에서 강제 예외가 발생하더라도 루프 상태(`_mode`)가 `"running"`으로 고착되지 않고 재시작 가능한 상태로 복구되어야 함.
- ErrorLogModal에서 수만 자 이상의 에러 로그를 확장하여도 브라우저 메인 스레드가 멈추지 않고 즉시 응답해야 함.
- 복잡한 속성이 포함된 HTML 태그가 시스템 알럿 로그에 주입되어도, 검증된 화이트리스트 밖의 스크립트 실행 요소(XSS)가 완전히 렌더링되지 않아야 함.
- 위 루프 엔진 예외 상황 처리 및 상태 변화에 대한 백엔드 단위 테스트(pytest)가 모두 통과해야 함.

## 4. Risks and test strategy
- **Risks**
  - 가상화 렌더링 적용 시, 문자열 경계선(멀티바이트 문자, 이모지 등)에서 자르기가 발생할 경우 텍스트 깨짐 현상 발생 우려.
  - DOMPurify와 자체 커스텀 화이트리스트 정규식 간의 충돌로 인해 안전한 텍스트도 과도하게 필터링될 위험.
- **Test strategy**
  - **Backend (pytest)**: `LoopSimulator`에 강제로 Exception을 던지는 모의(Mock) 상황을 구성해, 스레드 크래시 후 `_mode` 상태 변이 및 API 재시작 여부를 확인하는 자동화 테스트 수행.
  - **Frontend 성능 테스트**: Playwright 또는 Jest를 사용하여 10만 자 이상의 더미 텍스트(한글/이모지 포함)를 로그 모달에 주입하고, '전체 보기' 토글 간 렌더링 시간 및 멀티바이트 깨짐 여부 검증.
  - **Security 엣지케이스 테스트**: `web/src/utils/security.test.ts`에 `<img onerror=>`, `<svg/onload=alert>` 등 기형적 XSS 페이로드를 추가하여 필터링 우회 여부를 교차 검증.

## 5. Design intent and style direction
- **기획 의도**: 개발자 및 AI 관리자가 24시간 자율 개선 루프(Self-Improvement Loop)의 상태와 문제 상황을 즉각적이고 안정적으로 인지하고 개입할 수 있는 통제력 제공.
- **디자인 풍**: 모던 대시보드형, 기술적이고 정제된 개발자 도구 스타일.
- **시각 원칙**:
  - 컬러: 다크 모드 위주의 배경(Dark Gray, Black) 및 상태별 명확한 포인트 컬러(정상-Green, 경고-Yellow, 에러-Red) 사용.
  - 타이포/간격: 에러 로그 및 시스템 알럿은 Monospace 코딩 폰트를 사용하여 가독성을 높이고, 컴포넌트 간 일관된 패딩(예: 16px, 24px)으로 여백의 미 확보.
- **반응형 원칙**: 모바일 우선 규칙(Mobile First)을 적용. 모바일 뷰포트에서도 상태 요약 및 루프 제어(Start/Stop/Pause) 컨트롤이 레이아웃 깨짐 없이 동작하도록 구성.

## 6. Technology ruleset
- **플랫폼 분류**: web, api
- **web**: React 기반 라이브러리 및 Vite 활용. (상태 관리, DOMPurify, 가상화 렌더링 라이브러리 도입 등)
- **api**: FastAPI 기반 설계 및 백그라운드 스레드 시뮬레이터(`LoopSimulator`) 유지보수.
