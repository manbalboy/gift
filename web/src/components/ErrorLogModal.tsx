import { useEffect, useMemo, useState } from 'react';

const MAX_VISIBLE_LOG_CHARS = 5000;
const EMPTY_LOG_FALLBACK = 'No logs available';

type Props = {
  title: string;
  summary: string;
  detailLines: string[];
  onClose: () => void;
  isMobileSheet?: boolean;
  onCopyResult?: (status: 'done' | 'failed') => void;
};

async function copyToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function ErrorLogModal({
  title,
  summary,
  detailLines,
  onClose,
  isMobileSheet = false,
  onCopyResult,
}: Props) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'done' | 'failed'>('idle');
  const [expanded, setExpanded] = useState(false);
  const payload = useMemo(() => {
    const merged = detailLines
      .map((line) => (typeof line === 'string' ? line : ''))
      .join('\n')
      .trim();
    return merged.length > 0 ? merged : EMPTY_LOG_FALLBACK;
  }, [detailLines]);
  const isTruncated = payload.length > MAX_VISIBLE_LOG_CHARS;
  const visiblePayload = isTruncated && !expanded ? `${payload.slice(0, MAX_VISIBLE_LOG_CHARS)}\n\n... (생략됨)` : payload;

  useEffect(() => {
    setExpanded(false);
    setCopyStatus('idle');
  }, [payload]);

  const handleCopy = async () => {
    const ok = await copyToClipboard(payload);
    const nextStatus = ok ? 'done' : 'failed';
    setCopyStatus(nextStatus);
    onCopyResult?.(nextStatus);
  };

  return (
    <div className="auth-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`auth-modal card error-log-modal ${isMobileSheet ? 'sheet-modal' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        <p>{summary}</p>
        <pre className="mono error-log-detail">{visiblePayload}</pre>
        {isTruncated && (
          <div className="error-log-truncation-meta">
            <p className="mono">표시 {visiblePayload.length.toLocaleString()} / 전체 {payload.length.toLocaleString()} chars</p>
            <button type="button" className="btn btn-ghost" onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? '접기' : '전체 보기'}
            </button>
          </div>
        )}
        <div className="builder-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void handleCopy()}>
            로그 복사
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            확인
          </button>
        </div>
        {copyStatus === 'done' && <p className="mono error-log-copy-feedback">클립보드에 복사되었습니다.</p>}
        {copyStatus === 'failed' && <p className="mono error-log-copy-feedback error-log-copy-failed">복사에 실패했습니다.</p>}
      </div>
    </div>
  );
}
