import { useEffect, useRef } from 'react';
import { api } from '../services/api';
import type { LoopEngineStatus } from '../types';

type Options = {
  enabled?: boolean;
  minRequestGapMs?: number;
  runningIntervalMs?: number;
  idleIntervalMs?: number;
  onStatus: (status: LoopEngineStatus | null) => void;
};

export function useLoopStatus({
  enabled = true,
  minRequestGapMs = 900,
  runningIntervalMs = 1500,
  idleIntervalMs = 4000,
  onStatus,
}: Options) {
  const inFlightRef = useRef(false);
  const lastRequestAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const clearTimer = () => {
      if (timerRef.current === null) return;
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };

    const schedule = (delayMs: number) => {
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void poll();
      }, Math.max(150, delayMs));
    };

    const poll = async () => {
      if (cancelled || inFlightRef.current) return;

      const now = Date.now();
      const elapsed = now - lastRequestAtRef.current;
      if (elapsed < minRequestGapMs) {
        schedule(minRequestGapMs - elapsed);
        return;
      }

      inFlightRef.current = true;
      lastRequestAtRef.current = now;

      try {
        const status = await api.getLoopEngineStatus();
        if (cancelled) return;
        onStatus(status);
        schedule(status.mode === 'running' ? runningIntervalMs : idleIntervalMs);
      } catch {
        if (cancelled) return;
        onStatus(null);
        schedule(idleIntervalMs);
      } finally {
        inFlightRef.current = false;
      }
    };

    void poll();
    return () => {
      cancelled = true;
      clearTimer();
    };
  }, [enabled, idleIntervalMs, minRequestGapMs, onStatus, runningIntervalMs]);
}
