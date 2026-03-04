import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useViewport } from '../hooks/useViewport';

export type ToastLevel = 'warning' | 'error';

export type ToastItem = {
  id: string;
  level: ToastLevel;
  message?: unknown;
  dedupeKey?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

const SWIPE_DISMISS_THRESHOLD = 88;
const DEFAULT_TOAST_DURATION_MS = 3000;

function formatToastMessage(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input;
  if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
    return String(input);
  }
  if (typeof input === 'symbol' || typeof input === 'function') {
    return String(input);
  }
  if (input instanceof Error) {
    return input.message ? `${input.name}: ${input.message}` : input.name;
  }
  try {
    return JSON.stringify(input);
  } catch {
    return '[Unserializable data]';
  }
}

function normalizeDurationMs(durationMs: number | undefined): number {
  if (durationMs === 0) return 0;
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return DEFAULT_TOAST_DURATION_MS;
  if (durationMs < 0) return DEFAULT_TOAST_DURATION_MS;
  return durationMs;
}

export default function Toast({
  item,
  durationMs = 3000,
  onClose,
}: {
  item: ToastItem;
  durationMs?: number;
  onClose: (id: string) => void;
}) {
  const normalizedDurationMs = normalizeDurationMs(durationMs);
  const closedRef = useRef(false);
  const messageRef = useRef<HTMLParagraphElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isSwipingRef = useRef(false);
  const swipeTriggeredRef = useRef(false);
  const swipeOffsetRef = useRef(0);
  const dismissTimerRef = useRef<number | null>(null);
  const timerStartedAtRef = useRef(0);
  const remainingMsRef = useRef(normalizedDurationMs);
  const reboundTimeoutRef = useRef<number | null>(null);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isExpandableMessage, setIsExpandableMessage] = useState(false);
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isTouchInteracting, setIsTouchInteracting] = useState(false);
  const [isSwipeRebound, setIsSwipeRebound] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const { isMobile } = useViewport();
  const message = useMemo(() => formatToastMessage(item.message), [item.message]);
  const isPersistent = normalizedDurationMs === 0;
  const shouldShowCopy = message.length > 0 && (item.level === 'error' || typeof item.message !== 'string');

  const closeOnce = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose(item.id);
  }, [item.id, onClose]);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current === null) return;
    window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = null;
  }, []);

  const scheduleDismiss = useCallback(() => {
    clearDismissTimer();
    if (closedRef.current) return;
    if (isPersistent) return;
    const delay = Math.max(0, remainingMsRef.current);
    if (delay === 0) {
      closeOnce();
      return;
    }
    timerStartedAtRef.current = Date.now();
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      closeOnce();
    }, delay);
  }, [clearDismissTimer, closeOnce, isPersistent]);

  const pauseDismiss = useCallback(() => {
    if (dismissTimerRef.current === null) return;
    const elapsed = Date.now() - timerStartedAtRef.current;
    remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed);
    clearDismissTimer();
  }, [clearDismissTimer]);

  const triggerSwipeRebound = useCallback(() => {
    setIsSwipeRebound(true);
    if (reboundTimeoutRef.current !== null) {
      window.clearTimeout(reboundTimeoutRef.current);
    }
    reboundTimeoutRef.current = window.setTimeout(() => {
      setIsSwipeRebound(false);
      reboundTimeoutRef.current = null;
    }, 320);
  }, []);

  const measureMessageOverflow = useCallback(() => {
    if (!isMobile) {
      setIsExpandableMessage(false);
      return;
    }

    const node = messageRef.current;
    if (!node || node.clientWidth <= 10) {
      setIsExpandableMessage(false);
      return;
    }

    const computed = window.getComputedStyle(node);
    const probe = node.cloneNode(true) as HTMLParagraphElement;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.left = '-9999px';
    probe.style.top = '0';
    probe.style.display = 'block';
    probe.style.whiteSpace = 'normal';
    probe.style.overflow = 'hidden';
    probe.style.textOverflow = 'clip';
    probe.style.width = `${Math.max(node.clientWidth, 1)}px`;
    probe.style.height = 'auto';
    probe.style.maxHeight = computed.lineHeight;
    probe.style.webkitLineClamp = 'unset';
    probe.style.webkitBoxOrient = 'unset';

    document.body.appendChild(probe);
    const expandable = probe.scrollHeight > probe.clientHeight + 1;
    probe.remove();
    setIsExpandableMessage(expandable);
  }, [isMobile]);

  useEffect(() => {
    closedRef.current = false;
    setIsExpanded(false);
    setSwipeOffsetX(0);
    setIsHovered(false);
    setIsFocusWithin(false);
    setIsTouchInteracting(false);
    setIsSwipeRebound(false);
    setCopyStatus('idle');
    swipeOffsetRef.current = 0;
    swipeTriggeredRef.current = false;
    isSwipingRef.current = false;
    remainingMsRef.current = normalizedDurationMs;
    scheduleDismiss();
    return () => {
      clearDismissTimer();
      if (reboundTimeoutRef.current !== null) {
        window.clearTimeout(reboundTimeoutRef.current);
        reboundTimeoutRef.current = null;
      }
    };
  }, [clearDismissTimer, item.id, normalizedDurationMs, scheduleDismiss]);

  useEffect(() => {
    const shouldPause = isHovered || isFocusWithin || isTouchInteracting;
    if (shouldPause) {
      pauseDismiss();
      return;
    }
    scheduleDismiss();
  }, [isFocusWithin, isHovered, isTouchInteracting, pauseDismiss, scheduleDismiss]);

  useLayoutEffect(() => {
    measureMessageOverflow();
  }, [measureMessageOverflow, item.message]);

  useEffect(() => {
    const node = messageRef.current;
    if (!node) return;

    const observer = new ResizeObserver(() => {
      measureMessageOverflow();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureMessageOverflow]);

  useEffect(() => {
    if (!isMobile) return;

    let cancelled = false;
    const onMeasure = () => {
      if (cancelled) return;
      measureMessageOverflow();
    };
    const timeoutPrimary = window.setTimeout(onMeasure, 120);
    const timeoutFallback = window.setTimeout(onMeasure, 520);
    const rafId = window.requestAnimationFrame(onMeasure);
    window.addEventListener('load', onMeasure, { once: true });

    const fontFaceSet = document.fonts;
    if (fontFaceSet?.ready) {
      void fontFaceSet.ready
        .then(() => {
          onMeasure();
        })
        .catch(() => {
          onMeasure();
        });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutPrimary);
      window.clearTimeout(timeoutFallback);
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('load', onMeasure);
    };
  }, [isMobile, item.message, measureMessageOverflow]);

  useEffect(() => {
    if (!isMobile && isExpanded) {
      setIsExpanded(false);
    }
  }, [isExpanded, isMobile]);

  useEffect(() => {
    if (isMobile) return;
    touchStartRef.current = null;
    isSwipingRef.current = false;
    setIsTouchInteracting(false);
    swipeTriggeredRef.current = false;
    swipeOffsetRef.current = 0;
    setSwipeOffsetX(0);
  }, [isMobile]);

  const role = item.level === 'error' ? 'alert' : 'status';
  const title = item.level === 'error' ? '오류' : '경고';
  const shouldShowAction = Boolean(item.action) && !isMobile;
  const canToggleExpand = isMobile && isExpandableMessage;
  const messageId = `toast-message-${item.id}`;
  const swipeProgress = Math.min(Math.abs(swipeOffsetX) / SWIPE_DISMISS_THRESHOLD, 1);

  const toastStyle = useMemo(
    () => ({
      transform: swipeOffsetX === 0 ? undefined : `translateX(${swipeOffsetX}px)`,
      opacity: swipeOffsetX === 0 ? undefined : `${Math.max(0.68, 1 - swipeProgress * 0.32)}`,
    }),
    [swipeOffsetX, swipeProgress],
  );

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = message;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setCopyStatus('copied');
      window.setTimeout(() => setCopyStatus('idle'), 1100);
    } catch {
      setCopyStatus('idle');
    }
  }, [message]);

  return (
    <article
      className={`toast toast-${item.level} ${canToggleExpand ? 'toast-expandable' : ''} ${
        canToggleExpand && isExpanded ? 'toast-expanded' : ''
      } ${swipeOffsetX !== 0 ? 'toast-swipe-active' : ''} ${isSwipeRebound ? 'toast-swipe-rebound' : ''}`}
      role={role}
      aria-live="polite"
      aria-expanded={canToggleExpand ? isExpanded : undefined}
      style={toastStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsFocusWithin(false);
      }}
      onClick={(event) => {
        if (swipeTriggeredRef.current) {
          swipeTriggeredRef.current = false;
        }
      }}
      onTouchStart={(event) => {
        if (!isMobile) return;
        if (event.touches.length > 1) {
          touchStartRef.current = null;
          isSwipingRef.current = false;
          setIsTouchInteracting(false);
          return;
        }
        const touch = event.touches[0];
        if (!touch) return;
        setIsTouchInteracting(true);
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        swipeTriggeredRef.current = false;
        isSwipingRef.current = false;
        setIsSwipeRebound(false);
        swipeOffsetRef.current = 0;
      }}
      onTouchMove={(event) => {
        if (!isMobile) return;
        if (event.touches.length > 1 || event.touches.length === 0) {
          touchStartRef.current = null;
          isSwipingRef.current = false;
          setIsTouchInteracting(false);
          swipeOffsetRef.current = 0;
          setSwipeOffsetX(0);
          return;
        }
        setIsTouchInteracting(true);
        const touch = event.touches[0];
        const start = touchStartRef.current;
        if (!touch || !start) return;

        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;

        if (!isSwipingRef.current) {
          if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY)) {
            return;
          }
          isSwipingRef.current = true;
        }

        if (event.cancelable) {
          event.preventDefault();
        }
        const bounded = Math.max(-140, Math.min(140, deltaX));
        setIsSwipeRebound(false);
        swipeOffsetRef.current = bounded;
        setSwipeOffsetX(bounded);
      }}
      onTouchEnd={() => {
        if (!isMobile) return;
        setIsTouchInteracting(false);
        touchStartRef.current = null;
        const currentOffset = swipeOffsetRef.current;

        if (Math.abs(currentOffset) >= SWIPE_DISMISS_THRESHOLD) {
          swipeTriggeredRef.current = true;
          closeOnce();
          return;
        }

        isSwipingRef.current = false;
        swipeOffsetRef.current = 0;
        triggerSwipeRebound();
        setSwipeOffsetX(0);
      }}
      onTouchCancel={() => {
        setIsTouchInteracting(false);
        touchStartRef.current = null;
        isSwipingRef.current = false;
        swipeOffsetRef.current = 0;
        triggerSwipeRebound();
        setSwipeOffsetX(0);
      }}
    >
      <div className="toast-accent" aria-hidden />
      <div className="toast-content">
        <strong>{title}</strong>
        <p
          id={messageId}
          ref={messageRef}
          className={`toast-message ${canToggleExpand && isExpanded ? 'toast-message-expanded' : ''}`}
          title={message}
        >
          {message}
        </p>
        {canToggleExpand && (
          <button
            type="button"
            className="toast-expand-toggle"
            aria-controls={messageId}
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((prev) => !prev)}
          >
            {isExpanded ? '접기' : '펼치기'}
          </button>
        )}
        {shouldShowAction && item.action && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              item.action?.onClick();
              closeOnce();
            }}
          >
            {item.action.label}
          </button>
        )}
        {shouldShowCopy && (
          <button type="button" className="toast-copy" onClick={() => void handleCopy()} aria-label="메시지 복사">
            {copyStatus === 'copied' ? '복사됨' : '복사'}
          </button>
        )}
      </div>
      <button type="button" className="toast-close" onClick={closeOnce} aria-label="알림 닫기">
        ×
      </button>
    </article>
  );
}
