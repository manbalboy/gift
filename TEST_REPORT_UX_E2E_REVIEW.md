# TEST REPORT

- Stage: `ux_e2e_review`
- Tester: `gemini`
- Status: `FAIL`
- Exit code: `1`
- Duration: `54.85s`
- Command: `/home/docker/agentHub/workspaces/main/scripts/run_agenthub_tests.sh e2e`

## 통과한 항목
- 통과된 테스트 수를 감지했습니다: 201

## 통과하지 못한 항목
- 테스트 명령이 종료코드 1로 실패했습니다.
- 실패한 테스트 수를 감지했습니다: 1

## 요약 카운트
- passed: `201`
- failed: `1`
- skipped: `0`
- errors: `0`

## stdout (tail)
```text
[agenthub-test] running pytest
........................................................................ [ 35%]
........................................................................ [ 71%]
...............................................F..........               [100%]
=================================== FAILURES ===================================
__________ test_resume_api_propagates_fail_fast_lock_error_to_client ___________

    def test_resume_api_propagates_fail_fast_lock_error_to_client():
        workflow = client.post("/api/workflows", json=PAYLOAD).json()
        run = client.post(f"/api/workflows/{workflow['id']}/runs")
        assert run.status_code == 200
        run_id = run.json()["id"]
    
        db = SessionLocal()
        try:
            target_run = db.query(WorkflowRun).filter(WorkflowRun.id == run_id).first()
            assert target_run is not None
            target_run.status = "paused"
            db.commit()
        finally:
            db.close()
    
        class BusyRunLock:
            def acquire(self, blocking=False, timeout=None):
                return False
    
            def release(self):
                return None
    
            def extend(self, ttl_seconds=None):
                return False
    
        class BusyLockProvider:
            def get_run_lock(self, _run_id):
                return BusyRunLock()
    
        original_provider = workflow_engine.lock_provider
        workflow_engine.lock_provider = BusyLockProvider()
        try:
            response = client.post(f"/api/runs/{run_id}/resume")
        finally:
            workflow_engine.lock_provider = original_provider
    
        assert response.status_code == 409
        assert response.json()["detail"] == "run lock is busy"
    
        latest = client.get(f"/api/runs/{run_id}")
        assert latest.status_code == 200
>       assert latest.json()["status"] == "paused"
E       AssertionError: assert 'queued' == 'paused'
E         
E         - paused
E         + queued

api/tests/test_workflow_engine.py:1047: AssertionError
=========================== short test summary info ============================
FAILED api/tests/test_workflow_engine.py::test_resume_api_propagates_fail_fast_lock_error_to_client
1 failed, 201 passed in 51.99s
```

## stderr (tail)
```text
(empty)
```
