```markdown
## Summary

DevFlow Agent Hub의 프론트엔드 안정화를 완료하였습니다. 이번 PR은 이슈 #65(오픈소스 AI Development Platform 제작)의 일환으로, REVIEW.md에서 식별된 핵심 버그를 수정하고 워크플로우 빌더의 상호작용성을 개선합니다.

주요 내용은 다음과 같습니다.
- Vite 서버의 3100번 포트 고정(`strictPort: true`) 및 사전 검사 스크립트 추가
- Toast 알림 ID 충돌 방지 및 중복 렌더링 차단 로직 강화
- ReactFlow 캔버스 오버레이와 Toast 간 Z-index 계층 분리
- WorkflowBuilder 패널 클릭 선택 해제 처리 추가

**Docker Preview 정보**
- 컨테이너: `agent-hub-web-preview`
- 포트: `7000` (외부) → `3100` (컨테이너 내부)
- URL: `http://ssh.manbalboy.com:7000`

---

## What Changed

### [P0] 로컬 환경 포트 고정 (`web/vite.config.ts`)
- `server.strictPort: true` 설정 추가 — 3100번 포트 점유 시 임의 우회 없이 런타임 에러로 즉시 종료

### [P0] 포트 사전 검사 스크립트 추가 (`web/scripts/check-port.js`)
- `npm run dev` 실행 전단에 3100번 포트 점유 여부를 검사
- 포트 충돌 시 한국어 안내 메시지 출력 후 조기 종료하여 개발자 경험(DX) 개선

### [P1] Toast ID 충돌 방지 (`web/src/utils/toastId.ts`)
- 단순 시간/난수 조합에서 글로벌 순차 증가 ID(Increment ID)로 교체
- 다수의 Toast가 동시에 등록되어도 식별자 충돌 없이 독립적으로 소멸

### [P1] Fallback 노드 중복 알림 차단 (`web/src/components/WorkflowBuilder.tsx`)
- `useRef` 기반 Flag를 상위 상태 큐에 추가
- React Strict Mode의 이중 렌더링 환경에서도 Fallback 경고 Toast가 정확히 1회만 노출되도록 보장
- 패널 빈 영역 클릭 시 선택 노드 해제 처리 추가

### [P1] Z-index 계층 분리 (`web/src/styles/layers.ts`)
- ReactFlow `MiniMap`, `Controls` 등 캔버스 오버레이에 `LAYER_Z_INDEX.canvasOverlay` 토큰 적용
- Toast 알림이 캔버스 위젯에 가려지지 않도록 계층 순서 보장

### [P2] 웹훅 IP 추출 로직 버그 수정 (`api/app/webhook.py`)
- 신뢰 프록시 우선순위 버그 수정 — `X-Forwarded-For` 처리 순서 개선
- `workflow_id` 파싱 로직 안정화

---

## Test Results

| 항목 | 결과 | 비고 |
|---|---|---|
| Vite 3100 포트 고정 (strictPort) | ✅ 통과 | 포트 점유 시 에러 즉시 출력 후 종료 |
| 포트 사전 검사 스크립트 | ✅ 통과 | 한국어 안내 메시지 정상 출력 |
| Toast ID 고유성 단위 테스트 | ✅ 통과 | 동시 다수 Toast 등록 시 충돌 없음 확인 |
| Fallback Toast 중복 렌더링 차단 | ✅ 통과 | React Strict Mode 환경에서 1회 노출 검증 |
| Z-index 계층 충돌 수동 시각 테스트 | ✅ 통과 | Toast가 캔버스 오버레이 위에 정상 노출됨 |
| WorkflowBuilder 패널 선택 해제 | ✅ 통과 | 빈 영역 클릭 시 선택 노드 정상 해제 |
| CORS 및 Origin 허용 정책 | ⚠️ 검증 필요 | 백엔드 설정 점검은 후속 태스크로 분리 |

---

## Risks / Follow-ups

### 잠재 리스크
- **Toast 중복 차단 Flag 생명주기 오작동**: Flag 기반 차단 로직이 비정상 언마운트 상황에서 이후 정상 알림까지 차단하는 부작용 가능성 — 추가 생명주기 테스트 권장
- **Z-index 전역 조정의 파급 효과**: 기존 드롭다운, 모달 등 팝업 컴포넌트의 계층 구조에 영향을 미칠 수 있으므로 전체 팝업 시나리오 회귀 테스트 필요
- **다중 노드 환경 렌더링 병목**: SDLC Level 3 이상의 복잡한 워크플로우 그래프 진입 시 캔버스 드래그/줌 성능 저하(Jank) 가능성 — 가상화 또는 노드 수 제한 정책 검토 필요
- **Toast 닫기 경합 조건(Race Condition)**: 수동 닫기 클릭과 자동 소멸 타이머가 동시에 만료될 경우 런타임 에러 위험 존재

### 후속 작업
- [ ] CORS 및 Origin 화이트리스트 설정을 SPEC 요구사항에 맞게 백엔드 전반 적용 및 검증
- [ ] XSS 대비를 위한 노드 타이틀/설명 입력값 이스케이프 처리 강화
- [ ] Toast 인터페이스에 액션 버튼(Action Callback)을 추가하여 에러 노드 포커싱 UX 연결 (PLAN 기능 1)
- [ ] E2E 테스트(Playwright) 시나리오 확충 — Z-index 계층, 포트 바인딩, Toast 경합 조건
- [ ] `Toast.test.tsx` 고도화 — ID 무결성 및 타이머 자동 닫기 경합 방어 케이스 추가
- [ ] Workflow Engine 고도화 — `node_runs` 저장 스키마 및 `workflow_id` 기반 executor registry 설계 (P2)

---

Closes #65
```
