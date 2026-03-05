import time

from app.services.loop_simulator import LoopSimulator
from app.services.system_alerts import list_system_alerts


def _wait_until(predicate, timeout: float = 3.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


def test_loop_simulator_runtime_crash_recovers_to_restartable_state(monkeypatch):
    simulator = LoopSimulator()

    def crash_once(*_args, **_kwargs):
        raise RuntimeError("forced runtime crash for test")

    monkeypatch.setattr(simulator, "_emit_stage_alert", crash_once)

    started = simulator.start()
    assert started["mode"] == "running"

    assert _wait_until(lambda: simulator.status()["mode"] in {"stopped", "idle"})
    assert _wait_until(lambda: simulator.status()["mode"] == "idle")

    alerts = list_system_alerts(limit=50)
    assert any(item.get("code") == "LOOP_RUNTIME_CRASH" for item in alerts)

    restarted = simulator.start()
    assert restarted["mode"] == "running"
    stopped = simulator.stop()
    assert stopped["mode"] in {"stopped", "idle"}


def test_loop_simulator_stops_when_max_loop_count_reached():
    simulator = LoopSimulator(max_loop_count=1, budget_limit=1000)

    started = simulator.start()
    assert started["mode"] == "running"

    assert _wait_until(lambda: simulator.status()["mode"] in {"stopped", "idle"})
    assert _wait_until(lambda: simulator.status()["mode"] == "idle")

    alerts = list_system_alerts(limit=50)
    assert any(item.get("code") == "LOOP_MAX_LOOP_COUNT_REACHED" for item in alerts)


def test_loop_simulator_stops_when_budget_limit_reached():
    simulator = LoopSimulator(max_loop_count=1000, budget_limit=2)

    started = simulator.start()
    assert started["mode"] == "running"

    assert _wait_until(lambda: simulator.status()["mode"] in {"stopped", "idle"})
    assert _wait_until(lambda: simulator.status()["mode"] == "idle")

    alerts = list_system_alerts(limit=50)
    assert any(item.get("code") == "LOOP_BUDGET_LIMIT_REACHED" for item in alerts)


def test_loop_simulator_rejects_start_when_max_loop_count_invalid():
    simulator = LoopSimulator(max_loop_count=0, budget_limit=5)

    started = simulator.start()
    assert started["mode"] == "stopped"

    alerts = list_system_alerts(limit=50)
    assert any(item.get("code") == "LOOP_START_REJECTED_MAX_LOOP_COUNT" for item in alerts)


def test_loop_simulator_rejects_start_when_budget_limit_invalid():
    simulator = LoopSimulator(max_loop_count=5, budget_limit=0)

    started = simulator.start()
    assert started["mode"] == "stopped"

    alerts = list_system_alerts(limit=50)
    assert any(item.get("code") == "LOOP_START_REJECTED_BUDGET_LIMIT" for item in alerts)


def test_loop_simulator_rejects_start_when_max_loop_count_negative():
    simulator = LoopSimulator(max_loop_count=-7, budget_limit=5)

    started = simulator.start()
    assert started["mode"] == "stopped"

    alerts = list_system_alerts(limit=50)
    assert any(item.get("code") == "LOOP_START_REJECTED_MAX_LOOP_COUNT" for item in alerts)


def test_loop_simulator_rejects_start_when_budget_limit_negative():
    simulator = LoopSimulator(max_loop_count=5, budget_limit=-9)

    started = simulator.start()
    assert started["mode"] == "stopped"

    alerts = list_system_alerts(limit=50)
    assert any(item.get("code") == "LOOP_START_REJECTED_BUDGET_LIMIT" for item in alerts)


def test_loop_simulator_drops_pending_instructions_when_limit_reached():
    simulator = LoopSimulator(max_loop_count=1000, budget_limit=1)
    started = simulator.start()
    assert started["mode"] == "running"

    instruction_ids: list[str] = []
    for index in range(6):
        instruction_id, _ = simulator.inject_instruction(f"다음 사이클에서 실행-{index}")
        assert instruction_id is not None
        instruction_ids.append(instruction_id)

    assert _wait_until(lambda: simulator.status()["mode"] in {"stopped", "idle"})
    statuses = [simulator.get_instruction_status(instruction_id) for instruction_id in instruction_ids]
    dropped = [item for item in statuses if item and item["status"] == "dropped"]
    assert dropped
    assert all(item["dropped_reason"] == "budget_limit_reached" for item in dropped)


def test_loop_simulator_race_like_pending_queue_is_dropped_on_max_loop_stop():
    simulator = LoopSimulator(max_loop_count=1, budget_limit=1000)
    started = simulator.start()
    assert started["mode"] == "running"

    instruction_ids: list[str] = []
    for index in range(16):
        instruction_id, _ = simulator.inject_instruction(f"레이스 주입-{index}")
        assert instruction_id is not None
        instruction_ids.append(instruction_id)
        time.sleep(0.01)

    assert _wait_until(lambda: simulator.status()["mode"] in {"stopped", "idle"})
    statuses = [simulator.get_instruction_status(instruction_id) for instruction_id in instruction_ids]
    dropped = [item for item in statuses if item and item["status"] == "dropped"]
    assert dropped
    assert any(item["dropped_reason"] == "max_loop_count_reached" for item in dropped)
