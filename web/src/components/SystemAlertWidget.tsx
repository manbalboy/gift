import type { SystemAlertEntry } from '../types';

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleTimeString('ko-KR', { hour12: false });
}

export default function SystemAlertWidget({
  alerts,
  loading,
}: {
  alerts: SystemAlertEntry[];
  loading?: boolean;
}) {
  return (
    <section className="card system-alert-widget" aria-label="system-alert-widget">
      <div className="card-header">
        <h2>System Alerts</h2>
        <p>Lock 경합, 환경 변수 Fallback, 시스템 경고를 최대 50건 확인합니다.</p>
      </div>
      {loading && alerts.length === 0 ? (
        <p className="empty">시스템 경고를 불러오는 중입니다.</p>
      ) : alerts.length === 0 ? (
        <p className="empty">최근 시스템 경고가 없습니다.</p>
      ) : (
        <div className="system-alert-list">
          {alerts.map((alert) => (
            <article key={alert.id} className={`system-alert-item system-alert-${alert.level}`}>
              <div className="system-alert-head">
                <strong className="mono">{alert.code}</strong>
                <span className="mono">{formatTime(alert.created_at)}</span>
              </div>
              <p className="system-alert-message mono">{alert.message}</p>
              <p className="system-alert-meta mono">
                {alert.source}
                {alert.context.path ? ` · ${String(alert.context.path)}` : ''}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
