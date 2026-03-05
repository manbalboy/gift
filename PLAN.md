# PLAN

## 1. Task breakdown with priority

**P0 (High) - Security & Core Bug Fixes**
- [ ] **Backend (Security):** `api/app/services/system_alerts.py`의 `_sanitize_string` 함수 등에 입력 로그 텍스트의 최대 길이(예: 10,000자) 제한 방어 로직을 선제적으로 추가하여 악의적 페이로드로 인한 ReDoS(정규표현식 서비스 거부) 취약점 완화.
- [ ] **Database (Stability):** 시스템 알림 테이블 페이징 시 정렬 불안정 문제를 해결하기 위해, `api/scripts/migrations/`를 활용하여 `created_at` 단일 인덱스를 `(created_at DESC, id DESC)` 형태의 복합 인덱스로 마이그레이션.
- [ ] **Frontend (UI/UX):** `web/src/components/SystemAlertWidget.tsx` 또는 연관 스타일 시트에서 시스템 알림 텍스트 컨테이너에 `word-break: break-all` 및 `overflow-wrap: break-word` (또는 `anywhere`) 속성을 강제 적용하여 연속된 문자열에 의한 레이아웃 붕괴 버그 해결.

**P1 (Medium) - Test Coverage & Reliability**
- [ ] **Backend Test:** `api/tests/test_workflow_engine.py` 내부에 노드 반복 실행 예산(Budget) 한도 초과 상황과 관련하여, 경계값(Budget 수치와 정확히 일치하는 시점과 바로 직후)을 집중적으로 검증하는 단위 테스트 케이스 보강.
- [ ] **Frontend Test:** `web/tests/e2e/system-alert.spec.ts`에 극단적으로 긴 텍스트를 주입한 상태에서, 모바일 뷰포트(예: 너비 320px) 기준으로 UI 레이아웃이 화면 밖으로 이탈하지 않는지 시각적으로 검증하는 E2E 시나리오 추가.
- [ ] **Script Test:** `web/scripts/test-port-timeout.sh` 통합 쉘 스크립트 실행 시, 3100번대 포트(예: 3100)를 대상으로 여러 백그라운드 프로세스가 동시에 락을 선점하려 할 때의 타임아웃 및 정상 릴리즈 커버리지를 보장하는 부하 테스트 시나리오 보강.

**P2 (Low) - Enhancements (고도화 플랜)**
- [ ] **Enhancement 1: Cursor 기반 페이징 전환 및 최적화**
  - **근거:** REVIEW.md의 엣지 케이스에서 지적된 "동일 밀리초 대량 삽입 시 페이징 누락/중복" 문제를 근본적으로 해결하기 위해, 새로 추가되는 복합 인덱스(`created_at`, `id`)를 활용한 커서 기반 페이징 API를 도입합니다.
  - **구현 경계:** `api/app/api/logs.py`와 시스템 알림 조회 서비스 로직에만 적용하며, 기존 Offset 방식을 하위 호환성 유지 형태로 개선합니다.
- [ ] **Enhancement 2: 시스템 알림 일괄 정리(Clear All) API 및 UI 추가**
  - **근거:** 보안/에러 알림이 폭증한 이후 대응이 완료되었을 때, 관리자가 한 번에 알림 대시보드를 초기화하여 후속 알림 시인성을 확보하기 위함입니다. 자연스럽게 기존 기능과 연계됩니다.
  - **구현 경계:** FastAPI 백엔드에 전체 알림을 Soft-delete 혹은 Truncate 하는 관리자용 엔드포인트를 하나 추가하고, React `SystemAlertWidget` 상단에 작은 "Clear All" 버튼을 배치하는 선으로 제한합니다.

## 2. MVP scope / out-of-scope

**MVP Scope**
- 악의적인 초장문 텍스트 입력을 차단하여 백엔드 ReDoS를 방어하고 프론트엔드 모바일 레이아웃 붕괴를 수정하는 필수 버그 픽스.
- DB 복합 인덱스 추가와 이를 활용한 조회 최적화.
- 다중 락 경합 보장, 예산(Budget) 제한 경계값 단언, 모바일 해상도 방어를 포함한 견고한 테스트 커버리지 달성.
- 워크플로우 이벤트 급증 시 알림 조회 성능을 뒷받침할 페이징/일괄 정리 고도화 플랜 적용.

**Out-of-scope**
- 백엔드 아키텍처의 완전한 마이그레이션(예: 기존 내장 Workflow Engine을 Temporal 또는 LangGraph로 완전히 대체하는 작업은 본 MVP 사이클에서 제외).
- Redis Streams/PubSub 등을 활용한 전면적인 WebSockets 기반 실시간 로그 파이프라인 개편(현재의 기본 로직 구조 유지).
- 역할 기반 접근 제어(RBAC) 등 복잡한 인가 시스템 설계.

## 3. Completion criteria
- 모든 백엔드 `pytest` 유닛/통합 테스트가 에러 없이 성공하며, 특히 예산(Budget) 한도 경계값 검증 테스트가 통과해야 합니다.
- Playwright E2E 테스트(모바일 뷰포트)에서 긴 문자열이 포함된 `SystemAlertWidget`이 가로 스크롤(Overflow-x)을 발생시키지 않고 통과해야 합니다.
- `web/scripts/test-port-timeout.sh` 실행 시 동시 다발적인 백그라운드 락 접근에서 타임아웃 발생 및 포트 해제가 정상적으로 릴리즈되어 종료 코드 `0`을 반환해야 합니다.
- FastAPI 백엔드에서 극단적으로 긴 길이(예: 20,000자)의 페이로드가 인입될 경우 지정된 길이 한계(예: 10,000자)에서 안전하게 절삭되거나 거부 응답 처리가 되어 CPU 지연이 발생하지 않아야 합니다.

## 4. Risks and test strategy
- **정규식 서비스 거부(ReDoS) 및 절삭 리스크**
  - **전략:** 길이가 제한된 문자열 절삭(Truncate) 로직을 정규식 실행 '이전' 단계에 배치하여 병목을 원천 방지합니다. 단위 테스트에 5만 자 이상의 쓰레기 텍스트를 고의 주입하여 백엔드 성능 저하 여부를 측정합니다.
- **포트 경합 Race Condition 간헐적 실패 리스크**
  - **전략:** 쉘 스크립트 테스트 내부에서 비동기 프로세스 생성 시 충분한 슬립(Sleep)과 타임아웃 임계값 여유(예: 3초 이상)를 할당하여, 느린 CI 환경에서도 일관되게 릴리즈 프로세스가 관측되도록 제어합니다.
- **DB 인덱스 변경 시 운영 테이블 Lock 대기**
  - **전략:** 다운타임 방지를 위해 DB 엔진이 지원할 경우 `CONCURRENTLY` 옵션(혹은 SQLite 호환 `IF NOT EXISTS`)을 적용하여 마이그레이션 스크립트를 작성하고 통합 테스트 시 스키마 반영 속도를 점검합니다.

## 5. Design intent and style direction
- **기획 의도:** "사용자가 복잡하고 위험한 시스템 경고/오류를 인지함에 있어 방해받지 않고 즉각적으로 파악할 수 있는 안정적인 관제 경험 제공"
- **디자인 풍:** 카드(Card) 및 대시보드(Dashboard)형 모던 스타일. 불필요한 장식을 배제하고 개별 알림 항목의 시인성을 높이는 정보 중심(Information-driven) 디자인.
- **시각 원칙:**
  - **컬러:** 알림 레벨(Error/Warning)에 따라 붉은색과 노란색 계열의 시맨틱 컬러를 활용해 즉각적인 위험도 판단을 돕습니다. 마스킹된 민감 텍스트에는 명시적 하이라이트 처리를 유지합니다.
  - **타이포/패딩:** 에러 로그나 코드 트레이스가 포함되므로 시스템 폰트(Monospace)를 적극 차용하며, 아이템 간 Margin 및 패딩을 충분히 주어 긴 텍스트의 답답함을 줄입니다.
- **반응형 원칙:** **모바일 우선(Mobile-First)**. 좁은 모바일 화면(최소 320px)에서도 레이아웃 붕괴를 허용하지 않으며, 강제 줄바꿈(`word-break`)을 통해 스크롤 없이 세로로 자연스럽게 읽을 수 있도록 구성합니다.

## 6. Technology ruleset
- **플랫폼 분류:** `app` / `web` / `api` 중 **web** 및 **api** 적용
- **기술 스택 규칙:**
  - **web:** React 프레임워크 기반으로 구현 (TypeScript, Vite, Playwright 환경 유지)
  - **api:** FastAPI 기반 프레임워크로 계획 (Python, SQLAlchemy, Pytest 기반 유지)
- **네트워크 및 실행 규칙:**
  - 로컬 개발 환경 포트 바인딩이 필요할 경우, 포트 충돌 방지를 위하여 **3000번대 포트**(예: API 3000, Web 3100)만을 엄격히 사용합니다.
  - Preview 등 외부 노출 컨테이너 환경에서는 명세된 7000번대 포트를 준수합니다.
