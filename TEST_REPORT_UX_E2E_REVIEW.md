# TEST REPORT

- Stage: `ux_e2e_review`
- Tester: `gemini`
- Status: `FAIL`
- Exit code: `1`
- Duration: `30.90s`
- Command: `/home/docker/agentHub/workspaces/main/scripts/run_agenthub_tests.sh e2e`

## 통과한 항목
- 통과된 테스트 수를 감지했습니다: 138

## 통과하지 못한 항목
- 테스트 명령이 종료코드 1로 실패했습니다.
- 실패한 테스트 수를 감지했습니다: 1

## 요약 카운트
- passed: `138`
- failed: `1`
- skipped: `0`
- errors: `0`

## stdout (tail)
```text
[agenthub-test] running pytest
........................................................................ [ 51%]
..................................F................................      [100%]
=================================== FAILURES ===================================
____________________ test_resume_run_rejects_non_paused_run ____________________

    def test_resume_run_rejects_non_paused_run():
        created = client.post("/api/workflows", json=PAYLOAD)
        assert created.status_code == 200
        workflow_id = created.json()["id"]
        run = client.post(f"/api/workflows/{workflow_id}/runs")
        assert run.status_code == 200
        run_id = run.json()["id"]
    
        resumed = client.post(f"/api/runs/{run_id}/resume")
        assert resumed.status_code == 409
>       assert resumed.json()["detail"] == "run is not paused"
E       AssertionError: assert 'run lock is busy' == 'run is not paused'
E         
E         - run is not paused
E         + run lock is busy

api/tests/test_workflow_api.py:1176: AssertionError
=========================== short test summary info ============================
FAILED api/tests/test_workflow_api.py::test_resume_run_rejects_non_paused_run
1 failed, 138 passed in 28.49s
```

## stderr (tail)
```text
(empty)
```
