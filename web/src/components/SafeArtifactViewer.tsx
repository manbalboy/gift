import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { toSafePreHtml } from '../utils/sanitize';

const LARGE_ARTIFACT_CHAR_THRESHOLD = 120_000;
const VIRTUAL_ROW_HEIGHT = 22;
const VIRTUAL_CONTAINER_HEIGHT = 220;
const VIRTUAL_OVERSCAN = 12;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightChunks(text: string, query: string, activeMatchStart: number | null) {
  if (!query) return [text];
  const source = query.trim();
  if (!source) return [text];
  const pattern = new RegExp(escapeRegex(source), 'gi');
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match = pattern.exec(text);

  while (match) {
    const value = match[0] ?? '';
    const start = match.index ?? 0;
    const end = start + value.length;
    if (start > cursor) {
      nodes.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor, start)}</Fragment>);
    }
    const activeClass = activeMatchStart === start ? ' artifact-highlight-active' : '';
    nodes.push(
      <mark className={`artifact-highlight${activeClass}`} key={`mark-${start}`}>
        {value}
      </mark>,
    );
    cursor = end;
    match = pattern.exec(text);
  }

  if (cursor < text.length) {
    nodes.push(<Fragment key={`text-${cursor}`}>{text.slice(cursor)}</Fragment>);
  }
  return nodes.length > 0 ? nodes : [text];
}

function highlightHtml(rawHtml: string, query: string): string {
  if (!query) return rawHtml;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="root">${rawHtml}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return rawHtml;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      textNodes.push(node as Text);
    }
  }
  textNodes.forEach((textNode) => {
    const value = textNode.nodeValue ?? '';
    if (!value.toLowerCase().includes(query.toLowerCase())) return;
    const fragment = doc.createDocumentFragment();
    const pattern = new RegExp(`(${escapeRegex(query)})`, 'gi');
    const parts = value.split(pattern);
    parts.forEach((part) => {
      if (!part) return;
      if (part.toLowerCase() === query.toLowerCase()) {
        const mark = doc.createElement('mark');
        mark.className = 'artifact-highlight';
        mark.textContent = part;
        fragment.appendChild(mark);
      } else {
        fragment.appendChild(doc.createTextNode(part));
      }
    });
    textNode.parentNode?.replaceChild(fragment, textNode);
  });
  return root.innerHTML;
}

export default function SafeArtifactViewer({
  content,
  fallback,
  className,
  hasMore = false,
  isLoading = false,
  onLoadMore,
}: {
  content: string;
  fallback: string;
  className?: string;
  hasMore?: boolean;
  isLoading?: boolean;
  onLoadMore?: () => void;
}) {
  const source = content || fallback;
  const [scrollTop, setScrollTop] = useState(0);
  const [query, setQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isLargeArtifact = source.length >= LARGE_ARTIFACT_CHAR_THRESHOLD;
  const html = useMemo(() => (isLargeArtifact ? '' : toSafePreHtml(source)), [isLargeArtifact, source]);
  const highlightedHtml = useMemo(() => (isLargeArtifact ? '' : highlightHtml(html, query.trim())), [html, isLargeArtifact, query]);
  const lines = useMemo(() => (isLargeArtifact ? source.split(/\r?\n/) : []), [isLargeArtifact, source]);
  const matchCount = useMemo(() => {
    const q = query.trim();
    if (!q) return 0;
    const pattern = new RegExp(escapeRegex(q), 'gi');
    const found = source.match(pattern);
    return found ? found.length : 0;
  }, [query, source]);
  const largeMatchPositions = useMemo(() => {
    if (!isLargeArtifact) return [] as Array<{ line: number; start: number; length: number }>;
    const q = query.trim();
    if (!q) return [] as Array<{ line: number; start: number; length: number }>;

    const positions: Array<{ line: number; start: number; length: number }> = [];
    const lower = q.toLowerCase();
    lines.forEach((line, lineIndex) => {
      const normalized = line.toLowerCase();
      let fromIndex = 0;
      while (fromIndex <= normalized.length - lower.length) {
        const found = normalized.indexOf(lower, fromIndex);
        if (found === -1) break;
        positions.push({ line: lineIndex, start: found, length: lower.length });
        fromIndex = found + Math.max(1, lower.length);
      }
    });
    return positions;
  }, [isLargeArtifact, lines, query]);

  useEffect(() => {
    setActiveMatchIndex((current) => {
      if (largeMatchPositions.length === 0) return -1;
      if (current >= 0 && current < largeMatchPositions.length) return current;
      return 0;
    });
  }, [largeMatchPositions]);

  useEffect(() => {
    if (!isLargeArtifact) return;
    if (activeMatchIndex < 0 || activeMatchIndex >= largeMatchPositions.length) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const target = largeMatchPositions[activeMatchIndex];
    const targetTop = target.line * VIRTUAL_ROW_HEIGHT;
    const centered = Math.max(0, targetTop - VIRTUAL_CONTAINER_HEIGHT / 2 + VIRTUAL_ROW_HEIGHT / 2);
    container.scrollTop = centered;
    setScrollTop(centered);
  }, [activeMatchIndex, isLargeArtifact, largeMatchPositions]);

  if (isLargeArtifact) {
    const totalHeight = lines.length * VIRTUAL_ROW_HEIGHT;
    const viewportRows = Math.ceil(VIRTUAL_CONTAINER_HEIGHT / VIRTUAL_ROW_HEIGHT);
    const startIndex = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
    const endIndex = Math.min(lines.length, startIndex + viewportRows + VIRTUAL_OVERSCAN * 2);
    const visible = lines.slice(startIndex, endIndex);
    const offsetY = startIndex * VIRTUAL_ROW_HEIGHT;
    const activeMatch = activeMatchIndex >= 0 ? largeMatchPositions[activeMatchIndex] : null;

    return (
      <article className={className}>
        <div className="artifact-search-toolbar">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="뷰어 내 검색 (Search in Viewer)"
            aria-label="뷰어 내 검색"
          />
          <span className="mono">{matchCount} matches</span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={largeMatchPositions.length === 0}
            onClick={() =>
              setActiveMatchIndex((current) => {
                if (largeMatchPositions.length === 0) return -1;
                if (current <= 0) return largeMatchPositions.length - 1;
                return current - 1;
              })
            }
          >
            이전 결과
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={largeMatchPositions.length === 0}
            onClick={() =>
              setActiveMatchIndex((current) => {
                if (largeMatchPositions.length === 0) return -1;
                if (current < 0) return 0;
                return (current + 1) % largeMatchPositions.length;
              })
            }
          >
            다음 결과
          </button>
        </div>
        <p className="artifact-virtualized-hint mono">
          대용량 아티팩트 감지: {lines.length.toLocaleString()} lines (가상화 렌더링)
        </p>
        <div
          ref={scrollContainerRef}
          className="artifact-virtualized-scroll"
          style={{ height: `${VIRTUAL_CONTAINER_HEIGHT}px` }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            <pre className="artifact-virtualized-content mono" style={{ transform: `translateY(${offsetY}px)` }}>
              {visible.map((line, idx) => {
                const lineIndex = startIndex + idx;
                const activeStart = activeMatch && activeMatch.line === lineIndex ? activeMatch.start : null;
                return (
                  <Fragment key={`line-${lineIndex}`}>
                    {highlightChunks(line, query.trim(), activeStart)}
                    {'\n'}
                  </Fragment>
                );
              })}
            </pre>
          </div>
        </div>
        {hasMore && (
          <button
            type="button"
            className="btn btn-ghost artifact-load-more"
            disabled={isLoading}
            onClick={() => onLoadMore?.()}
          >
            {isLoading ? '청크 로딩 중...' : '다음 청크 로딩'}
          </button>
        )}
      </article>
    );
  }

  return (
    <article className={className}>
      <div className="artifact-search-toolbar">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="뷰어 내 검색 (Search in Viewer)"
          aria-label="뷰어 내 검색"
        />
        <span className="mono">{matchCount} matches</span>
      </div>
      <div dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      {hasMore && (
        <button
          type="button"
          className="btn btn-ghost artifact-load-more"
          disabled={isLoading}
          onClick={() => onLoadMore?.()}
        >
          {isLoading ? '청크 로딩 중...' : '다음 청크 로딩'}
        </button>
      )}
    </article>
  );
}
