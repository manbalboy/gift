# TEST REPORT

- Stage: `test_after_fix`
- Tester: `gemini`
- Status: `FAIL`
- Exit code: `1`
- Duration: `27.69s`
- Command: `/home/docker/agentHub/workspaces/main/scripts/run_agenthub_tests.sh e2e`

## 통과한 항목
- 통과된 테스트 수를 감지했습니다: 128

## 통과하지 못한 항목
- 테스트 명령이 종료코드 1로 실패했습니다.
- 실패한 테스트 수를 감지했습니다: 1

## 요약 카운트
- passed: `128`
- failed: `1`
- skipped: `0`
- errors: `0`

## stdout (tail)
```text
[agenthub-test] running pytest
........................................................................ [ 55%]
...................................F.....................                [100%]
=================================== FAILURES ===================================
____ test_engine_runs_independent_nodes_without_forced_sequential_fallback _____

monkeypatch = <_pytest.monkeypatch.MonkeyPatch object at 0x7f08c1e0d1e0>

    def test_engine_runs_independent_nodes_without_forced_sequential_fallback(monkeypatch):
        payload = {
            "name": "Independent Nodes",
            "description": "",
            "graph": {
                "nodes": [
                    {"id": "idea", "type": "task", "label": "Idea"},
                    {"id": "plan", "type": "task", "label": "Plan"},
                    {"id": "docs", "type": "task", "label": "Docs"},
                ],
                "edges": [{"id": "e1", "source": "idea", "target": "plan"}],
            },
        }
        workflow = client.post("/api/workflows", json=payload).json()
    
        started: dict[str, float] = {}
        finished: dict[str, float] = {}
        lock = Lock()
    
        class SlowRunner:
            def run(self, request):
                with lock:
                    started[request.node_id] = time.time()
                time.sleep(0.2)
                with lock:
                    finished[request.node_id] = time.time()
                return AgentTaskResult(ok=True, log="ok", output={"exit_code": 0})
    
        original_runner = workflow_engine.agent_runner
        monkeypatch.setattr(workflow_engine, "agent_runner", SlowRunner())
        try:
>           run = client.post(f"/api/workflows/{workflow['id']}/runs")
E           KeyError: 'id'

api/tests/test_workflow_engine.py:173: KeyError
=========================== short test summary info ============================
FAILED api/tests/test_workflow_engine.py::test_engine_runs_independent_nodes_without_forced_sequential_fallback
1 failed, 128 passed in 24.87s
```

## stderr (tail)
```text
(empty)
```
