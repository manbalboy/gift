import { toSafePreHtml } from '../utils/sanitize';

export default function SafeArtifactViewer({
  content,
  fallback,
  className,
}: {
  content: string;
  fallback: string;
  className?: string;
}) {
  const html = toSafePreHtml(content || fallback);
  return (
    <article
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
