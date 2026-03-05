export type AlertTextPart =
  | { kind: 'text'; value: string }
  | { kind: 'url'; value: string; href: string }
  | { kind: 'ticket'; value: string; href: string };

const URL_OR_TICKET_PATTERN = /(https?:\/\/[^\s<>"']+)|\b([A-Z][A-Z0-9]{1,9}-\d{1,8})\b/g;
const TRAILING_PUNCTUATION_PATTERN = /[),.;!?]+$/;
const DEFAULT_TICKET_SEARCH_URL = 'https://github.com/search?type=issues&q=';

function toSafeExternalUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function stripTrailingPunctuation(input: string): { normalized: string; trailing: string } {
  const match = input.match(TRAILING_PUNCTUATION_PATTERN);
  if (!match) return { normalized: input, trailing: '' };
  const trailing = match[0];
  return { normalized: input.slice(0, input.length - trailing.length), trailing };
}

function buildTicketHref(ticket: string): string {
  return `${DEFAULT_TICKET_SEARCH_URL}${encodeURIComponent(ticket)}`;
}

export function parseAlertTextParts(input: string): AlertTextPart[] {
  if (!input) return [];
  const parts: AlertTextPart[] = [];
  let cursor = 0;
  URL_OR_TICKET_PATTERN.lastIndex = 0;

  for (;;) {
    const match = URL_OR_TICKET_PATTERN.exec(input);
    if (!match) break;
    const start = match.index;
    if (start > cursor) {
      parts.push({ kind: 'text', value: input.slice(cursor, start) });
    }
    const fullMatch = match[0];
    const rawUrl = match[1];
    const rawTicket = match[2];

    if (rawUrl) {
      const { normalized, trailing } = stripTrailingPunctuation(rawUrl);
      const safeUrl = toSafeExternalUrl(normalized);
      if (safeUrl) {
        parts.push({ kind: 'url', value: normalized, href: safeUrl });
      } else {
        parts.push({ kind: 'text', value: fullMatch });
      }
      if (trailing) {
        parts.push({ kind: 'text', value: trailing });
      }
    } else if (rawTicket) {
      parts.push({ kind: 'ticket', value: rawTicket, href: buildTicketHref(rawTicket) });
    } else {
      parts.push({ kind: 'text', value: fullMatch });
    }
    cursor = start + fullMatch.length;
  }

  if (cursor < input.length) {
    parts.push({ kind: 'text', value: input.slice(cursor) });
  }
  return parts;
}
