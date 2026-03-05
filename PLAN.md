```markdown
# PLAN

## 1. Task breakdown with priority
- **[P0] 루프 엔진 핵심 구조 및 파이프라인 설계 (api)**
  - Analyzer, Evaluator, Planner, Executor 4단계 파이프라인 구현
  - 각 단계별 교착 상태(Deadlock) 방지 및 상태 전이 로직 보강 (REVIEW 반영)
  - Memory 시스템(장기 기억) 연동 기본 구조 구현
- **[P0] 제어 API 및 루프 안정성 제어 (api)**
  - `Start`, `Pause`, `Resume`, `Stop`, `Inject Instruction` 제어 API 구현
  - `Pause`, `Stop` 호출 시 백그라운드 프로세스의 Graceful Shutdown 로직 추가 (REVIEW 반영)
  - CORS 허용 origin 필터링 및 접근 권한 강화 (REVIEW 반영)
  - 중복 수정 방지 및 무한 루프 차단 기능 구현 (REVIEW 반영)
- **[P1] 대시보드 연동 및 로그 스트리밍 (web, api)**
  - 실시간 로그 스트리밍을 위한 SSE 통신 구현
  - 클라이언트 통신 단절 대비 SSE Sequence ID 동기화 및 중복 렌더링 차단 (REVIEW 반영)
  - `Inject Instruction` 입력값 및 로그 텍스트 XSS 살균(`sanitizeAlertText`) 처리 (REVIEW 반영)
- **[P2] 장기 실행(Long-Running) 인프라 안정화 (api)**
  - 장기 실행 대비 DB Connection Pool 타임아웃 및 반환 누수 방지 로직 최적화 (REVIEW 반영)

## 2. MVP scope / out-of-scope

**MVP Scope:**
- 텍스트(아이디어) 입력 기반 코딩 사이클(분석 → 평가 → 계획 → 실행)의 1회 이상 정상 수행
- 루프 제어 API(`Start`, `Pause`, `Resume`, `Stop`, `Inject Instruction`)의 정상 동작
- 최소한의 평가 기준(Quality Score)에 따른 개선 여부 판단 및 자동화
- 1회 실행 사이클 결과물의 Docker 실행 가능 상태 보장
- `REVIEW.md`에 명시된 필수 버그 및 보안 결함 수정 적용 (데드락 방지, XSS 차단 등)

**Out-of-scope:**
- 다중 프로젝트 동시 처리 (단일 프로젝트 루프에 집중)
- 복잡한 분산 아키텍처 지원 (단일 노드 또는 로컬 환경 중심)
- 세밀한 사용자 권한 및 결제 시스템 연동

## 3. Completion criteria
- 모든 제어 API(`Start`, `Pause`, `Resume`, `Stop`, `Inject Instruction`)가 오류 없이 동작할 것.
- AI가 생성한 결과물이 컨테이너화되어 Docker로 정상 실행될 것.
- 외부 노출 포트(7000-7099)를 통해 Preview URL(http://ssh.manbalboy.com:7000)로 정상 접근이 가능할 것.
- 루프가 무한 반복이나 데드락에 빠지지 않고 정해진 예산/루프 제한 내에서 종료 또는 일시 정지될 것.
- SSE 로그 스트리밍 시 중복 렌더링이나 XSS 취약점 없이 안정적으로 UI에 표출될 것.

## 4. Risks and test strategy
- **대용량 스트리밍 메모리 부족 위험:** 포트 `3100`을 타겟으로 하는 대용량 로그 스트리밍 Stress Test 스크립트 작성 및 OOM 검증
- **장기 실행 중 데이터 정합성 위험:** Redis 분산 락 획득 실패 및 타임아웃 시나리오 모사 통합 테스트(Integration Test) 구축
- **품질 저하 위험:** 품질 점수 급락 시 Safe Mode 전환을 검증하는 단위 테스트(Unit Test) 작성
- **도커 충돌 및 자원 점유 위험:** 실행 완료 및 중지 시 컨테이너 리소스의 완벽한 정리(Graceful Shutdown) 검증
- 테스트 전략:
  - 단위 테스트: Safe Mode 동작, XSS 살균 로직, 파이프라인 상태 전이 검증
  - 통합 테스트: Redis 락 장애 Fallback, DB 커넥션 풀 반환 검증
  - 스트레스 테스트: 대규모 로그 스트리밍 발생 시 메모리 한계점 방어 검증

## 5. Design intent and style direction
- **기획 의도:** 사용자는 아이디어만 제공하고 복잡한 개발 과정(생성, 테스트, 평가, 개선)은 시스템이 백그라운드에서 투명하고 신뢰성 있게 자동 수행하고 있음을 보여주는 경험.
- **디자인 풍:** 기술적이고 직관적인 모던 대시보드형 뷰.
- **시각 원칙:** 다크 모드 기반의 터미널 감성 제공, 진행 상태를 명확히 보여주는 상태 색상(Green: 성공, Yellow: 처리 중/개선 중, Red: 에러) 사용, 간결한 여백과 패딩 구성.
- **반응형 원칙:** 모바일 우선(Mobile-First) 디자인 원칙을 적용하되 데스크톱 환경의 넓은 화면에서는 여러 패널(로그, 상태, 시스템 메트릭)을 동시에 볼 수 있도록 확장.

## 6. Technology ruleset
- **플랫폼 분류:** api, web
- **api:** FastAPI 기반으로 계획
- **web:** React 기반 라이브러리/프레임워크로 계획
```
