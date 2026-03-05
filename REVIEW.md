# REVIEW

## Functional bugs
- **Workflow Engine v2 및 런타임 구성**: `api/app/core/config.py`에서 `DEVFLOW_WORKFLOW_NODE_MAX_RETRIES`를 3으로 설정하여 명세에 맞게 노드 단위 재시도가 구현되어 있으며, `DEVFLOW_WORKFLOW_NODE_ITERATION_BUDGET` (기본값 8)을 통해 무한 루프 예산을 제어하고 있습니다. 단위 테스트(157개 패스)를 통해 전반적인 기능이 안정적으로 동작함을 확인했습니다.
- **포트 고갈 방지 로직**: `web/scripts/check-port.mjs` 스크립트에서 3100~3199 포트에 대해 가용성 검사를 수행하며, 포트 고갈 시 4회 재시도 후 타임아웃 종료(`process.exit(1)`)되도록 구현되었습니다. 기능적 요구사항은 충족하지만, 재시도 대기 시간(250ms * attempt)이 짧아 총 대기 시간이 약 2.5초에 불과해 일시적인 점유 상황에서는 여전히 실패할 가능성이 있습니다.
- **환경 변수 파싱 Fallback**: 환경 변수 파싱 시 발생하는 예외 처리가 `record_system_alert`를 통해 정상적으로 경고 처리되고 있으며, 프론트엔드 `SystemAlertWidget`으로 연동되어 시각화가 완료되었습니다.
- **UI 툴팁 렌더링**: `web/src/styles/app.css`에 `word-break: break-all`과 `break-word` 속성이 다수 적용되어 있어 극단적으로 긴 텍스트(공백 없는 문자열)로 인한 가로 스크롤 레이아웃 이탈 버그가 정상적으로 방어된 것으로 보입니다.

## Security concerns
- **OS Lock 권한 및 파일 경합 방어**: `api/tests/test_workspace_security.py`를 통해 OS Lock 접근 권한 부족(`PermissionError`) 및 경합 에러 처리 로직이 견고하게 테스트되고 있으며, 시스템 크래시를 유발하지 않습니다.
- **CORS 및 접근 제어**: SPEC.md에 명시된 Preview 외부 노출 포트 범위(7000-7099)와 별개로, 기본 시스템 설정은 보호 포트 대역(3100~3199)에 대해 스푸핑 가드(`localhost_spoof_guard_ports`)를 구현하고 있어 보안상 안전합니다. 
- **설정 및 시크릿 토큰**: 다양한 Webhook Secret, Viewer Token들이 분리되어 있으며 만료시간(`DEVFLOW_PREVIEW_VIEWER_TOKEN_TTL_SECONDS` 기본값 180초 등)이 적절하게 구성되어 있습니다.

## Missing tests / weak test coverage
- **프론트엔드 UI 통합 테스트 부족**: 백엔드 API 모듈들은 157개의 `pytest` 항목으로 촘촘히 검증되었으나, 신규로 추가된 대시보드의 `SystemAlertWidget` 및 툴팁 렌더링(Overflow 방어)에 대한 Playwright 기반의 시각적 E2E 테스트 혹은 DOM 상태 검증 테스트 코드가 누락되었습니다.
- **포트 스크립트 E2E 검증**: `web/scripts/check-port.mjs`가 3100번대 대역 점유 상태에서 타임아웃 처리됨을 입증하는 실제 쉘 기반 E2E 테스트(가상 프로세스 점유 테스트) 코드가 명시적으로 보이지 않습니다. 

## Edge cases
- **초장기 실행 중 메모리/컨텍스트 누수**: `config.py`에 재시도 횟수와 루프 예산(budget) 제한이 포함되어 있어 1차적인 무한 루프는 방지되나, 동일 런타임 환경에서 장기간(수일 이상) 실행 시 Node Run 이력이 방대해지면서 발생할 수 있는 DB I/O 지연 및 로그 페이징 처리 부하 발생 여부를 주시해야 합니다.
- **포트 할당 동시성 경합**: 여러 워커가 동시에 `check-port.mjs`를 실행할 경우, `checkPortAvailable` 메서드가 `listen` 후 바로 닫고(`server.close`) 그 포트를 반환하므로, 두 워커가 1ms 단위로 겹칠 때 동일 포트를 획득할 가능성(Race condition)이 존재합니다.
- **툴팁 세로 오버플로우**: 가로 오버플로우는 `word-break`로 방어되었지만, 모바일 화면에서 너무 많은 경고가 발생할 경우 `max-height`를 넘어서는 세로 오버플로우 혹은 위젯 밖 이탈이 발생할 수 있습니다.

---

## TODO
- [ ] `web/scripts/check-port.mjs`의 포트 탐색 동시성 Race Condition 문제 해결을 위해 실제 포트 할당 시 점유 유예 시간을 추가하거나, 재시도 대기 시간(RETRY_SLEEP_MS)을 더 넉넉하게 늘려주세요.
- [ ] 프론트엔드 영역(Vite 환경)에서 신규 추가된 `SystemAlertWidget` 및 에러 툴팁의 `word-break`가 다양한 뷰포트(데스크톱/모바일)에서 잘 반영되었는지 확인하는 Playwright 기반 E2E 시각 테스트를 작성하세요.
- [ ] 백엔드의 시스템 로그 API(`api/app/api/logs.py`)에서 최대 50건의 로그를 가져올 때, DB 인덱스 스캔을 효율적으로 수행하도록 생성일시 역순 조회 인덱스가 올바르게 적용되어 있는지 검토하세요.
- [ ] (옵션) 3100번대 포트 점유 상황을 의도적으로 유발하여 `check-port.mjs`의 타임아웃 종료를 검증하는 간단한 BASH 테스트 스크립트를 추가하세요.
