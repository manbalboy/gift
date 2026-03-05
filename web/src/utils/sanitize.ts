import DOMPurify from 'dompurify';
import { marked } from 'marked';

const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const BLOCKED_PROTOCOL_PATTERN = /^\s*javascript:/i;
const HOOKED_URI_ATTRS = new Set(['href', 'xlink:href', 'src', 'formaction']);
const UNSAFE_SVG_ATTRS = new Set(['style', 'onbegin', 'onend', 'onrepeat']);
let hooksInitialized = false;

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

marked.setOptions({
  gfm: true,
  breaks: true,
});

function renderMarkdownToHtml(raw: string): string {
  return marked.parse(raw, { async: false }) as string;
}

function ensureDomPurifyHooks() {
  if (hooksInitialized) return;
  hooksInitialized = true;

  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    const attrName = String(data.attrName ?? '').toLowerCase();
    const attrValue = String(data.attrValue ?? '').trim();
    const isSvgNode = node.namespaceURI === 'http://www.w3.org/2000/svg';

    if (!attrName) return;
    if (attrName.startsWith('on')) {
      data.keepAttr = false;
      return;
    }
    if (HOOKED_URI_ATTRS.has(attrName) && BLOCKED_PROTOCOL_PATTERN.test(attrValue)) {
      data.keepAttr = false;
      return;
    }
    if (isSvgNode && UNSAFE_SVG_ATTRS.has(attrName)) {
      data.keepAttr = false;
    }
  });
}

export function toSafePreHtml(raw: string): string {
  ensureDomPurifyHooks();
  const sanitizedText = sanitizeArtifactText(raw);
  const renderedHtml = renderMarkdownToHtml(sanitizedText);
  return DOMPurify.sanitize(renderedHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  });
}
