const iconMap: Record<string, string> = {
  queued: '○',
  waiting: '○',
  paused: 'Ⅱ',
  blocked: '⛔',
  running: '▶',
  done: '✓',
  failed: '!',
  cancelled: '×',
  review_needed: '◇',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span aria-hidden>{iconMap[status] ?? '•'}</span>
      <span>{status}</span>
    </span>
  );
}
