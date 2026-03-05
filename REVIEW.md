# REVIEW

### Functional bugs
- **UI 텍스트 오버플로우 및 레이아웃 붕괴:** 모바일 뷰포트(예: 너비 320px) 환경에서 시스템 알림(`SystemAlertWidget`)에 띄어쓰기가 없는 극단적으로 긴 문자열이 전달될 경우, 텍스트가 컨테이너 영역을 벗어나 가로 스크롤바가 발생하고 레이아웃이 붕괴되는 버그가 있습니다. 요소에 `word-break: break-all` 및 `overflow-wrap: break-word` 속성이 누락되어 발생합니다.
- **Offset 페이징 데이터 누락 및 중복 결함:** 대량의 시스템 알림이 동시에(동일 밀리초 등) 적재되는 환경에서, 기존의 Offset 방식 페이징을 사용해 다음 페이지를 조회하면 로그 항목의 누락이나 중복 조회가 발생할 수 있는 치명적 결함이 존재합니다. 데이터 일관성을 위해 Cursor 기반 페이징으로의 전환이 필수적입니다.

### Security concerns
- **ReDoS (정규표현식 서비스 거부) 취약점:** `api/app/services/system_alerts.py` 파일 내 `_sanitize_string` 등의 텍스트 검열 로직에서 정규표현식을 실행하기 전 입력 문자열 길이를 제한하지 않고 있습니다. 악의적인 사용자나 시스템이 20,000자 이상의 비정상적으로 긴 텍스트 페이로드를 인입시킬 경우, 정규표현식 처리 병목으로 인해 서버가 서비스 거부 상태에 빠질 위험이 있습니다.

### Missing tests / weak test coverage
- **워크플로우 예산(Budget) 제한 테스트 누락:** 초장기 24시간 루프 실행이 예상되는 엔진에서 무한 반복을 제어하는 예산 한계 경계값 초과 상황에 대한 단위 테스트(`api/tests/test_workflow_engine.py`)가 없습니다.
- **모바일 뷰포트 시각 테스트 부족:** 프론트엔드 모바일 UI 환경에서 장문의 텍스트 입력 시 레이아웃 초과 여부를 자동 검증하는 Playwright E2E 테스트 시나리오(`web/tests/e2e/system-alert.spec.ts`)가 불충분합니다.
- **포트 동시성 락 경합 커버리지 미흡:** `web/scripts/test-port-timeout.sh` 스크립트를 여러 백그라운드 프로세스로 동시 실행할 때 발생하는 다중 락 경합 상황 및 데드락 해제, 타임아웃 검증 시나리오가 빈약합니다.

### Edge cases
- **초당 대량 로그 삽입 동시성 처리:** 수십 건의 로그가 완전히 동일한 밀리초(ms) 단위의 타임스탬프로 DB에 삽입되는 극단적인 엣지 케이스에서 단순 날짜순 정렬 시 순서가 꼬일 수 있습니다. `(created_at DESC, id DESC)` 형태의 복합 인덱스를 적용해야만 Cursor 기반 페이징에서 무한 스크롤이나 중복 조회를 방어할 수 있습니다.
- **대량 로그 렌더링 부하 발생:** 이벤트 버스와 통합되어 짧은 시간에 엄청난 양의 알림이 발생할 경우, 클라이언트 브라우저의 렌더링 부하를 막기 위해 일괄 초기화(Clear All) 버튼을 통한 즉각적인 화면 정리와 오프라인 분석을 위한 다운로드(Export Logs) 기능이 필요합니다.
- **로컬 실행 포트 충돌 가능성:** 개발 환경에서 프론트엔드와 API 서버, 외부 Preview 서버 등이 동시에 동작할 때 포트 충돌 가능성이 있습니다. 실행 및 재현 예시로 프론트엔드 컨테이너는 `http://localhost:3100`, 백엔드 API 컨테이너는 `http://localhost:3101` 등 3100번대 포트를 명시적으로 할당하여 락 스크립트 대기 현상이나 실행 오류를 방지해야 합니다.

---

# TODO

- [ ] `api/app/services/system_alerts.py`의 `_sanitize_string` 함수에 정규표현식 실행 전 문자열 길이를 10,000자로 선제적 제한(Truncate)하는 방어 로직 추가.
- [ ] `web/src/components/SystemAlertWidget.tsx` 컨테이너 및 연관 CSS에 `word-break: break-all` 및 `overflow-wrap: break-word` 속성 적용.
- [ ] `api/scripts/migrations/20260305_add_system_alert_created_at_desc_index.sql` 스크립트 적용 및 `api/app/api/logs.py` 페이징 로직을 Cursor 기반(복합 인덱스 활용)으로 전환.
- [ ] 프론트엔드 대시보드 위젯에 시스템 알림 일괄 초기화(Clear All) UI 버튼 추가 및 백엔드 숨김/삭제 API 연동.
- [ ] 클라이언트 사이드에 로드된 시스템 알림 데이터를 즉시 JSON 파일로 다운로드할 수 있는 내보내기(Export Logs) 유틸리티 버튼 구현.
- [ ] `api/tests/test_workflow_engine.py`에 무한 루프 예방용 예산(Budget) 한계 경계값 테스트 케이스 작성.
- [ ] `web/tests/e2e/system-alert.spec.ts`에 모바일 해상도(320px) 기준 장문 텍스트 인입 시 레이아웃 붕괴 여부를 확인하는 프로그래매틱 검증 로직 추가.
- [ ] `web/scripts/test-port-timeout.sh` 내 다중 백그라운드 프로세스 실행에 따른 락 경합 시나리오(포트 3100 할당 기준) 및 트랩 해제 테스트 코드 보강.
