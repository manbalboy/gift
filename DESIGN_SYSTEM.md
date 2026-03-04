# DESIGN_SYSTEM

## 1. Information hierarchy (가독성 중심 레이아웃)
- 기본 구조: `Top App Bar` + `Left Navigation` + `Main Workspace` + `Right Context Panel`
- 우선순위 레벨:
  1. `Run status`/알림/에러 배지 (즉시 판단)
  2. `Workflow Canvas` 또는 `Run Timeline` (핵심 작업)
  3. `Node detail`, `logs`, `artifacts` (상세 확인)
  4. 보조 메타데이터 (`created_at`, `owner`, `retry_count`)
- 스캔 원칙:
  - 한 화면에서 “현재 상태, 다음 액션, 장애 지점”이 동시에 보이도록 구성
  - 카드/패널 제목은 1줄, 본문은 2~4줄 단위로 분절
  - 긴 로그는 접기(`collapse`) 기본값

## 2. Color system (배경/텍스트/상태 색상 token)
### Foundation tokens
- `color.bg.base: #0B1020`
- `color.bg.surface: #121A2B`
- `color.bg.elevated: #1A2438`
- `color.border.default: #27324A`
- `color.text.primary: #E6EDF7`
- `color.text.secondary: #A9B4C8`
- `color.text.muted: #7E8AA3`

### Semantic status tokens
- `color.status.success: #22C55E`
- `color.status.running: #3B82F6`
- `color.status.waiting: #F59E0B`
- `color.status.failed: #EF4444`
- `color.status.review_needed: #A78BFA`

### Usage rules
- 배경 대비: `bg.base` 대비 텍스트 명도 대비 4.5:1 이상
- 상태 표현은 “색상 + 아이콘 + 텍스트” 동시 사용
- 위험/실패는 `failed` 단색 강조, 그라데이션 금지

## 3. Spacing scale (padding/margin 기준)
- `space-2: 2px`
- `space-4: 4px`
- `space-8: 8px`
- `space-12: 12px`
- `space-16: 16px`
- `space-24: 24px`
- `space-32: 32px`
- `space-40: 40px`

### Layout rules
- 섹션 간 기본 간격: `24px`
- 카드 내부 패딩: `16px`
- dense 모드(캔버스/테이블): `8px` 단위
- 모바일 좌우 안전 여백: `16px`

## 4. Typography scale (폰트 크기/굵기/행간)
### Font families
- `font.sans: "Pretendard", "Noto Sans KR", sans-serif`
- `font.mono: "JetBrains Mono", "D2Coding", monospace`

### Type tokens
- `type.display: 28/36, 700`
- `type.h1: 24/32, 700`
- `type.h2: 20/28, 600`
- `type.h3: 18/26, 600`
- `type.body-md: 14/22, 400`
- `type.body-sm: 13/20, 400`
- `type.caption: 12/18, 500`
- `type.code: 13/20, 500 (font.mono)`

### Rules
- 로그/변수/코드/노드 ID는 `font.mono`
- 상태 텍스트는 최소 `13px` 유지
- 한글 UI는 자간 0~-1% 범위 유지

## 5. Responsive rules (모바일 웹 우선 규칙)
- Breakpoints:
  - `sm: 0~767`
  - `md: 768~1199`
  - `lg: 1200+`
- Mobile-first 기본:
  - `Left Navigation`은 drawer
  - `Right Context Panel`은 bottom sheet
  - 테이블은 카드 스택으로 폴백
- Canvas 최적화:
  - `md` 이상에서 split view 허용
  - `sm` 세로 모드에서는 편집보다 모니터링 우선
  - `sm` 가로 모드에서만 mini-map + edge 편집 활성화

## 6. Component guidance (카드/버튼/폼/테이블 최소 규칙)
### Card
- 기본 배경 `bg.surface`, 테두리 `border.default`, radius `12px`
- 제목/상태/액션 3구역 고정
- 클릭 가능 카드 hover 시 `bg.elevated`로 1단계 상승

### Button
- 높이: `36px`(기본), `44px`(모바일 주요 CTA)
- `Primary`: running 계열 강조색
- `Danger`: failed 계열
- 로딩 시 텍스트 유지 + spinner 좌측 배치

### Form
- 라벨은 상단 고정, placeholder는 설명 대체 금지
- 입력 필드 높이 `40px`, helper/error line `12~13px`
- Validation은 blur + submit 시점 병행

### Table
- 헤더 고정(sticky), 행 높이 `40px`
- 상태 컬럼은 badge 통일
- 열 6개 초과 시 horizontal scroll 허용, 핵심 열 우선 노출

## 7. Plan alignment (기획 의도/디자인 풍 정합성)
- 이 디자인 시스템은 “복잡한 AI SDLC를 한눈에 이해/제어”라는 기획 의도를 위해 `상태 가시성`을 최상위 계층으로 둔다.
- 다크 테마 + 미니멀 밀도 레이아웃으로 개발자 친화적 운영 화면을 제공한다.
- 상태 시맨틱 색상(성공/진행/대기/실패)을 표준 token으로 고정해 워크플로우와 대시보드 간 해석 일관성을 유지한다.
- `sans + mono` 이중 타이포 체계로 일반 정보와 실행 로그의 인지 컨텍스트를 분리한다.
- 모바일 우선 규칙을 적용하되, 핵심 편집 경험은 태블릿/데스크톱 가로 폭에 최적화해 PLAN의 반응형 원칙을 충족한다.

## 8. WOW Point
### `Live Run Constellation`
- 정의: `Dashboard` 상단에 현재 `workflow_run`의 각 `node`를 점(orbit)으로 표시하고, `queued → running → done/failed` 상태에 따라 실시간으로 연결선이 점등되는 인터랙티브 미니 맵.
- 구현 방식: Canvas/SVG 기반 2D 렌더 + 상태 이벤트 polling/SSE 반영.
- 유도 감정: “복잡한 파이프라인이 통제 가능한 시스템으로 보인다”는 즉시 신뢰감과 몰입감.
- 성공 기준:
  - 사용자가 3초 내 현재 병목 노드를 식별
  - run 상세 페이지 진입 전 이탈률 감소
  - 장애 발생 시 첫 대응 액션 클릭 시간 단축
