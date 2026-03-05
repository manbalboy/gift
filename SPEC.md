# SPEC

        - Repository: manbalboy/agent-hub
        - Issue: #71
        - URL: https://github.com/manbalboy/agent-hub/issues/71
        - Title: [초장기]  루프엔진 설계해서 초안을 준비하시오

        ## 원본 요청

        급격한변화 없이 아래의 내용을 수용할 수있는 플랜을 세우고 구현하시오

# Self-Improvement Loop Engine 설계

## 1. 개요

Self-Improvement Loop는 **AI가 프로그램을 생성하고, 스스로 평가하고, 다시 개선하는 반복 구조**이다.  
이 구조는 단순한 코드 생성 AI가 아니라 **지속적으로 발전하는 Autonomous Developer**를 만들기 위한 핵심 엔진이다.

목표는 다음과 같다.

- 사람이 **아이디어만 입력**
- 시스템이 **코드 생성 → 테스트 → 평가 → 개선**
- 이 과정이 **24시간 반복**
- 실행 중 **새로운 지시사항 반영 가능**

---

# 2. 기본 개념

일반적인 AI 시스템은 다음과 같이 동작한다.

Prompt → Code Output

하지만 Self-Improvement Loop 시스템은 다음과 같이 동작한다.

Idea
↓
Plan
↓
Code
↓
Test
↓
Evaluate
↓
Improve
↓
Repeat

이 구조는 **개발 프로세스를 자동화한 반복 시스템**이다.

---

# 3. 전체 루프 구조

실제 시스템에서 사용되는 루프 구조는 다음과 같다.

Idea
↓
Architecture Design
↓
Task Breakdown
↓
Implementation
↓
Unit Test
↓
Integration Test
↓
Runtime Test
↓
Code Review
↓
Quality Score
↓
Improvement Plan
↓
Refactor / Feature
↓
Repeat

이 루프는 **프로젝트가 종료될 때까지 계속 반복된다.**

---

# 4. Self-Improvement Loop 핵심 컴포넌트

Self-Improvement Loop는 최소 **4개의 핵심 엔진**으로 구성된다.

---

## 4.1 Analyzer Engine

프로젝트 상태를 분석하는 엔진이다.

분석 대상

- 코드 구조
- 프로젝트 아키텍처
- 의존성
- 테스트 상태
- 코드 복잡도
- 성능

예시

Code Complexity = 7.3
Test Coverage = 42%
Security Issues = 2

---

## 4.2 Evaluator Engine

Analyzer 결과를 기반으로 **품질 점수(Quality Score)**를 계산한다.

예시 평가 기준

Code Quality
Architecture Quality
Test Coverage
Performance
Security
Maintainability

결과

Quality Score = 68 / 100

이 점수는 **개선 여부 판단 기준**이 된다.

---

## 4.3 Improvement Planner

Evaluator 결과를 기반으로 **개선 계획을 생성한다.**

예시

	1.	Increase test coverage
	2.	Refactor auth module
	3.	Add error handling
	4.	Improve API structure

Planner는 다음 작업을 생성한다.

Task List
Backlog
Refactor Plan
Feature Plan

---

## 4.4 Executor Engine

Planner가 만든 작업을 실제로 실행한다.

실행 작업

code modification
test generation
refactoring
documentation update
pull request creation

Executor는 결과를 다시 Analyzer로 전달한다.

---

# 5. Self-Improvement Loop 흐름

전체 시스템 흐름

Idea
↓
Planner
↓
Dev Agent
↓
Test Agent
↓
Analyzer
↓
Evaluator
↓
Improvement Planner
↓
Executor
↓
Repeat

이 과정이 **자동 반복된다.**

---

# 6. Memory 시스템

Self-Improvement Loop는 **장기 기억 시스템**이 필요하다.

Memory에 저장되는 데이터

project architecture
design decisions
bug history
improvement history
test results
performance metrics

Memory를 통해 AI는 **이전 개선 결과를 학습**할 수 있다.

---

# 7. Long-Running Loop 지원

이 시스템은 **장기 실행(Long-Running Workflow)**을 지원해야 한다.

특징

- 며칠 또는 몇 주 동안 실행
- 실행 중 새로운 아이디어 반영
- 중간 종료 가능
- 중간 재개 가능

Control 명령

Start
Pause
Resume
Stop
Inject Instruction

---

# 8. Loop Stability

Self-Improvement Loop에서 가장 중요한 문제는 **루프 안정성**이다.

AI는 다음과 같은 문제를 발생시킬 수 있다.

무한 반복
같은 수정 반복
불필요한 리팩토링
코드 퇴화

이를 방지하기 위해 다음 제어가 필요하다.

---

## Loop Control

max_loop_count
budget_limit
duplicate_change_detection
quality_threshold

예시

max improvement loops = 50
minimum improvement delta = 3%

---

# 9. Autonomous Developer 구조

Self-Improvement Loop는 다음 구조에서 동작한다.

Controller Agent
│
├── Planner Agent
│
├── Developer Agent
│
├── Test Agent
│
├── Review Agent
│
└── Improvement Agent

각 Agent는 특정 역할을 담당한다.

---

# 10. 최종 목표

Self-Improvement Loop의 목표는 다음 시스템을 만드는 것이다.

Idea
↓
Build
↓
Test
↓
Improve
↓
Refactor
↓
New Feature
↓
Repeat Forever

즉

**24시간 지속적으로 프로그램을 발전시키는 Autonomous Developer 시스템**이다.

---

# 11. 핵심 특징 요약

Self-Improvement Loop 시스템의 특징

- 사람이 아이디어만 입력
- AI가 개발 프로세스를 자동 수행
- 코드 품질 자동 평가
- 지속적인 리팩토링
- 기능 자동 확장
- 장기 실행 지원
- 최소한의 인간 개입

---

# 12. 결론

Self-Improvement Loop는 단순한 AI Agent 시스템이 아니라

Autonomous Software Engineer

를 만들기 위한 핵심 구조이다.

이 구조가 제대로 구현되면

Idea → Software

를 **완전히 자동화할 수 있다.

        ## Rule Of Engagement

        - 오케스트레이터가 단계 순서와 재시도 정책을 결정합니다.
        - AI 도구는 컨트롤러가 아니라 작업자(worker)입니다.
        - 변경 범위는 MVP에 맞게 최소화합니다.
        - 구현 단계에서 로컬 실행 포트가 필요하면 충돌 방지를 고려합니다.

        ## Deployment & Preview Requirements

        - 1회 실행 사이클의 결과물은 Docker 실행 가능 상태를 목표로 구현합니다.
        - Preview 외부 노출 포트는 7000-7099 범위를 사용합니다.
        - Preview 외부 기준 도메인/호스트: http://ssh.manbalboy.com:7000
        - CORS 허용 대상은 manbalboy.com 계열 또는 localhost 계열로 제한합니다.
        - 허용 origin 정책(기준값): https://manbalboy.com,http://manbalboy.com,https://localhost,http://localhost,https://127.0.0.1,http://127.0.0.1
        - PR 본문에는 Docker Preview 정보(컨테이너/포트/URL)를 포함합니다.
