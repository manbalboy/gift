# TEST REPORT

- Stage: `test_after_implement`
- Tester: `gemini`
- Status: `FAIL`
- Exit code: `1`
- Duration: `54.74s`
- Command: `/home/docker/agentHub/workspaces/main/scripts/run_agenthub_tests.sh implement`

## 통과한 항목
- 통과된 테스트 수를 감지했습니다: 193

## 통과하지 못한 항목
- 테스트 명령이 종료코드 1로 실패했습니다.
- 실패한 테스트 수를 감지했습니다: 4

## 요약 카운트
- passed: `193`
- failed: `4`
- skipped: `0`
- errors: `0`

## stdout (tail)
```text
[agenthub-test] running pytest
.....................................................FFF................ [ 36%]
.........................................F.............................. [ 73%]
.....................................................                    [100%]
=================================== FAILURES ===================================
__________ test_cors_blocks_untrusted_origins[http://localhost:7000] ___________

origin = 'http://localhost:7000'

    @pytest.mark.parametrize(
        "origin",
        [
            "http://evil-example.com:3100",
            "http://manbalboy.com.evil.com:3100",
            "http://amanbalboy.com:3101",
            "http://localhost:2999",
            "http://127.0.0.1:7100",
            "http://ssh.manbalboy.com:3200",
            "http://localhost:7000",
            "https://127.0.0.1:7099",
            "http://ssh.manbalboy.com:7008",
        ],
    )
    def test_cors_blocks_untrusted_origins(origin: str):
        response = client.options(
            "/api/workflows",
            headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
        )
>       assert response.status_code == 400
E       assert 200 == 400
E        +  where 200 = <Response [200 OK]>.status_code

api/tests/test_main.py:51: AssertionError
__________ test_cors_blocks_untrusted_origins[https://127.0.0.1:7099] __________

origin = 'https://127.0.0.1:7099'

    @pytest.mark.parametrize(
        "origin",
        [
            "http://evil-example.com:3100",
            "http://manbalboy.com.evil.com:3100",
            "http://amanbalboy.com:3101",
            "http://localhost:2999",
            "http://127.0.0.1:7100",
            "http://ssh.manbalboy.com:3200",
            "http://localhost:7000",
            "https://127.0.0.1:7099",
            "http://ssh.manbalboy.com:7008",
        ],
    )
    def test_cors_blocks_untrusted_origins(origin: str):
        response = client.options(
            "/api/workflows",
            headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
        )
>       assert response.status_code == 400
E       assert 200 == 400
E        +  where 200 = <Response [200 OK]>.status_code

api/tests/test_main.py:51: AssertionError
______ test_cors_blocks_untrusted_origins[http://ssh.manbalboy.com:7008] _______

origin = 'http://ssh.manbalboy.com:7008'

    @pytest.mark.parametrize(
        "origin",
        [
            "http://evil-example.com:3100",
            "http://manbalboy.com.evil.com:3100",
            "http://amanbalboy.com:3101",
            "http://localhost:2999",
            "http://127.0.0.1:7100",
            "http://ssh.manbalboy.com:3200",
            "http://localhost:7000",
            "https://127.0.0.1:7099",
            "http://ssh.manbalboy.com:7008",
        ],
    )
    def test_cors_blocks_untrusted_origins(origin: str):
        response = client.options(
            "/api/workflows",
            headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
        )
>       assert response.status_code == 400
E       assert 200 == 400
E        +  where 200 = <Response [200 OK]>.status_code

api/tests/test_main.py:51: AssertionError
___________________ test_cors_blocks_preview_port_7000_range ___________________

    def test_cors_blocks_preview_port_7000_range():
        response = client.options(
            "/api/workflows",
            headers={
                "Origin": "http://localhost:7007",
                "Access-Control-Request-Method": "GET",
            },
        )
>       assert response.status_code == 400
E       assert 200 == 400
E        +  where 200 = <Response [200 OK]>.status_code

api/tests/test_workflow_api.py:139: AssertionError
=========================== short test summary info ============================
FAILED api/tests/test_main.py::test_cors_blocks_untrusted_origins[http://localhost:7000]
FAILED api/tests/test_main.py::test_cors_blocks_untrusted_origins[https://127.0.0.1:7099]
FAILED api/tests/test_main.py::test_cors_blocks_untrusted_origins[http://ssh.manbalboy.com:7008]
FAILED api/tests/test_workflow_api.py::test_cors_blocks_preview_port_7000_range
4 failed, 193 passed in 51.96s
```

## stderr (tail)
```text
(empty)
```
