# TEST REPORT

- Stage: `ux_e2e_review`
- Tester: `gemini`
- Status: `FAIL`
- Exit code: `1`
- Duration: `5.77s`
- Command: `/home/docker/agentHub/workspaces/main/scripts/run_agenthub_tests.sh e2e`

## 통과한 항목
- 통과된 테스트 수를 감지했습니다: 13

## 통과하지 못한 항목
- 테스트 명령이 종료코드 1로 실패했습니다.
- 실패한 테스트 수를 감지했습니다: 1

## 요약 카운트
- passed: `13`
- failed: `1`
- skipped: `0`
- errors: `0`

## stdout (tail)
```text
[agenthub-test] running pytest
..........F...                                                           [100%]
=================================== FAILURES ===================================
_________________ test_parallel_polling_triggers_single_worker _________________

monkeypatch = <_pytest.monkeypatch.MonkeyPatch object at 0x7f9390bedfc0>

    def test_parallel_polling_triggers_single_worker(monkeypatch):
        workflow = client.post("/api/workflows", json=PAYLOAD).json()
        run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
        run_id = run["id"]
    
        calls = {"count": 0}
    
        original_runner = workflow_engine.agent_runner
    
        def slow_runner(request):
            calls["count"] += 1
            time.sleep(0.2)
            return original_runner.run(request)
    
        class StubRunner:
            def run(self, request):
                return slow_runner(request)
    
        monkeypatch.setattr(workflow_engine, "agent_runner", StubRunner())
    
        try:
            with ThreadPoolExecutor(max_workers=6) as pool:
                responses = list(pool.map(lambda _: client.get(f"/api/runs/{run_id}"), range(6)))
        finally:
            monkeypatch.setattr(workflow_engine, "agent_runner", original_runner)
    
        assert all(response.status_code == 200 for response in responses)
>       assert calls["count"] == 1
E       assert 3 == 1

api/tests/test_workflow_engine.py:61: AssertionError
=========================== short test summary info ============================
FAILED api/tests/test_workflow_engine.py::test_parallel_polling_triggers_single_worker
1 failed, 13 passed in 4.17s
```

## stderr (tail)
```text
(empty)
```
