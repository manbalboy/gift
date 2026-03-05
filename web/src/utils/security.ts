import DOMPurify from 'dompurify';

export const MASKED_TOKEN = '***[MASKED]***';
export const SECRET_KEY_PATTERN = /(token|secret|password|api[_-]?key)/i;

const CONTROL_CHAR_PATTERN = /[^\P{C}\n\r\t]/gu;
const HTML_TAG_PATTERN = /<[^>]+>/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const SENSITIVE_PAIR_PATTERN =
  /\b([A-Za-z0-9._-]*?(?:token|secret|password|api[_-]?key)[A-Za-z0-9._-]*)\b\s*[:=]\s*([^\s,;]+)/gi;

export function sanitizeAlertText(raw: string): string {
  const purified = DOMPurify.sanitize(raw, {
    FORBID_TAGS: ['script', 'style', 'iframe', 'object'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onfocus', 'onmouseover'],
  });
  const strippedHtml = purified.replace(HTML_TAG_PATTERN, ' ');
  const withoutControls = strippedHtml.replace(CONTROL_CHAR_PATTERN, '');
  const maskedBearer = withoutControls.replace(BEARER_PATTERN, `Bearer ${MASKED_TOKEN}`);
  return maskedBearer.replace(SENSITIVE_PAIR_PATTERN, (_, key) => `${key}=${MASKED_TOKEN}`);
}

export function sanitizeAlertPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string') return '';
  if (SECRET_KEY_PATTERN.test(rawPath)) return MASKED_TOKEN;
  return sanitizeAlertText(rawPath);
}
