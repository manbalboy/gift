import DOMPurify from 'dompurify';

export const MASKED_TOKEN = '***[MASKED]***';
export const SECRET_KEY_PATTERN = /(token|secret|password|api[_-]?key)/i;

const CONTROL_CHAR_PATTERN = /[^\P{C}\n\r\t]/gu;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const SENSITIVE_PAIR_PATTERN =
  /\b([A-Za-z0-9._-]*?(?:token|secret|password|api[_-]?key)[A-Za-z0-9._-]*)\b\s*[:=]\s*([^\s,;]+)/gi;
const SAFE_GENERIC_PATTERN = /<([A-Za-z][A-Za-z0-9_,.[\]\s|&?:-]{0,80})>/g;
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

function preserveSafeGenericTokens(raw: string): { text: string; placeholders: string[] } {
  const placeholders: string[] = [];
  const text = raw.replace(SAFE_GENERIC_PATTERN, (match, inner: string) => {
    const trimmed = inner.trim();
    if (!trimmed) return match;
    if (/[="'`/]/.test(trimmed)) return match;
    const normalized = trimmed.toUpperCase();
    if (UNSAFE_GENERIC_KEYWORDS.has(normalized)) return match;
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
    return Number.isInteger(index) && index >= 0 && index < placeholders.length ? placeholders[index] : '';
  });
}

export function sanitizeAlertText(raw: string): string {
  const { text: tokenized, placeholders } = preserveSafeGenericTokens(raw);
  const purifiedHtml = DOMPurify.sanitize(tokenized, {
    FORBID_TAGS: ['script', 'style', 'iframe', 'object'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onfocus', 'onmouseover'],
  });
  const withoutTags = purifiedHtml.replace(/<[^>]*>/g, '');
  const restored = restoreSafeGenericTokens(withoutTags, placeholders);
  const withoutControls = restored.replace(CONTROL_CHAR_PATTERN, '');
  const maskedBearer = withoutControls.replace(BEARER_PATTERN, `Bearer ${MASKED_TOKEN}`);
  return maskedBearer.replace(SENSITIVE_PAIR_PATTERN, (_, key) => `${key}=${MASKED_TOKEN}`);
}

export function sanitizeAlertPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string') return '';
  if (SECRET_KEY_PATTERN.test(rawPath)) return MASKED_TOKEN;
  return sanitizeAlertText(rawPath);
}
