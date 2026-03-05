# TEST REPORT

- Stage: `test_after_fix`
- Tester: `gemini`
- Status: `FAIL`
- Exit code: `1`
- Duration: `41.07s`
- Command: `/home/docker/agentHub/workspaces/main/scripts/run_agenthub_tests.sh e2e`

## 통과한 항목
- 통과된 테스트 수를 감지했습니다: 153

## 통과하지 못한 항목
- 테스트 명령이 종료코드 1로 실패했습니다.
- 실패한 테스트 수를 감지했습니다: 1

## 요약 카운트
- passed: `153`
- failed: `1`
- skipped: `0`
- errors: `0`

## stdout (tail)
```text
[agenthub-test] running pytest
........................................................................ [ 46%]
.........................................F.............................. [ 93%]
..........                                                               [100%]
=================================== FAILURES ===================================
_____________________ test_resume_run_restarts_paused_flow _____________________

monkeypatch = <_pytest.monkeypatch.MonkeyPatch object at 0x7f9f7cc757b0>

    def test_resume_run_restarts_paused_flow(monkeypatch):
        monkeypatch.setattr(workflows_api.settings, "workflow_node_timeout_seconds", 1.0)
        monkeypatch.setattr(workflows_api.settings, "workflow_worker_poll_interval_seconds", 0.02)
    
        payload = {
            "name": "Resume Timeout Flow",
            "description": "",
            "graph": {
                "nodes": [{"id": "slow-task", "type": "task", "label": "Slow Task"}],
                "edges": [],
            },
        }
        created = client.post("/api/workflows", json=payload)
        assert created.status_code == 200
        workflow_id = created.json()["id"]
    
        class SlowOnceRunner:
            def __init__(self) -> None:
                self.calls = 0
    
            def run(self, _request):
                self.calls += 1
                if self.calls == 1:
                    time.sleep(3.0)
                return AgentTaskResult(ok=True, log="completed", output={"exit_code": 0})
    
        original_runner = workflows_api.engine.agent_runner
        monkeypatch.setattr(workflows_api.engine, "agent_runner", SlowOnceRunner())
        try:
            run = client.post(f"/api/workflows/{workflow_id}/runs")
            assert run.status_code == 200
            run_id = run.json()["id"]
    
            paused = None
            for _ in range(80):
                current = client.get(f"/api/runs/{run_id}")
                assert current.status_code == 200
                body = current.json()
                if body["status"] == "paused":
                    paused = body
                    break
                time.sleep(0.05)
>           assert paused is not None
E           assert None is not None

api/tests/test_workflow_api.py:1146: AssertionError
=========================== short test summary info ============================
FAILED api/tests/test_workflow_api.py::test_resume_run_restarts_paused_flow
1 failed, 153 passed in 38.60s
```

## stderr (tail)
```text
(empty)
```
