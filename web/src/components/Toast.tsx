import { useCallback, useEffect, useRef } from 'react';

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
  const closeOnce = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose(item.id);
  }, [item.id, onClose]);

  useEffect(() => {
    closedRef.current = false;
    const timer = window.setTimeout(() => closeOnce(), durationMs);
    return () => window.clearTimeout(timer);
  }, [closeOnce, durationMs, item.id]);

  const role = item.level === 'error' ? 'alert' : 'status';
  const title = item.level === 'error' ? '오류' : '경고';

  return (
    <article className={`toast toast-${item.level}`} role={role} aria-live="polite">
      <div className="toast-accent" aria-hidden />
      <div className="toast-content">
        <strong>{title}</strong>
        <p className="toast-message" title={item.message}>
          {item.message}
        </p>
        {item.action && (
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
