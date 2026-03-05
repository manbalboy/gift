import { Fragment, useMemo, useState } from 'react';
import { toSafePreHtml } from '../utils/sanitize';

const LARGE_ARTIFACT_CHAR_THRESHOLD = 120_000;
const VIRTUAL_ROW_HEIGHT = 22;
const VIRTUAL_CONTAINER_HEIGHT = 220;
const VIRTUAL_OVERSCAN = 12;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightChunks(text: string, query: string) {
  if (!query) return [text];
  const pattern = new RegExp(`(${escapeRegex(query)})`, 'gi');
  const segments = text.split(pattern);
  return segments.map((part, idx) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return (
        <mark className="artifact-highlight" key={`${part}-${idx}`}>
          {part}
        </mark>
      );
    }
    return <Fragment key={`${part}-${idx}`}>{part}</Fragment>;
  });
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

  if (isLargeArtifact) {
    const totalHeight = lines.length * VIRTUAL_ROW_HEIGHT;
    const viewportRows = Math.ceil(VIRTUAL_CONTAINER_HEIGHT / VIRTUAL_ROW_HEIGHT);
    const startIndex = Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
    const endIndex = Math.min(lines.length, startIndex + viewportRows + VIRTUAL_OVERSCAN * 2);
    const visible = lines.slice(startIndex, endIndex);
    const offsetY = startIndex * VIRTUAL_ROW_HEIGHT;

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
        <p className="artifact-virtualized-hint mono">
          대용량 아티팩트 감지: {lines.length.toLocaleString()} lines (가상화 렌더링)
        </p>
        <div
          className="artifact-virtualized-scroll"
          style={{ height: `${VIRTUAL_CONTAINER_HEIGHT}px` }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            <pre className="artifact-virtualized-content mono" style={{ transform: `translateY(${offsetY}px)` }}>
              {visible.map((line, idx) => (
                <Fragment key={`${startIndex + idx}-${line}`}>{highlightChunks(line, query.trim())}{'\n'}</Fragment>
              ))}
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
