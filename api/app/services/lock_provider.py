import logging
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    import redis as redis_lib
    from redis.exceptions import RedisError
except Exception:  # pragma: no cover
    redis_lib = None

    class RedisError(Exception):
        pass


class RunLock(Protocol):
    def acquire(self, blocking: bool = False, timeout: float | None = None) -> bool:
        pass

    def release(self) -> None:
        pass

    def extend(self, ttl_seconds: int | None = None) -> bool:
        pass


class LocalRunLock:
    def __init__(self, lock: threading.Lock) -> None:
        self._lock = lock

    def acquire(self, blocking: bool = False, timeout: float | None = None) -> bool:
        if timeout is None:
            return self._lock.acquire(blocking=blocking)
        return self._lock.acquire(blocking=blocking, timeout=timeout)

    def release(self) -> None:
        if self._lock.locked():
            self._lock.release()

    def extend(self, ttl_seconds: int | None = None) -> bool:
        return True


class LocalLockProvider:
    def __init__(self) -> None:
        self._guard = threading.Lock()
        self._locks: dict[int, threading.Lock] = {}

    def get_run_lock(self, run_id: int) -> RunLock:
        with self._guard:
            lock = self._locks.get(run_id)
            if lock is None:
                lock = threading.Lock()
                self._locks[run_id] = lock
            return LocalRunLock(lock)


class UnavailableRunLock:
    def __init__(self, reason: str) -> None:
        self._reason = reason

    def acquire(self, blocking: bool = False, timeout: float | None = None) -> bool:
        logger.error("distributed lock unavailable, acquire denied: %s", self._reason)
        return False

    def release(self) -> None:
        return

    def extend(self, ttl_seconds: int | None = None) -> bool:
        return False


class UnavailableLockProvider:
    def __init__(self, reason: str) -> None:
        self._reason = reason

    def get_run_lock(self, run_id: int) -> RunLock:
        return UnavailableRunLock(f"{self._reason} (run_id={run_id})")


@dataclass
class RedisRunLock:
    client: object
    key: str
    ttl_seconds: int
    token: str | None = None

    def acquire(self, blocking: bool = False, timeout: float | None = None) -> bool:
        if self.token is not None:
            return True

        token = uuid.uuid4().hex
        result = bool(self.client.set(self.key, token, nx=True, ex=self.ttl_seconds))
        if result:
            self.token = token
            return True

        if not blocking:
            return False

        deadline = time.monotonic() + (timeout if timeout is not None else self.ttl_seconds)
        while time.monotonic() < deadline:
            result = bool(self.client.set(self.key, token, nx=True, ex=self.ttl_seconds))
            if result:
                self.token = token
                return True
            time.sleep(0.05)
        return False

    def release(self) -> None:
        if self.token is None:
            return

        script = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
            return redis.call('DEL', KEYS[1])
        end
        return 0
        """
        try:
            self.client.eval(script, 1, self.key, self.token)
        finally:
            self.token = None

    def extend(self, ttl_seconds: int | None = None) -> bool:
        if self.token is None:
            return False

        ttl = int(ttl_seconds or self.ttl_seconds)
        script = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
            return redis.call('EXPIRE', KEYS[1], ARGV[2])
        end
        return 0
        """
        result = self.client.eval(script, 1, self.key, self.token, ttl)
        return bool(result)


class FailFastRunLock:
    def __init__(self, primary: RedisRunLock) -> None:
        self._primary = primary

    def acquire(self, blocking: bool = False, timeout: float | None = None) -> bool:
        try:
            return self._primary.acquire(blocking=blocking, timeout=timeout)
        except RedisError as exc:
            logger.error("Redis lock acquire failed, fail-fast stop: %s", exc)
            return False

    def release(self) -> None:
        try:
            self._primary.release()
        except RedisError as exc:
            logger.warning("Redis lock release failed: %s", exc)

    def extend(self, ttl_seconds: int | None = None) -> bool:
        try:
            return self._primary.extend(ttl_seconds)
        except RedisError as exc:
            logger.warning("Redis lock extend failed: %s", exc)
            return False


class RedisLockProvider:
    def __init__(self, redis_url: str, ttl_seconds: int = 30, key_prefix: str = "devflow:run-lock") -> None:
        if redis_lib is None:
            raise RuntimeError("redis package is not installed")
        self.client = redis_lib.Redis.from_url(redis_url, decode_responses=True)
        self.ttl_seconds = max(5, ttl_seconds)
        self.key_prefix = key_prefix

    def get_run_lock(self, run_id: int) -> RunLock:
        key = f"{self.key_prefix}:{run_id}"
        primary = RedisRunLock(client=self.client, key=key, ttl_seconds=self.ttl_seconds)
        return FailFastRunLock(primary=primary)


class LockProviderFactory:
    @staticmethod
    def create(backend: str | None = None) -> LocalLockProvider | RedisLockProvider | UnavailableLockProvider:
        selected = (backend or settings.lock_backend).lower()
        if selected == "redis":
            try:
                return RedisLockProvider(
                    redis_url=settings.redis_url,
                    ttl_seconds=settings.lock_ttl_seconds,
                )
            except Exception as exc:
                logger.error("Redis lock provider unavailable, fail-closed mode enabled: %s", exc)
                return UnavailableLockProvider(reason=str(exc))
        return LocalLockProvider()
