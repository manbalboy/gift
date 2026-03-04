import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useViewport } from '../hooks/useViewport';

export type ToastLevel = 'warning' | 'error';

export type ToastItem = {
  id: string;
  level: ToastLevel;
  message: string;
  dedupeKey?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

const SWIPE_DISMISS_THRESHOLD = 88;

export default function Toast({
  item,
  durationMs = 3000,
  onClose,
}: {
  item: ToastItem;
  durationMs?: number;
  onClose: (id: string) => void;
}) {
  const closedRef = useRef(false);
  const messageRef = useRef<HTMLParagraphElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isSwipingRef = useRef(false);
  const swipeTriggeredRef = useRef(false);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isExpandableMessage, setIsExpandableMessage] = useState(false);
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const { isMobile } = useViewport();

  const closeOnce = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose(item.id);
  }, [item.id, onClose]);

  const measureMessageOverflow = useCallback(() => {
    if (!isMobile) {
      setIsExpandableMessage(false);
      return;
    }

    const node = messageRef.current;
    if (!node || node.clientWidth <= 0) {
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
    swipeTriggeredRef.current = false;
    isSwipingRef.current = false;
    const timer = window.setTimeout(() => closeOnce(), durationMs);
    return () => window.clearTimeout(timer);
  }, [closeOnce, durationMs, item.id]);

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
    if (!isMobile && isExpanded) {
      setIsExpanded(false);
    }
  }, [isExpanded, isMobile]);

  const role = item.level === 'error' ? 'alert' : 'status';
  const title = item.level === 'error' ? '오류' : '경고';
  const shouldShowAction = Boolean(item.action) && !isMobile;
  const canToggleExpand = isMobile && isExpandableMessage;
  const swipeProgress = Math.min(Math.abs(swipeOffsetX) / SWIPE_DISMISS_THRESHOLD, 1);

  const toastStyle = useMemo(
    () => ({
      transform: swipeOffsetX === 0 ? undefined : `translateX(${swipeOffsetX}px)`,
      opacity: swipeOffsetX === 0 ? undefined : `${Math.max(0.68, 1 - swipeProgress * 0.32)}`,
    }),
    [swipeOffsetX, swipeProgress],
  );

  return (
    <article
      className={`toast toast-${item.level} ${canToggleExpand ? 'toast-expandable' : ''} ${
        canToggleExpand && isExpanded ? 'toast-expanded' : ''
      } ${swipeOffsetX !== 0 ? 'toast-swipe-active' : ''}`}
      role={role}
      aria-live="polite"
      aria-expanded={canToggleExpand ? isExpanded : undefined}
      style={toastStyle}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (swipeTriggeredRef.current) {
          swipeTriggeredRef.current = false;
          return;
        }
        if (!canToggleExpand || target.closest('button')) return;
        setIsExpanded((prev) => !prev);
      }}
      onTouchStart={(event) => {
        if (!isMobile) return;
        const touch = event.touches[0];
        if (!touch) return;
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        swipeTriggeredRef.current = false;
        isSwipingRef.current = false;
      }}
      onTouchMove={(event) => {
        if (!isMobile) return;
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
        setSwipeOffsetX(bounded);
      }}
      onTouchEnd={() => {
        if (!isMobile) return;
        touchStartRef.current = null;

        if (Math.abs(swipeOffsetX) >= SWIPE_DISMISS_THRESHOLD) {
          swipeTriggeredRef.current = true;
          closeOnce();
          return;
        }

        isSwipingRef.current = false;
        setSwipeOffsetX(0);
      }}
      onTouchCancel={() => {
        touchStartRef.current = null;
        isSwipingRef.current = false;
        setSwipeOffsetX(0);
      }}
    >
      <div className="toast-accent" aria-hidden />
      <div className="toast-content">
        <strong>{title}</strong>
        <p
          ref={messageRef}
          className={`toast-message ${canToggleExpand && isExpanded ? 'toast-message-expanded' : ''}`}
          title={item.message}
        >
          {item.message}
        </p>
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
      </div>
      <button type="button" className="toast-close" onClick={closeOnce} aria-label="알림 닫기">
        ×
      </button>
    </article>
  );
}
