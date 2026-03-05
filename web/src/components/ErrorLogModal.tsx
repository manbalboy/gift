import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const MAX_VISIBLE_LOG_CHARS = 5000;
const EXPANDED_LOG_PAGE_CHARS = 12000;
const EMPTY_LOG_FALLBACK = 'No logs available';
const DOWNLOAD_CHUNK_CHARS = 64 * 1024;
const VIRTUAL_ROW_ESTIMATE_PX = 24;
const VIRTUALIZE_MIN_ROWS = 160;
const GRAPHEME_FALLBACK_PATTERN =
  /(?:\p{Regional_Indicator}{2})|(?:[#*0-9]\uFE0F?\u20E3)|(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*)|(?:\P{Mark}\p{Mark}*)|(?:\p{Mark}+)|./gu;

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

function chunkText(value: string, chunkSize = DOWNLOAD_CHUNK_CHARS): string[] {
  if (!value) return [''];
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
}

async function writeViaFileSystemApi(filename: string, mimeType: string, extension: string, parts: string[]): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName: string;
        types: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<{ createWritable: () => Promise<{ write: (chunk: string) => Promise<void>; close: () => Promise<void> }> }>;
    }
  ).showSaveFilePicker;
  if (!picker) return false;
  try {
    const handle = await picker({
      suggestedName: filename,
      types: [
        {
          description: extension.toUpperCase(),
          accept: { [mimeType]: [`.${extension}`] },
        },
      ],
    });
    const writable = await handle.createWritable();
    for (const part of parts) {
      await writable.write(part);
    }
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

async function downloadLog(payload: string, format: 'txt' | 'json') {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof URL === 'undefined') return;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `error-log-${timestamp}.${format}`;
  const mimeType = format === 'txt' ? 'text/plain;charset=utf-8' : 'application/json;charset=utf-8';
  const parts =
    format === 'txt'
      ? chunkText(payload)
      : [
          '{\n  "exported_at": ',
          JSON.stringify(new Date().toISOString()),
          ',\n  "content": ',
          JSON.stringify(payload),
          '\n}\n',
        ];
  const saved = await writeViaFileSystemApi(filename, mimeType, format, parts);
  if (saved) return;
  const blob = new Blob(parts, { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function splitGraphemeChunks(value: string, chunkSize: number): string[] {
  if (!value) return [''];
  const clampedChunkSize = Math.max(256, chunkSize);
  const chunks: string[] = [];
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
    let bucket = '';
    let size = 0;
    for (const part of segmenter.segment(value)) {
      bucket += part.segment;
      size += 1;
      if (size >= clampedChunkSize) {
        chunks.push(bucket);
        bucket = '';
        size = 0;
      }
    }
    if (bucket || chunks.length === 0) {
      chunks.push(bucket);
    }
    return chunks;
  }

  if (value.length > 20000) {
    for (let index = 0; index < value.length; index += clampedChunkSize) {
      chunks.push(value.slice(index, index + clampedChunkSize));
    }
    return chunks.length > 0 ? chunks : [''];
  }

  const graphemes = value.match(GRAPHEME_FALLBACK_PATTERN) ?? [];
  for (let index = 0; index < graphemes.length; index += clampedChunkSize) {
    chunks.push(graphemes.slice(index, index + clampedChunkSize).join(''));
  }
  return chunks.length > 0 ? chunks : [''];
}

function truncateByGrapheme(value: string, limit: number): string {
  if (!value) return value;
  const maxSize = Math.max(1, limit);
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
    let out = '';
    let count = 0;
    for (const part of segmenter.segment(value)) {
      out += part.segment;
      count += 1;
      if (count >= maxSize) break;
    }
    return out;
  }

  if (value.length > 20000) {
    return value.slice(0, maxSize);
  }

  const graphemes = value.match(GRAPHEME_FALLBACK_PATTERN) ?? [];
  return graphemes.slice(0, maxSize).join('');
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const payload = useMemo(() => {
    const merged = detailLines
      .map((line) => (typeof line === 'string' ? line : ''))
      .join('\n')
      .trim();
    return merged.length > 0 ? merged : EMPTY_LOG_FALLBACK;
  }, [detailLines]);
  const payloadLength = payload.length;
  const isTruncated = payloadLength > MAX_VISIBLE_LOG_CHARS;
  const expandedPages = useMemo(
    () => (isTruncated && expanded ? splitGraphemeChunks(payload, EXPANDED_LOG_PAGE_CHARS) : [payload]),
    [expanded, isTruncated, payload],
  );
  const expandedTotalPages = Math.max(1, expandedPages.length);
  const safeExpandedPage = Math.min(expandedPage, expandedTotalPages - 1);
  const visiblePayload = useMemo(() => {
    if (!isTruncated || !expanded) return { text: payload, length: payloadLength };
    const pageText = expandedPages[safeExpandedPage] ?? '';
    return { text: pageText, length: pageText.length };
  }, [expanded, expandedPages, isTruncated, payload, payloadLength, safeExpandedPage]);
  const collapsedPreview = useMemo(() => {
    if (!isTruncated) return payload;
    const preview =
      payload.length > 50000 ? payload.slice(0, MAX_VISIBLE_LOG_CHARS) : truncateByGrapheme(payload, MAX_VISIBLE_LOG_CHARS);
    return `${preview}\n\n... (생략됨)`;
  }, [isTruncated, payload]);
  const renderedPayload = expanded && isTruncated ? visiblePayload.text : collapsedPreview;
  const renderedRows = useMemo(() => {
    const lines = renderedPayload.split('\n');
    if (lines.length <= 1) return [renderedPayload];
    return lines.map((line, idx) => (idx < lines.length - 1 ? `${line}\n` : line));
  }, [renderedPayload]);
  const isJsdomRuntime =
    typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' && navigator.userAgent.toLowerCase().includes('jsdom');
  const shouldVirtualize =
    renderedRows.length >= VIRTUALIZE_MIN_ROWS &&
    !isJsdomRuntime &&
    typeof window !== 'undefined' &&
    typeof (window as Window & { ResizeObserver?: unknown }).ResizeObserver !== 'undefined';
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? renderedRows.length : 0,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => VIRTUAL_ROW_ESTIMATE_PX,
    overscan: 14,
  });
  const virtualRows = shouldVirtualize ? virtualizer.getVirtualItems() : [];

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
        <div className="error-log-header">
          <h2>{title}</h2>
          <div className="error-log-export-actions" aria-label="log-export-actions">
            <button type="button" className="btn btn-ghost" onClick={() => void downloadLog(payload, 'txt')}>
              TXT 다운로드
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void downloadLog(payload, 'json')}>
              JSON 다운로드
            </button>
          </div>
        </div>
        <p>{summary}</p>
        <div className="mono error-log-detail" ref={scrollContainerRef}>
          {shouldVirtualize ? (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualRows.map((virtualRow) => (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="error-log-row"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {renderedRows[virtualRow.index]}
                </div>
              ))}
            </div>
          ) : (
            <pre className="error-log-plain">{renderedPayload}</pre>
          )}
        </div>
        {isTruncated && (
          <div className="error-log-truncation-meta">
            <p className="mono">
              {expanded
                ? `페이지 ${safeExpandedPage + 1}/${expandedTotalPages} · 표시 ${visiblePayload.length.toLocaleString()} chars · 전체 ${payloadLength.toLocaleString()} chars`
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
