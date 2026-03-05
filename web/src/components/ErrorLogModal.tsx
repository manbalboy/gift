import { useEffect, useMemo, useState } from 'react';

const MAX_VISIBLE_LOG_CHARS = 5000;
const EXPANDED_LOG_PAGE_CHARS = 12000;
const EMPTY_LOG_FALLBACK = 'No logs available';
const GRAPHEME_FALLBACK_PATTERN = /\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*|\P{Mark}\p{Mark}*|./gu;

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

function splitGraphemes(value: string): string[] {
  const segmenterCtor = (globalThis as {
    Intl?: {
      Segmenter?: new (
        locales?: string | string[],
        options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
      ) => { segment: (input: string) => Iterable<{ segment: string }> };
    };
  }).Intl?.Segmenter;
  if (segmenterCtor) {
    const segmenter = new segmenterCtor('ko', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), (part) => part.segment);
  }
  return value.match(GRAPHEME_FALLBACK_PATTERN) ?? [];
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
  const [expandedPage, setExpandedPage] = useState(0);
  const payload = useMemo(() => {
    const merged = detailLines
      .map((line) => (typeof line === 'string' ? line : ''))
      .join('\n')
      .trim();
    return merged.length > 0 ? merged : EMPTY_LOG_FALLBACK;
  }, [detailLines]);
  const payloadGraphemes = useMemo(() => splitGraphemes(payload), [payload]);
  const payloadLength = payloadGraphemes.length;
  const isTruncated = payloadLength > MAX_VISIBLE_LOG_CHARS;
  const expandedTotalPages = Math.max(1, Math.ceil(payloadLength / EXPANDED_LOG_PAGE_CHARS));
  const safeExpandedPage = Math.min(expandedPage, expandedTotalPages - 1);
  const { text: visiblePayload, length: visiblePayloadLength } = useMemo(() => {
    if (!isTruncated || !expanded) return { text: payload, length: payloadLength };
    const start = safeExpandedPage * EXPANDED_LOG_PAGE_CHARS;
    const end = start + EXPANDED_LOG_PAGE_CHARS;
    const page = payloadGraphemes.slice(start, end);
    return { text: page.join(''), length: page.length };
  }, [expanded, isTruncated, payload, payloadGraphemes, payloadLength, safeExpandedPage]);
  const collapsedPreview = useMemo(() => {
    if (!isTruncated) return payload;
    return `${payloadGraphemes.slice(0, MAX_VISIBLE_LOG_CHARS).join('')}\n\n... (생략됨)`;
  }, [isTruncated, payload, payloadGraphemes]);

  useEffect(() => {
    setExpanded(false);
    setExpandedPage(0);
    setCopyStatus('idle');
  }, [payload]);

  useEffect(() => {
    if (!expanded) {
      setExpandedPage(0);
      return;
    }
    setExpandedPage((current) => Math.min(current, expandedTotalPages - 1));
  }, [expanded, expandedTotalPages]);

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
        <pre className="mono error-log-detail">{expanded && isTruncated ? visiblePayload : collapsedPreview}</pre>
        {isTruncated && (
          <div className="error-log-truncation-meta">
            <p className="mono">
              {expanded
                ? `페이지 ${safeExpandedPage + 1}/${expandedTotalPages} · 표시 ${visiblePayloadLength.toLocaleString()} chars · 전체 ${payloadLength.toLocaleString()} chars`
                : `표시 ${MAX_VISIBLE_LOG_CHARS.toLocaleString()} / 전체 ${payloadLength.toLocaleString()} chars`}
            </p>
            <button type="button" className="btn btn-ghost" onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? '접기' : '전체 보기'}
            </button>
          </div>
        )}
        {expanded && isTruncated && expandedTotalPages > 1 && (
          <div className="error-log-pagination">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={safeExpandedPage <= 0}
              onClick={() => setExpandedPage((prev) => Math.max(0, prev - 1))}
            >
              이전 페이지
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={safeExpandedPage >= expandedTotalPages - 1}
              onClick={() => setExpandedPage((prev) => Math.min(expandedTotalPages - 1, prev + 1))}
            >
              다음 페이지
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
