# REVIEW

## Functional bugs
- **Dev Integration 웹훅 미구현**: `PLAN.md`에 정의된 GitHub PR, CI 결과, 배포 프리뷰 이벤트 연동을 위한 웹훅 엔드포인트가 백엔드 API에 구현되지 않았습니다. 현재는 워크플로우 엔진과 실행 라우터만 존재합니다.
- **대시보드 KPI 시각화 누락**: `PLAN.md`에서 프론트엔드 주요 과제로 삼은 '리드타임, 테스트 통과율, 병목 지점 시각화'가 `web/src/components/Dashboard.tsx`에 반영되지 않았습니다. 단순 상태 뱃지와 완료/실패 개수만 나열된 상태입니다.
- **Agent Marketplace 스펙 표준화 미비**: Agent의 입출력 스키마, 툴, 프롬프트 정책을 저장하고 템플릿 패키지를 버전 관리할 API 및 모델 계층의 구체적인 로직이 누락되었습니다.

## Security concerns
- **인메모리 Rate Limit의 분산 환경 우회 가능성**: SSE 재연결 폭주를 방어하기 위한 Rate Limit이 서버 메모리(`dict`)로 동작하여 여러 API 워커(Scale-out) 노드 구동 시 세션 상태 공유가 불가능합니다. 
- **CORS 허용 범위 과다 가능성**: `main.py`의 정규식(`allow_origin_regex`) 패턴이 `manbalboy.com` 도메인에 한해 포트 번호를 선택적(optional)으로 매칭하고 있어, 의도치 않은 임의의 포트 연결을 허용할 여지가 존재합니다. 

## Missing tests / weak test coverage
- **대시보드 컴포넌트 단위 테스트 누락**: 웹 화면의 `WorkflowBuilder`에 대한 테스트는 일부 존재하지만, 상태를 모니터링하는 `Dashboard.tsx`, `LiveRunConstellation.tsx` 등 핵심 KPI 뷰 테스트가 완전히 누락되었습니다.
- **Webhook 트리거 및 파싱 검증 누락**: 구현되어야 할 Dev Integration 웹훅 이벤트 페이로드 파싱, 검증 로직이 없으므로 관련 단위 테스트 및 통합 테스트도 없는 상태입니다.
- **Rate Limit 부하/동시성 테스트 미비**: Rate Limit 단일 워커 기준 성공 테스트는 있으나, 동시에 다중 접근이 쏟아지는 동시성 환경에서의 차단 능력을 검증하는 테스트 코드가 없습니다.

## Edge cases
- **런타임 Docker Daemon 유실**: API 애플리케이션 시작 시점에 1회 Docker Ping을 체크(`lifespan` 내 구현)하고 있으나, 운영 중 데몬 서비스가 죽었을 때를 대비한 동적인 런타임 방어/알람 체계가 부재합니다.
- **강제 종료(rm -f) 실패 시 좀비 컨테이너 누적**: 타임아웃 시 컨테이너를 강제 삭제 시도하지만 OS나 데몬 레벨에서 행(hang)이 발생해 삭제 명령 자체가 지연되면, 다음 태스크로 넘어가지 못하고 스레드가 고갈될 위험이 있습니다.

## TODO
- [ ] 외부 이슈 트래커 및 CI 연동을 지원하는 Webhook 이벤트 처리 API 엔드포인트 추가 구현.
- [ ] 프론트엔드 대시보드 내에 소요 시간(Lead time), 병목 구간 통계, 테스트 통과율 등 KPI 시각화 UI 추가 구현 (로컬 실행 확인 기준 포트: `http://localhost:3100`).
- [ ] 분산 워커 환경을 고려하여 SSE 재연결 폭주 방지(Rate Limiting) 로직을 인메모리 방식에서 Redis 기반으로 마이그레이션.
- [ ] API 서버의 CORS `allow_origin_regex` 범위를 점검하여 3100번대 포트 등 의도한 대역만 엄격히 통과하도록 정규화 수정 (예: `http://ssh.manbalboy.com:3101` 등).
- [ ] `Dashboard.tsx` 등 누락된 주요 프론트엔드 React 컴포넌트에 대한 Jest/RTL 기반 렌더링 테스트 코드 보강.
- [ ] `DockerRunner`가 각 작업(Task)을 실행하기 직전 가볍게 Docker 상태를 핑 체크하여 데몬 다운 시 좀비 생성을 조기 차단하는 로직 검토.
- [ ] Agent Marketplace 개념(Spec, Tools, Prompt)을 영속성 있게 관리하기 위한 DB 스키마 모델링 확장 및 CRUD API 추가.
