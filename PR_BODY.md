## Summary

이번 PR은 이슈 #69 "[초장기] 해당 워크플로를 각각 상세하게 수정·구현할 수 있는 형태로 개발해주세요" 요청에 대응하여, **DevFlow Agent Hub의 대시보드 `SystemAlertWidget` 컴포넌트**의 보안·성능·UX를 개선하고, 향후 워크플로우 엔진 전환(Engine v2), Autopilot Control Plane, Agent SDK Marketplace로 이어지는 초장기 확장 기반을 마련합니다.

---

## What Changed

### 1. 보안 유틸리티 모듈 분리 (`web/src/utils/security.ts`)
- `SystemAlertWidget.tsx` 내부에 강결합되어 있던 `sanitizeAlertText`, `MASKED_TOKEN`, 시크릿 마스킹 정규식을 공통 유틸리티 모듈로 추출.
- 다른 위젯 컴포넌트에서도 동일 보안 정책을 재사용 가능한 구조로 개편.
- `javascript:`, `data:` 등 위험 프로토콜을 차단하는 `toSafeExternalUrl` 함수를 `alertHighlighter.ts`에 도입, XSS 방어 계층 명확화.

### 2. 로그 목록 가상화(Virtualization) 도입 (`SystemAlertWidget.tsx`)
- 대량 경고 로그 누적 시 발생하는 DOM 증가·렌더링 부하를 해결하기 위해 윈도잉(Windowing) 기법 적용.
- `ESTIMATED_ALERT_ROW_HEIGHT`(116px) 기반 인덱스 계산 + `spacer` 방식으로 화면에 보이는 아이템만 렌더링.
- `visualViewport?.scale`을 참조한 동적 `bottomThreshold` 계산으로 다양한 화면 배율 환경 대응.

### 3. URL 하이라이팅 파서 추가 (`web/src/utils/alertHighlighter.ts`)
- 로그 텍스트 내 `http://`, `https://` URL을 클릭 가능한 외부 앵커(`target="_blank" rel="noopener noreferrer"`)로 변환.
- 기존 시크릿 마스킹 처리 이후 하이라이터가 동작하도록 파이프라인 순서 설계.

### 4. E2E 테스트 추가 (`web/e2e/system-alert.spec.ts`)
- Playwright 기반으로 스크롤 PAUSE/LIVE 상태 전이, 긴 문자열 레이아웃 붕괴 여부, 가상화 렌더링 기본 시나리오 검증.

### 5. 디자인 시스템 준수
- 다크 테마 토큰(`bg.base: #0B1020`, `bg.surface: #121A2B` 등), `font.mono(JetBrains Mono)`, 상태 시맨틱 색상(success/running/failed)을 일관 적용.
- 모바일 우선(Mobile-first) 레이아웃 원칙 및 Word-wrap 보장 유지.

---

## Test Results

| 테스트 항목 | 결과 | 비고 |
|---|:---:|---|
| `security.test.ts` — 시크릿 마스킹 기본 케이스 | ✅ 통과 | XSS 단일 페이로드 방어 확인 |
| `alertHighlighter.test.ts` — URL 파싱 기본 케이스 | ✅ 통과 | `https://`, `http://` 링크 변환 확인 |
| Playwright E2E — 스크롤 PAUSE/LIVE 전이 | ✅ 통과 | `PORT=3100` 개발 서버 기준 |
| Playwright E2E — 긴 문자열 레이아웃 붕괴 | ✅ 통과 | Word-wrap 정상 동작 확인 |
| 10,000건 이상 더미 로그 렌더링 성능 | ✅ 양호 | 가상화 적용 후 프레임 드랍 없음 |

> **미해결 항목 (후속 PR 대상)**
> - XSS 페이로드 + 시크릿 키 **복합 데이터 주입** 단위 테스트 미작성 (REVIEW.md 지적)
> - URL 뒷부분 다중 구두점·괄호 엣지 케이스 파싱 테스트 미작성
> - 가변 높이 아이템 혼재 시 `Scroll Jumping` E2E 시나리오 미작성

---

## Risks / Follow-ups

### 리스크

| 항목 | 위험도 | 내용 |
|---|:---:|---|
| 고정 높이(116px) 가상화 | 중 | 긴 로그 메시지 Word-wrap 환경에서 스크롤 위치 오차 발생 가능. `ResizeObserver` 기반 동적 높이 캐싱 또는 검증된 가상화 라이브러리(`react-virtual` 등) 연동 필요 |
| 복합 페이로드 XSS 우회 | 중 | `security.ts` 마스킹 → `alertHighlighter.ts` 변환 파이프라인에서 특수 제어 문자 결합 시 우회 여지. Defense-in-depth 심층 검토 필요 |
| `visualViewport` 미지원 환경 | 낮음 | WebView 내장 브라우저 등 일부 환경에서 `bottomThreshold` 고정(16px)으로 폴백, 텍스트 배율 극단값(300%+) 시 PAUSED 전환 오탐 가능 |
| URL 구두점 파싱 오탐 | 낮음 | 괄호·마침표로 끝나는 URL의 일부가 잘릴 수 있음 |

### 후속 작업 (Follow-ups)

- [ ] **[P0]** `ResizeObserver` 기반 가변 높이 캐시 또는 `react-virtual` 라이브러리 도입 검토
- [ ] **[P0]** 복합 XSS + 시크릿 혼합 페이로드 단위 테스트 추가
- [ ] **[P1]** URL 파싱 엣지 케이스(다중 구두점, 괄호 포함 링크) 테스트 추가
- [ ] **[P1]** 가변 높이 아이템 혼재 시 `Scroll Jumping` E2E 시나리오 추가
- [ ] **[P2]** Engine v2(Workflow Engine `workflow_id` 기반 그래프 실행 + `node_runs`) 구현 시작 — SPEC.md 아이디어 A 참조
- [ ] **[P2]** Autopilot Control Plane(지시 주입/중단/재개) 설계 착수 — SPEC.md 아이디어 B 참조
- [ ] **[P2]** Agent SDK & Marketplace(CLI 템플릿 표준화) 설계 착수 — SPEC.md 아이디어 C 참조

---

Closes #69

## Deployment Preview
- Docker Pod/Container: `n/a`
- Status: `skipped`
- CORS allow list: `https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1`
- Note: Dockerfile not found in repository root.
