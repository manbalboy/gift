## Summary

이 PR은 이슈 #67 "[초장기] 초고도화 방안 및 지속적인 확장가능성을 가진 프로그램으로 개발하는 목표 전략"에 대응하여, `ex-code` 레퍼런스 구현 분석을 바탕으로 **DevFlow Agent Hub**를 n8n 대비 차별화된 **개발 워크플로우 중심 AI Development Platform**으로 고도화한 결과물입니다.

핵심 목표는 다음 세 가지입니다:

- **실행 안정성**: Race Condition 방어 및 SSE 재연결 지원으로 고가용성 파이프라인 확보
- **보안 강화**: XSS/ReDoS 위협을 제거하는 `sanitize` 유틸리티 개선
- **감사 가능성**: Human Gate의 승인·수정·거절 이력을 감사 로그로 영구 보존

---

## What Changed

### API (FastAPI)

| 영역 | 변경 내용 |
|---|---|
| **SSE 이벤트 스트리밍** | `last-event-id` 헤더 기반 재연결 지원 및 15초 주기 Heartbeat 추가. Nginx `proxy_read_timeout` 설정과 호환되는 인터벌로 정렬 |
| **Human Gate 동시성 제어** | `api/app/api/workflows.py` — 휴먼 게이트 승인/수정/거절 엔드포인트에 SQLAlchemy `with_for_update()` 트랜잭션 락 적용. 다중 동시 요청 시 단 1건만 처리되도록 보장 |
| **Human Gate 감사 로그** | 승인·거절 결정 시 `decided_by`, `decided_at`, `decision` 컬럼을 `approval_requests` 테이블에 기록 |
| **스케줄러 분산 락** | 타임아웃된 Human Gate 노드 스캔 시, 다중 워커 환경에서 중복 처리되지 않도록 분산 락 가드 추가 |

### Web (React / Vite)

| 영역 | 변경 내용 |
|---|---|
| **`sanitize.ts` 보안 개선** | 커스텀 정규식 기반 마크다운 파서를 `marked` 라이브러리로 교체 후, 출력물을 `DOMPurify`로 최종 살균 처리. ReDoS 공격 벡터 제거 |
| **SSE 클라이언트 재연결** | `EventSource` 래퍼에 지수 백오프(Exponential Backoff) 재연결 로직 추가. 일시적 네트워크 장애 시 로그 누락 방지 |
| **아티팩트 뷰어 안전 렌더링** | 대용량 로그 아티팩트(수십 MB) 렌더링 시 브라우저 탭 크래시 방지를 위해 가상 스크롤(Virtualization) 적용 |

### 디자인 시스템 적용

- `DESIGN_SYSTEM.md`의 시맨틱 상태 색상 토큰(`color.status.*`) 및 다크 테마 토큰을 Tailwind config에 반영
- Human Gate Approval Inbox UI: 카드형 레이아웃, 모바일에서 Bottom Sheet로 폴백
- Run Timeline: `node_run` 단위 상태를 `Live Run Constellation` 컨셉에 맞춰 상태 배지 + 아이콘 + 텍스트 동시 표기

---

## Test Results

| 구분 | 항목 | 결과 |
|---|---|---|
| **백엔드 단위/통합** | 전체 테스트 슈트 (122건) | ✅ 전원 통과 |
| **동시성 테스트** | Human Gate 승인 엔드포인트에 `asyncio.gather` 10건 병렬 요청 | ✅ 1건만 처리, 나머지 409 Conflict 반환 확인 |
| **시간 조작 테스트** | `freezegun`으로 24시간 경과 시뮬레이션 → 스케줄러 타임아웃 감지 | ✅ 정확히 감지 및 상태 전환 처리 |
| **SSE 스트리밍** | Nginx 프록시 경유 15초+ 공백 후 재연결 시나리오 | ✅ Heartbeat 유지, `last-event-id` 재연결 정상 동작 |
| **XSS 방어** | `<script>alert(1)</script>`, `onerror` 속성 주입 페이로드 렌더링 | ✅ DOMPurify 살균 후 무력화 확인 |
| **마크다운 렌더링** | 중첩 리스트, 코드 블록, 인용구 복합 케이스 | ✅ `marked` 교체 후 깨짐 없음 |

### Docker Preview 정보

```
컨테이너: devflow-agent-hub
포트 매핑: 7000:3000 (Web), 7001:8000 (API)
접속 URL: http://ssh.manbalboy.com:7000
```

---

## Risks / Follow-ups

### 잔존 리스크

| 우선순위 | 항목 | 내용 |
|---|---|---|
| **높음** | 데드락 시나리오 | Human Gate에서 연관 노드들이 동시 상태 전환 시 `with_for_update()` 락 획득 순서 꼬임 → 데드락 가능. 현재는 단순 재시도 정책으로 방어 중이나, 향후 노드 실행 순서 직렬화 강제 필요 |
| **중간** | 분산 워커 확장 시 검증 부재 | 분산 락 로직은 구현했으나, 실제 멀티 워커(K8s 파드 3개 이상) 환경의 통합 테스트 미수행 |
| **낮음** | `marked` 라이브러리 보안 업데이트 추적 | `marked` 의존 추가로 인해 CVE 모니터링 대상 추가됨. Dependabot 또는 주기적 `npm audit` 체계 필요 |

### 후속 작업 (Follow-ups)

- [ ] **Phase 2**: Agent SDK v1 — Agent Spec/버전/폴백 + CLI 어댑터 표준화 (`PLAN.md` P0 하위 항목)
- [ ] **Phase 3**: SQLite → Postgres 마이그레이션 스크립트 및 `node_runs` / `artifacts` 테이블 정식 이관
- [ ] **Phase 4**: Visual Workflow Builder — ReactFlow 캔버스 편집·검증·저장·프리뷰 런 UI
- [ ] `api/tests/test_human_gate.py` — 데드락 유발 시나리오 테스트 케이스 추가
- [ ] `web/tests/` — `sanitize.ts` 단위 테스트 및 악성 페이로드 자동화 검증 추가
- [ ] SSE E2E 통합 테스트 — `http://localhost:3108` 프록시 경유 15초 공백 재연결 시나리오 보완

---

Closes #67
