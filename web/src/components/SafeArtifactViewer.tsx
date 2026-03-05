const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeArtifactText(raw: string): string {
  return raw.replace(CONTROL_CHAR_PATTERN, "");
}

function toSafeHtml(raw: string): string {
  const sanitizedText = sanitizeArtifactText(raw);
  return escapeHtml(sanitizedText).replace(/\n/g, "<br />");
}

export default function SafeArtifactViewer({
  content,
  fallback,
  className,
}: {
  content: string;
  fallback: string;
  className?: string;
}) {
  const html = toSafeHtml(content || fallback);
  return (
    <pre
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
