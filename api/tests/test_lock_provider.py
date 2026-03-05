from app.services import lock_provider


def test_lock_provider_factory_fail_closed_when_redis_unavailable(monkeypatch):
    def raise_error(self, redis_url: str, ttl_seconds: int = 30, key_prefix: str = "devflow:run-lock"):
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(lock_provider.RedisLockProvider, "__init__", raise_error)

    provider = lock_provider.LockProviderFactory.create("redis")
    run_lock = provider.get_run_lock(73)

    assert run_lock.acquire(blocking=False) is False
    assert run_lock.extend() is False


def test_lock_provider_factory_uses_local_backend_by_default():
    provider = lock_provider.LockProviderFactory.create("local")
    run_lock = provider.get_run_lock(101)

    assert run_lock.acquire(blocking=False) is True
    run_lock.release()
