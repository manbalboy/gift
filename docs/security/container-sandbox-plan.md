# 실행 워커 컨테이너 격리 방안 (MVP 설계)

## 목표
- Agent가 생성한 `command`를 호스트에서 직접 실행하지 않고, 임시 컨테이너에서 실행해 RCE 영향을 최소화한다.

## 기본 구조
- API Worker는 실행 요청을 받으면 임시 작업 디렉토리를 생성한다.
- `docker run --rm`으로 단기 컨테이너를 띄워 스크립트를 실행한다.
- 컨테이너에는 워크스페이스 읽기 전용 마운트, 산출물 경로만 쓰기 가능 마운트를 부여한다.
- 실행 결과(stdout/stderr, exit code)만 호스트로 반환한다.

## 보안 정책
- `--network none`으로 외부 네트워크 차단.
- `--cap-drop=ALL --security-opt no-new-privileges` 적용.
- 기본 사용자 `nobody` 또는 전용 비루트 UID로 실행.
- CPU/메모리/프로세스 제한(`--cpus`, `--memory`, `--pids-limit`) 적용.
- 실행 시간 초과 시 컨테이너 강제 종료.

## 단계별 도입
1. Phase 1: 선택형 실행기(`HostRunner`/`DockerRunner`) 분리.
2. Phase 2: DockerRunner를 기본값으로 전환, 호스트 실행기 비활성화.
3. Phase 3: 이미지 서명 검증과 감사 로그(누가 어떤 커맨드를 실행했는지) 추가.

## 운영 체크리스트
- 실패 시 컨테이너 ID, 이미지 태그, 제한값, 종료 사유를 로그에 남긴다.
- 컨테이너 이미지 업데이트 시 취약점 스캔 리포트를 PR에 첨부한다.
- 프로덕션은 allowlist 이미지 외 실행 금지 정책을 적용한다.
