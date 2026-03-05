import DOMPurify from 'dompurify';

const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeArtifactText(raw: string): string {
  return raw.replace(CONTROL_CHAR_PATTERN, '');
}

function renderInlineMarkdown(line: string): string {
  return line
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function renderMarkdownToHtml(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const blocks: string[] = [];
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.join('')}</ul>`);
    listItems = [];
  };

  const flushCodeBlock = () => {
    if (codeLines.length === 0) {
      blocks.push('<pre><code></code></pre>');
    } else {
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }
    codeLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      listItems.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    if (line.trim().length === 0) {
      flushList();
      continue;
    }

    flushList();
    blocks.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  flushList();
  if (inCodeBlock) {
    flushCodeBlock();
  }
  return blocks.join('\n');
}

export function toSafePreHtml(raw: string): string {
  const sanitizedText = sanitizeArtifactText(raw);
  const renderedHtml = renderMarkdownToHtml(sanitizedText);
  return DOMPurify.sanitize(renderedHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  });
}
