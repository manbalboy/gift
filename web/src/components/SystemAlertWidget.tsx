import type { SystemAlertEntry } from '../types';

const MASKED_TOKEN = '***[MASKED]***';

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleTimeString('ko-KR', { hour12: false });
}

function resolveRiskScore(alert: SystemAlertEntry): number | null {
  const direct = alert.risk_score;
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return Math.max(0, Math.min(100, Math.trunc(direct)));
  }
  const fromContext = alert.context?.risk_score;
  if (typeof fromContext === 'number' && Number.isFinite(fromContext)) {
    return Math.max(0, Math.min(100, Math.trunc(fromContext)));
  }
  return null;
}

function riskMeta(score: number): { label: string; className: string } {
  if (score >= 80) return { label: 'HIGH', className: 'system-alert-risk-high' };
  if (score >= 50) return { label: 'MED', className: 'system-alert-risk-medium' };
  return { label: 'LOW', className: 'system-alert-risk-low' };
}

function renderMessageWithMaskedHighlight(message: string) {
  const chunks = message.split(MASKED_TOKEN);
  if (chunks.length <= 1) {
    return message;
  }
  return (
    <>
      {chunks.map((chunk, idx) => (
        // eslint-disable-next-line react/no-array-index-key
        <span key={`masked-chunk-${idx}`}>
          {chunk}
          {idx < chunks.length - 1 ? <mark className="system-alert-masked mono">{MASKED_TOKEN}</mark> : null}
        </span>
      ))}
    </>
  );
}

export default function SystemAlertWidget({
  alerts,
  loading,
  hasMore,
  processingAction,
  onLoadMore,
  onClearAll,
  onExport,
}: {
  alerts: SystemAlertEntry[];
  loading?: boolean;
  hasMore?: boolean;
  processingAction?: boolean;
  onLoadMore?: () => void;
  onClearAll?: () => void;
  onExport?: () => void;
}) {
  const levelMeta = (level: string) => {
    if (level === 'error') {
      return { label: 'Error', className: 'system-alert-level-error' };
    }
    return { label: 'Warning', className: 'system-alert-level-warning' };
  };

  return (
    <section className="card system-alert-widget" aria-label="system-alert-widget">
      <div className="card-header">
        <div className="system-alert-toolbar">
          <div>
            <h2>System Alerts</h2>
            <p>Lock 경합, 환경 변수 Fallback, 시스템 경고를 커서 기반으로 확인합니다.</p>
          </div>
          <div className="system-alert-toolbar-actions">
            <button
              type="button"
              className="btn btn-danger system-alert-action-btn"
              onClick={onClearAll}
              disabled={processingAction || alerts.length === 0}
              aria-label="시스템 알림 전체 삭제"
            >
              <span className="system-alert-action-desktop">Clear All</span>
              <span className="system-alert-action-mobile mono">CLR</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost system-alert-action-btn"
              onClick={onExport}
              disabled={alerts.length === 0}
              aria-label="시스템 알림 JSON 내보내기"
            >
              <span className="system-alert-action-desktop">Export</span>
              <span className="system-alert-action-mobile mono">EXP</span>
            </button>
          </div>
        </div>
      </div>
      {loading && alerts.length === 0 ? (
        <p className="empty">시스템 경고를 불러오는 중입니다.</p>
      ) : alerts.length === 0 ? (
        <p className="empty">최근 시스템 경고가 없습니다.</p>
      ) : (
        <div className="system-alert-list">
          {alerts.map((alert) => {
            const level = levelMeta(alert.level);
            const riskScore = resolveRiskScore(alert);
            const risk = riskScore === null ? null : riskMeta(riskScore);
            return (
              <article key={alert.id} className={`system-alert-item system-alert-${alert.level}`}>
                <div className="system-alert-head">
                  <div className="system-alert-head-main">
                    <strong className="mono">{alert.code}</strong>
                    <span className={`system-alert-level mono ${level.className}`}>
                      <span aria-hidden className="system-alert-level-icon">
                        !
                      </span>
                      {level.label}
                    </span>
                    {risk ? (
                      <span className={`system-alert-risk mono ${risk.className}`}>
                        Risk {risk.label} · {riskScore}
                      </span>
                    ) : null}
                  </div>
                  <span className="mono">{formatTime(alert.created_at)}</span>
                </div>
                <p className="system-alert-message mono">{renderMessageWithMaskedHighlight(alert.message)}</p>
                <p className="system-alert-meta mono">
                  {alert.source}
                  {alert.context.path ? ` · ${String(alert.context.path)}` : ''}
                </p>
              </article>
            );
          })}
        </div>
      )}
      {hasMore ? (
        <div className="system-alert-footer">
          <button type="button" className="btn btn-ghost" onClick={onLoadMore} disabled={processingAction || loading}>
            더 보기
          </button>
        </div>
      ) : null}
    </section>
  );
}
