```markdown
# PLAN

## 1. Task breakdown with priority

**Priority: High**
- [ ] **Loop Engine API 스키마 및 모의 라우팅 설계**: FastAPI를 사용하여 Analyzer, Evaluator, Planner, Executor의 기본 라우팅 및 모의 응답(Mock) 엔드포인트 초안 설계 (`api/app/api/loop_engine.py` 등 활용).
- [ ] **데이터베이스 스키마 초안 작성**: 무한 루프 방지(Loop Control: `max_loop_count`, 예산 제한 등) 및 장기 기억(Memory) 저장을 위한 Pydantic 및 SQLAlchemy 스키마 초안 작성.
- [ ] **CORS 정책 검증 및 설정**: API 웹 서버의 CORS 정책을 `manbalboy.com` 및 `localhost` 계열로 엄격하게 제한 적용 (`api/app/main.py`).
- [ ] **보안 및 예외 처리 고도화 (XSS)**: 비정형 XSS 방어 로직을 고도화하고, 제네릭 문법(`<T>`) 오탐을 방지하기 위한 정규식 성능 최적화(ReDoS 방지) 및 예외 처리 반영 (`web/src/utils/security.ts`).

**Priority: Medium**
- [ ] **`ErrorLogModal` UI/UX 개선**: 5000자 초과 대용량 로그 렌더링 시 병목 현상을 방지하기 위한 Truncation('Show more' 버튼) 구현, `overflow-y: auto`, `word-break: break-all` 속성 적용 (`web/src/components/ErrorLogModal.tsx`).
- [ ] **Toast 알림 및 클립보드 예외 처리 연동**: 전역 Toast 알림 기능 추가, 에러 로그 복사 버튼 연속 클릭 시 디바운싱 처리 및 클립보드 API(`navigator.clipboard.writeText`) 권한 거부 예외 처리 적용.
- [ ] **보안 및 클립보드 관련 단위 테스트 작성**: `web/src/components/ErrorLogModal.test.tsx`에 클립보드 Mock 테스트 추가, `web/src/utils/security.test.ts`에 XSS 교차 검증 및 제네릭 심화 엣지 케이스 단위 테스트 추가.

**Priority: Low**
- [ ] **로컬 렌더링 붕괴 여부 통합 수동 테스트**: 프론트엔드 환경(`http://localhost:3000` 대역 포트 사용)에서 빈 문자열, 띄어쓰기 없는 극단적 텍스트 등을 주입하여 뷰포트 붕괴 현상 점검.
- [ ] **Docker Preview 환경 구성**: 구현된 API 및 Web 사이클 결과물이 외부 7000~7099 포트에서 정상 노출되도록 환경 검토.

## 2. MVP scope / out-of-scope

**MVP Scope**
- Self-Improvement Loop 4대 핵심 엔진(Analyzer, Evaluator, Planner, Executor)의 API 라우팅 아키텍처 및 모의 응답(Mock) 구조 구현.
- 루프 안정성(Max Loop Count 등) 및 장기 기억(Memory) 처리 데이터 스키마 기초 설계.
- 프론트엔드 대용량 에러 로그 컴포넌트(`ErrorLogModal`)의 성능 최적화 및 렌더링 안정성 확보.
- 프론트엔드 클립보드 오류 대응 및 XSS 정규식 필터 보안/성능 향상.
- 규정된 CORS 정책 및 로컬 구동 포트 정책 준수(프론트엔드/API 3000번대 포트 사용).

**Out-of-scope**
- 실제 AI 모델을 연동한 소스코드 분석, 단위 테스트 코드의 자동 생성 및 실행 로직 완전 구현 (이번 MVP는 설계 및 Mock 수준까지 진행).
- 실제 프로젝트 디렉터리를 스캐닝하여 동적 코드 복잡도를 산출하는 분석 엔진의 완전 구현.
- Redis 분산 락, Celery/RabbitMQ 등 대규모 백그라운드 태스크 메세지 큐 시스템의 실제 연동 및 배포 구성.

## 3. Completion criteria

- **API 라우팅**: Analyzer, Evaluator, Planner, Executor 역할을 담당하는 FastAPI 엔드포인트가 정상적으로 모의 응답(Mock Data)을 반환하는가?
- **스키마 정의**: 무한 루프 제어 및 장기 기억 데이터 보존을 위한 스키마(Pydantic/SQLAlchemy)가 구조적으로 정의되고 검증되었는가?
- **프론트엔드 성능**: 대규모 에러 로그를 렌더링할 때 UI 레이아웃이 붕괴되지 않고 Truncation 기능이 정상 동작하는가?
- **보안 및 에러 핸들링**: 정규식 기반 XSS 필터 우회 방어 및 성능 저하 문제가 해결되었으며, 클립보드 복사 에러가 사용자 친화적으로 안전하게 처리되는가?
- **테스트 커버리지**: `ErrorLogModal`의 클립보드 기능과 `security` 모듈의 XSS/제네릭 처리 방어 로직에 대한 Mock 단위 테스트가 추가되고 모두 통과하는가?
- **인프라/보안**: CORS 정책이 허용 기준값(`manbalboy.com`, `localhost`)에 부합하도록 엄격히 통제되었는가?

## 4. Risks and test strategy

**Risks**
- FastAPI 백그라운드 루프 엔진 상태 제어(Start, Pause, Stop) 실패 및 예외 처리 누락으로 인한 시스템 리소스 무한 점유.
- 정규식 최적화 실패로 인한 ReDoS(정규표현식 서비스 거부) 취약점 지속 및 프론트엔드 프리징.
- 극단적인 텍스트 렌더링 시 브라우저 메인 스레드 점유로 인한 사용자 경험 저하.

**Test strategy**
- **Unit Test (API)**: 최대 루프 허용치 도달 및 예산 한도 초과 상황 등 무한 루프 방지 로직과 데이터 검증 단위 테스트 수행.
- **Unit Test (Web)**: XSS 방어 정규식에 악의적 페이로드 및 정상 제네릭 코드를 주입하는 교차 검증 단위 테스트 작성. 클립보드 권한 예외 상황 Mocking 테스트 작성.
- **Manual Test (Local)**: `http://localhost:3000` 대역의 로컬 환경을 띄우고 빈 텍스트, 거대 더미 텍스트 등 Edge Case 데이터를 주입하여 UI 붕괴나 무한 Toast 알림 증식이 없는지 수동 통합 테스트.
- **Security Check**: API 응답 헤더 및 Preflight 요청 테스트를 통해 CORS 허용 도메인 정책이 정확히 적용되었는지 확인.

## 5. Design intent and style direction

- **기획 의도**: 지속 발전하는 AI 자동화 루프(Self-Improvement Loop)의 아키텍처를 견고히 하고, 사용자가 내부 엔진 상태와 대규모 로그를 직관적이고 끊김 없이 관제할 수 있는 시각적 안정감을 제공한다.
- **디자인 풍**: 군더더기 없는 미니멀리즘 대시보드형. 시스템 로그와 코드를 명확히 식별할 수 있는 모던한 콘솔 스타일의 개발자 친화적 디자인.
- **시각 원칙**: 모노스페이스 기반 타이포그래피를 적용하여 코드의 가독성을 높인다. 에러(Red), 경고(Yellow) 등 시스템 상태를 나타내는 색상을 제한적으로 사용하고, 여백(Margin/Padding)을 충분히 확보하여 밀도 높은 정보 사이의 시각적 피로도를 낮춘다.
- **반응형 원칙**: 모바일 우선(Mobile First) 규칙을 적용한다. 모바일과 같은 작은 뷰포트에서는 화면을 벗어나지 않도록 `word-break` 속성과 가로 스크롤을 혼합하여 유연하게 레이아웃이 줄어들도록 대응한다.

## 6. Technology ruleset

- **플랫폼 분류**: web, api
- **web**: React 기반(Vite 환경) 라이브러리로 프론트엔드 UI 및 상태 관리를 계획.
- **api**: FastAPI 기반으로 Self-Improvement Loop 엔진 및 코어 백엔드 API 시스템을 계획.
```
