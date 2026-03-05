const SSE_RECONNECT_BASE_DELAY_MS = 1_000;
const SSE_RECONNECT_MAX_DELAY_MS = 8_000;

export function calculateReconnectDelayMs(attempt: number, randomValue = Math.random()): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  if (!Number.isFinite(randomValue)) {
    return SSE_RECONNECT_BASE_DELAY_MS;
  }
  return Math.min(SSE_RECONNECT_MAX_DELAY_MS, SSE_RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, safeAttempt - 1));
}
