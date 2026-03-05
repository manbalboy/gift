# REVIEW

## Functional bugs
- **Dockerfile 누락 및 포트 바인딩 부재**: `SPEC.md`에 명시된 "1회 실행 사이클의 결과물은 Docker 실행 가능 상태" 및 "Preview 외부 노출 포트는 7000-7099 범위를 사용합니다"에 대한 요구사항이 완전히 반영되지 않았습니다. 현재 프로젝트 루트에 애플리케이션 빌드를 위한 `Dockerfile`이 존재하지 않으며, 해당 포트를 바인딩하거나 실행 환경을 구축하는 로직이 누락되어 있어 정상적인 Preview 컨테이너 실행이 불가능합니다.
- **네트워크 단절 및 재연결 시 로그 중복 및 순서 오류**: `PR_BODY.md`에도 기록된 바와 같이, 대용량 로그 스트리밍을 수신하는 도중 네트워크 단절 등으로 인해 SSE(Server-Sent Events) 재연결이 발생할 경우, 클라이언트 프론트엔드 UI에 이전 로그가 중복되어 나타나거나 역순으로 렌더링될 수 있는 잠재적인 기능적 결함이 존재합니다.

## Security concerns
- **정규식 기반 CORS 설정 우회 우려**: 현재 백엔드 서버(`api/app/main.py`)에 적용된 허용 origin 정규식이 `http://manbalboy.com.evil.com`과 같은 변형된 악성 서브도메인을 환경에 따라 완전히 차단하는지에 대해 더욱 정밀한 패턴 검증이 요구됩니다. (`test_main.py`에 차단 검증 테스트가 존재하지만 운영 환경의 Nginx/Reverse Proxy 단에서의 이중 검증이 필요합니다.)
- **세부 RBAC 기반 인가 로직 부재**: API 제어권 확보를 위해 `Depends(require_loop_control_permission)`가 추가되었으나, 실제 사용자 혹은 세부 역할별(Role-Based Access Control) 권한 그룹을 판별하고 제어하는 상세 구현체와의 연동이 부족하여 권한 탈취 혹은 오남용의 여지가 있습니다.
- **로그 인젝션 및 XSS 방어 한계**: `web/src/components/SystemAlertWidget.tsx` 내부에서 `sanitizeAlertText` 함수를 통해 XSS를 방어하고 있으나, Inject Instruction(주입식 명령어)을 통해 복잡한 악성 페이로드가 유입될 경우, 프론트엔드 파싱 단계에서 이를 완벽하게 무효화할 수 있는지 추가적인 보안 정적 검증이 필요합니다.

## Missing tests / weak test coverage
- **Redis 락 교착 상태 강제 종료 시나리오 테스트 누락**: 워커 노드의 비정상 강제 종료(Kill) 시 분산 락 해제 지연과 TTL 만료 전 재진입 불가 상황에 대한 통합 방어 테스트(Edge case fallback coverage)가 누락되어 있습니다.
- **단절 및 재연결 E2E 검증 취약**: 3100번 포트 환경에서의 단순 대용량 로그 스트레스 테스트(`system-alert-stress.spec.ts`)는 존재하지만, 네트워크 패킷 드랍 및 의도적 연결 해제(Disconnect) 후 재연결 시퀀스를 재현하는 테스트 커버리지가 미흡합니다.
- **Docker Preview 외부 노출 포트 통합 검증 부재**: 7000-7099 범위의 포트 바인딩과 컨테이너 띄우기 로직이 누락됨에 따라 이를 자동화 단계에서 검증하는 E2E 배포 테스트 역시 존재하지 않습니다.

## Edge cases
- **OOM 회피 윈도우 스파이크**: 서버 측에 설정된 로그 Retention(Windowing) 정책(`_retention_cutoff_utc`)이 주기적으로 실행되기 전, 다수의 워커에서 순간적인 대규모 로그 폭주(Burst)가 발생할 경우 허용된 메모리 임계값을 일시적으로 돌파하여 Python 프로세스가 강제 종료(OOM Killer)될 가능성이 있습니다.
- **Redis 분산 락 서버 단절 (네트워크 파티션)**: 분산 락을 제공하는 Redis 서버 자체가 순간적인 네트워크 파티션이나 장애를 겪었을 때, 루프 엔진의 상태 전이 요청이 영구적인 데드락에 빠지거나 고아 프로세스를 양산하지 않도록 Graceful Degradation 및 Fallback 처리가 명확하지 않습니다.
- **가상 스크롤 백그라운드 렌더링 정체 현상**: 3100 포트 로컬 테스트 등에서 대량의 로그 스트리밍 중 브라우저 탭이 백그라운드로 장시간 전환되었다가(`visibilitychange`) 복귀할 때, 그동안 밀려있던 가상 스크롤(`@tanstack/react-virtual`) 큐가 한 번에 DOM 렌더링을 시도하며 브라우저 멈춤 현상을 유발할 수 있는 극한의 상황을 고려해야 합니다.

## TODO

- [ ] 프로젝트 루트 디렉토리에 Preview 7000-7099 포트 바인딩 요구사항을 충족하는 `Dockerfile` 및 컨테이너 실행 스크립트 작성
- [ ] SSE 스트리밍 재연결 시 클라이언트 측 Sequence ID 기반 로그 중복 방지 및 정렬 보장 로직 구현
- [ ] Redis 분산 락 획득 실패 및 서버 순단 시 Graceful Degradation 처리를 담당하는 예외 복구(Fallback) 테스트 케이스 보강
- [ ] 순간적인 로그 Burst로 인한 메모리 스파이크 및 OOM을 방어하기 위해 윈도잉 주기를 단축하거나 실시간 메모리 캡(Cap) 제한 안전장치 추가
- [ ] 사용자의 상세 역할과 권한을 매핑할 수 있는 실제 RBAC(Role-Based Access Control) 연동 기반 마련
- [ ] 프론트엔드 XSS 공격 방어를 위한 `sanitizeAlertText` 처리 로직의 정적 보안 분석 도구 적용 및 취약성 점검
