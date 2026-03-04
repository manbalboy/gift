import logging
import threading
import time
import uuid
from collections import deque

from app.core.config import settings

logger = logging.getLogger(__name__)

try:
    import redis as redis_lib
    from redis.exceptions import RedisError
except Exception:  # pragma: no cover
    redis_lib = None

    class RedisError(Exception):
        pass


class LocalSlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._guard = threading.Lock()
        self._bucket: dict[str, deque[float]] = {}

    def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        now = time.monotonic()
        safe_limit = max(1, int(limit))
        safe_window = max(0.2, float(window_seconds))

        with self._guard:
            bucket = self._bucket.setdefault(key, deque())
            while bucket and now - bucket[0] > safe_window:
                bucket.popleft()
            if len(bucket) >= safe_limit:
                return False
            bucket.append(now)
            return True

    def reset(self) -> None:
        with self._guard:
            self._bucket.clear()


class RedisSlidingWindowRateLimiter:
    def __init__(self, redis_url: str, key_prefix: str = "devflow:sse-rate") -> None:
        if redis_lib is None:
            raise RuntimeError("redis package is not installed")

        self._client = redis_lib.Redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
            retry_on_timeout=False,
        )
        self._key_prefix = key_prefix

        self._lua = """
        redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1] - ARGV[2])
        local count = redis.call('ZCARD', KEYS[1])
        if count >= tonumber(ARGV[3]) then
            return 0
        end
        redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
        redis.call('EXPIRE', KEYS[1], ARGV[5])
        return 1
        """

        # 시작 시점 연결 가능 여부를 확인해 런타임 실패 반복을 줄인다.
        self._client.ping()

    def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        safe_limit = max(1, int(limit))
        safe_window = max(0.2, float(window_seconds))
        now_ms = int(time.time() * 1000)
        window_ms = int(safe_window * 1000)
        expire_seconds = max(1, int(safe_window) + 1)
        member = f"{now_ms}:{uuid.uuid4().hex}"
        redis_key = f"{self._key_prefix}:{key}"

        allowed = self._client.eval(
            self._lua,
            1,
            redis_key,
            now_ms,
            window_ms,
            safe_limit,
            member,
            expire_seconds,
        )
        return bool(allowed)


class SSEReconnectRateLimiter:
    def __init__(self, backend: str | None = None) -> None:
        self._local = LocalSlidingWindowRateLimiter()
        self._redis: RedisSlidingWindowRateLimiter | None = None
        self._backend = (backend or settings.sse_rate_limit_backend).lower()

        if self._backend == "redis":
            try:
                self._redis = RedisSlidingWindowRateLimiter(settings.redis_url)
            except Exception as exc:
                logger.warning("Redis SSE rate limiter disabled, using local fallback: %s", exc)
                self._redis = None

    def allow(self, key: str, limit: int, window_seconds: float) -> bool:
        if self._backend == "redis" and self._redis is not None:
            try:
                return self._redis.allow(key=key, limit=limit, window_seconds=window_seconds)
            except RedisError as exc:
                logger.warning("Redis SSE rate limiter failed, using local fallback: %s", exc)
        return self._local.allow(key=key, limit=limit, window_seconds=window_seconds)

    def reset_for_tests(self) -> None:
        self._local.reset()


def create_sse_reconnect_limiter(backend: str | None = None) -> SSEReconnectRateLimiter:
    return SSEReconnectRateLimiter(backend=backend)
