import DOMPurify from 'dompurify';

export const MASKED_TOKEN = '***[MASKED]***';
export const SECRET_KEY_PATTERN = /(token|secret|password|api[_-]?key)/i;
export type PlainText = string & { readonly __plainTextBrand: unique symbol };

const CONTROL_CHAR_PATTERN = /[^\P{C}\n\r\t]/gu;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const SENSITIVE_PAIR_PATTERN =
  /\b([A-Za-z0-9._-]*?(?:token|secret|password|api[_-]?key)[A-Za-z0-9._-]*)\b\s*[:=]\s*([^\s,;]+)/gi;
const SAFE_GENERIC_PATTERN = /<([A-Za-z][A-Za-z0-9_,.[\]\s|&?:-]{0,80})>/g;
const SAFE_GENERIC_PLACEHOLDER_PATTERN = /^<([A-Za-z][A-Za-z0-9_,.[\]\s|&?:-]{0,80})>$/;
const UNSAFE_GENERIC_KEYWORDS = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'IMG',
  'SVG',
  'MATH',
  'LINK',
  'META',
  'BASE',
]);
const HTML_TAG_LIKE_KEYWORDS = new Set([
  'A',
  'DIV',
  'SPAN',
  'P',
  'BUTTON',
  'INPUT',
  'FORM',
  'TEXTAREA',
  'SELECT',
  'OPTION',
  'IMG',
  'SVG',
  'PATH',
  'CIRCLE',
  'RECT',
  'CANVAS',
  'VIDEO',
  'AUDIO',
  'IFRAME',
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
  'OBJECT',
  'EMBED',
  'MATH',
  'TABLE',
  'TR',
  'TD',
  'TH',
  'UL',
  'OL',
  'LI',
]);

function isAllowedGenericToken(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return false;
  if (/[="'`/]/.test(trimmed)) return false;
  if (/\bon[a-z]{2,}\b/i.test(trimmed)) return false;
  if (/\b(?:src|href|style|xlink:href|data)\b/i.test(trimmed)) return false;

  const normalized = trimmed.toUpperCase();
  if (UNSAFE_GENERIC_KEYWORDS.has(normalized)) return false;

  const firstToken = trimmed.split(/[\s,|&?:\[\]]+/)[0]?.toUpperCase() ?? '';
  if (!firstToken) return false;
  if (UNSAFE_GENERIC_KEYWORDS.has(firstToken)) return false;
  if (HTML_TAG_LIKE_KEYWORDS.has(firstToken)) return false;

  return true;
}

function preserveSafeGenericTokens(raw: string): { text: string; placeholders: string[] } {
  const placeholders: string[] = [];
  const text = raw.replace(SAFE_GENERIC_PATTERN, (match, inner: string) => {
    if (!isAllowedGenericToken(inner)) return match;
    const trimmed = inner.trim();
    const token = `@@ALERT_GENERIC_${placeholders.length}@@`;
    placeholders.push(`<${trimmed}>`);
    return token;
  });
  return { text, placeholders };
}

function restoreSafeGenericTokens(raw: string, placeholders: string[]): string {
  if (placeholders.length === 0) return raw;
  return raw.replace(/@@ALERT_GENERIC_(\d+)@@/g, (_, indexRaw: string) => {
    const index = Number(indexRaw);
    if (!Number.isInteger(index) || index < 0 || index >= placeholders.length) return '';
    const placeholder = placeholders[index];
    const matched = SAFE_GENERIC_PLACEHOLDER_PATTERN.exec(placeholder);
    if (!matched) return '';
    if (!isAllowedGenericToken(matched[1])) return '';
    return placeholder;
  });
}

/**
 * HTML 마크업이 아닌 순수 텍스트만 반환한다.
 * 반환값은 React text node 용도이며 `dangerouslySetInnerHTML`에 사용하면 안 된다.
 */
export function sanitizeAlertText(raw: string): PlainText {
  // UI에서 alert 문자열은 React text node로 렌더링되며, HTML 주입을 목적으로 사용하지 않는다.
  // 단, 향후 렌더링 방식이 바뀌어도 복원 단계에서 속성/이벤트 기반 문자열이 통과하지 않도록 교차 검증한다.
  const { text: tokenized, placeholders } = preserveSafeGenericTokens(raw);
  const purifiedHtml = DOMPurify.sanitize(tokenized, {
    FORBID_TAGS: ['script', 'style', 'iframe', 'object'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onfocus', 'onmouseover'],
  });
  const withoutTags = purifiedHtml.replace(/<[^>]*>/g, '');
  const restored = restoreSafeGenericTokens(withoutTags, placeholders);
  const withoutControls = restored.replace(CONTROL_CHAR_PATTERN, '');
  const maskedBearer = withoutControls.replace(BEARER_PATTERN, `Bearer ${MASKED_TOKEN}`);
  return maskedBearer.replace(SENSITIVE_PAIR_PATTERN, (_, key) => `${key}=${MASKED_TOKEN}`) as PlainText;
}

export function sanitizeAlertPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string') return '';
  if (SECRET_KEY_PATTERN.test(rawPath)) return MASKED_TOKEN;
  return sanitizeAlertText(rawPath);
}
