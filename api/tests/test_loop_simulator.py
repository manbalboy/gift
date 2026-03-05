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
