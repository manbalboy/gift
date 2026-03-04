당신은 PLAN.md의 최종 markdown 본문을 생성합니다.

입력 참고 자료:
- /home/docker/agentHub/workspaces/new-mind/manbalboy__agent-hub/SPEC.md
- /home/docker/agentHub/workspaces/new-mind/manbalboy__agent-hub/REVIEW.md (파일이 존재하고 비어있지 않으면 반드시 반영)

출력 대상 경로(참고용):
- /home/docker/agentHub/workspaces/new-mind/manbalboy__agent-hub/PLAN.md

필수 섹션:
1. Task breakdown with priority
2. MVP scope / out-of-scope
3. Completion criteria
4. Risks and test strategy
5. Design intent and style direction

Design intent and style direction 섹션 필수 항목:
- 기획 의도: 이 기능이 사용자에게 전달해야 하는 핵심 경험/메시지
- 디자인 풍: 예) 미니멀, 모던, 대시보드형, 카드형 등 구체 스타일
- 시각 원칙: 컬러/패딩/마진/타이포의 방향성
- 반응형 원칙: 모바일 우선 규칙

Technology ruleset 섹션 필수 항목:
- 플랫폼 분류: app / web / api 중 해당 항목 명시
- app 이면 React Native 기반으로 계획
- web 이면 React 또는 Nuxt 기반 라이브러리/프레임워크로 계획
- api 가 필요하면 FastAPI 기반으로 계획

작성 규칙:
- 반드시 한국어로 작성.
- 문서명과 고유 명칭(예: PLAN, MVP, TODO)은 영문 유지.
- 본문 설명은 한국어로 작성.
- 계획 작성 전에 저장소의 관련 코드/문서/테스트를 직접 검색해 현재 상태를 파악.
- 변경 파일 후보와 영향 범위를 근거 기반으로 명시.
- REVIEW.md가 있으면 TODO를 고도화 플랜에 반영.
- 실행 가이드에 포트가 필요하면 3000번대 포트만 사용.
- markdown 본문만 출력하고, 작업 과정 설명은 금지.
- 도구/터미널/파일 조작 과정 언급 금지.
- 코딩 에이전트가 바로 실행 가능한 실무형 계획으로 작성.

고도화 플랜 단계 규칙(REVIEW 반영 시에만 적용):
- REVIEW.md TODO를 우선 반영하고, 현재 구현과 자연스럽게 연결되는 인접 기능만 추가 가능합니다.
- 톤앤매너(디자인 의도/문체/상호작용 스타일)와 일관성을 반드시 유지하세요.
- 동떨어진 신규 기능, 도메인 이탈 기능, 과도한 범위 확장은 금지합니다.
- 추가 기능은 최대 1~2개로 제한하고, 각 항목에 근거(왜 필요한지)와 구현 경계를 명시하세요.
