const SSE_RECONNECT_BASE_DELAY_MS = 500;
const SSE_RECONNECT_MAX_DELAY_MS = 8_000;
const SSE_RECONNECT_JITTER_MIN = 0.75;
const SSE_RECONNECT_JITTER_RANGE = 0.5;

export function calculateReconnectDelayMs(attempt: number, randomValue = Math.random()): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const cappedExponential = Math.min(
    SSE_RECONNECT_MAX_DELAY_MS,
    SSE_RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, safeAttempt - 1),
  );
  const normalizedRandom = Number.isFinite(randomValue) ? Math.min(1, Math.max(0, randomValue)) : 0.5;
  const jitterFactor = SSE_RECONNECT_JITTER_MIN + normalizedRandom * SSE_RECONNECT_JITTER_RANGE;
  const jitteredDelay = Math.round(cappedExponential * jitterFactor);
  return Math.min(SSE_RECONNECT_MAX_DELAY_MS, jitteredDelay);
}
