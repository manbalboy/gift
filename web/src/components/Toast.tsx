import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth <= 767 : false,
  );
  const [isExpanded, setIsExpanded] = useState(false);

  const isExpandableMessage = useMemo(() => item.message.length > 72, [item.message]);
  const closeOnce = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose(item.id);
  }, [item.id, onClose]);

  useEffect(() => {
    closedRef.current = false;
    setIsExpanded(false);
    const timer = window.setTimeout(() => closeOnce(), durationMs);
    return () => window.clearTimeout(timer);
  }, [closeOnce, durationMs, item.id]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth <= 767);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const role = item.level === 'error' ? 'alert' : 'status';
  const title = item.level === 'error' ? '오류' : '경고';
  const shouldShowAction = Boolean(item.action) && !isMobileViewport;
  const canToggleExpand = isMobileViewport && isExpandableMessage;

  return (
    <article
      className={`toast toast-${item.level} ${canToggleExpand ? 'toast-expandable' : ''}`}
      role={role}
      aria-live="polite"
      aria-expanded={canToggleExpand ? isExpanded : undefined}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (!canToggleExpand || target.closest('button')) return;
        setIsExpanded((prev) => !prev);
      }}
    >
      <div className="toast-accent" aria-hidden />
      <div className="toast-content">
        <strong>{title}</strong>
        <p
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
