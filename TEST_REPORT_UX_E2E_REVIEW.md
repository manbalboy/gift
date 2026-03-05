# TEST REPORT

- Stage: `ux_e2e_review`
- Tester: `gemini`
- Status: `FAIL`
- Exit code: `1`
- Duration: `55.32s`
- Command: `/home/docker/agentHub/workspaces/main/scripts/run_agenthub_tests.sh e2e`

## 통과한 항목
- 통과된 테스트 수를 감지했습니다: 203

## 통과하지 못한 항목
- 테스트 명령이 종료코드 1로 실패했습니다.
- 실패한 테스트 수를 감지했습니다: 1

## 요약 카운트
- passed: `203`
- failed: `1`
- skipped: `0`
- errors: `0`

## stdout (tail)
```text
[agenthub-test] running pytest
........................................................................ [ 35%]
.....................................................................F.. [ 70%]
............................................................             [100%]
=================================== FAILURES ===================================
____________ test_human_gate_approve_after_long_pending_resumes_run ____________

monkeypatch = <_pytest.monkeypatch.MonkeyPatch object at 0x7fbf9f919990>

    def test_human_gate_approve_after_long_pending_resumes_run(monkeypatch):
        monkeypatch.setattr(workflows_api.settings, "human_gate_approver_token", "secret-approver")
        monkeypatch.setattr(workflows_api.settings, "human_gate_approver_roles", "reviewer,admin")
        payload = {
            "name": "Human Gate Resume",
            "description": "",
            "graph": {
                "nodes": [
                    {"id": "idea", "type": "task", "label": "Idea"},
                    {"id": "review", "type": "human_gate", "label": "Review"},
                    {"id": "pr", "type": "task", "label": "PR"},
                ],
                "edges": [
                    {"id": "e1", "source": "idea", "target": "review"},
                    {"id": "e2", "source": "review", "target": "pr"},
                ],
            },
        }
        created = client.post("/api/workflows", json=payload)
        assert created.status_code == 200
        run = client.post(f"/api/workflows/{created.json()['id']}/runs")
        assert run.status_code == 200
        run_id = run.json()["id"]
    
        pending = None
        for _ in range(25):
            response = client.get(f"/api/runs/{run_id}")
            assert response.status_code == 200
            if any(node["status"] == "approval_pending" for node in response.json()["node_runs"]):
                pending = response
                break
            time.sleep(0.1)
        assert pending is not None
>       assert pending.json()["status"] == "waiting"
E       AssertionError: assert 'queued' == 'waiting'
E         
E         - waiting
E         + queued

api/tests/test_workflow_api.py:573: AssertionError
=========================== short test summary info ============================
FAILED api/tests/test_workflow_api.py::test_human_gate_approve_after_long_pending_resumes_run
1 failed, 203 passed in 52.65s
```

## stderr (tail)
```text
(empty)
```
