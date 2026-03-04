import { useEffect } from 'react';

export type ToastLevel = 'warning' | 'error';

export type ToastItem = {
  id: string;
  level: ToastLevel;
  message: string;
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
  useEffect(() => {
    const timer = window.setTimeout(() => onClose(item.id), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, item.id, onClose]);

  const role = item.level === 'error' ? 'alert' : 'status';
  const title = item.level === 'error' ? '오류' : '경고';

  return (
    <article className={`toast toast-${item.level}`} role={role} aria-live="polite">
      <div className="toast-accent" aria-hidden />
      <div className="toast-content">
        <strong>{title}</strong>
        <p>{item.message}</p>
      </div>
      <button type="button" className="toast-close" onClick={() => onClose(item.id)} aria-label="알림 닫기">
        ×
      </button>
    </article>
  );
}
