import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [activeFilter, setActiveFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomThreshold = 16;
  const scrollThrottleMs = 80;

  const isAtBottom = (element: HTMLDivElement) =>
    element.scrollHeight - element.scrollTop - element.clientHeight <= bottomThreshold;

  const levelMeta = (level: string) => {
    if (level === 'error') {
      return { label: 'Error', className: 'system-alert-level-error' };
    }
    if (level === 'warning') {
      return { label: 'Warning', className: 'system-alert-level-warning' };
    }
    return { label: 'Info', className: 'system-alert-level-info' };
  };

  const filteredAlerts = useMemo(() => {
    if (activeFilter === 'all') return alerts;
    return alerts.filter((alert) => alert.level === activeFilter);
  }, [activeFilter, alerts]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || isAutoScrollPaused) return;
    list.scrollTop = list.scrollHeight;
  }, [filteredAlerts, isAutoScrollPaused]);

  const syncAutoScrollPauseState = () => {
    const list = listRef.current;
    if (!list) return;
    const paused = !isAtBottom(list);
    setIsAutoScrollPaused((current) => (current === paused ? current : paused));
  };

  const handleListScroll = () => {
    if (scrollThrottleTimerRef.current !== null) return;
    scrollThrottleTimerRef.current = setTimeout(() => {
      scrollThrottleTimerRef.current = null;
      syncAutoScrollPauseState();
    }, scrollThrottleMs);
  };

  useEffect(
    () => () => {
      if (scrollThrottleTimerRef.current !== null) {
        clearTimeout(scrollThrottleTimerRef.current);
        scrollThrottleTimerRef.current = null;
      }
    },
    [],
  );

  return (
    <section className="card system-alert-widget" aria-label="system-alert-widget">
      <div className="card-header">
        <div className="system-alert-toolbar">
          <div className="system-alert-toolbar-title">
            <h2>System Alerts</h2>
            <p>Lock 경합, 환경 변수 Fallback, 시스템 경고를 커서 기반으로 확인합니다.</p>
          </div>
          <div className="system-alert-toolbar-controls">
            <div className="system-alert-filter-row" role="group" aria-label="시스템 알림 필터">
              <button
                type="button"
                className={`system-alert-filter-chip mono ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFilter('all')}
                aria-pressed={activeFilter === 'all'}
              >
                All
              </button>
              <button
                type="button"
                className={`system-alert-filter-chip system-alert-filter-error mono ${activeFilter === 'error' ? 'active' : ''}`}
                onClick={() => setActiveFilter('error')}
                aria-pressed={activeFilter === 'error'}
              >
                Error
              </button>
              <button
                type="button"
                className={`system-alert-filter-chip system-alert-filter-warning mono ${activeFilter === 'warning' ? 'active' : ''}`}
                onClick={() => setActiveFilter('warning')}
                aria-pressed={activeFilter === 'warning'}
              >
                Warning
              </button>
              <span className={`system-alert-scroll-state mono ${isAutoScrollPaused ? 'paused' : 'live'}`} aria-live="polite">
                {isAutoScrollPaused ? 'PAUSED' : 'LIVE'}
              </span>
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
      </div>
      {loading && alerts.length === 0 ? (
        <p className="empty">시스템 경고를 불러오는 중입니다.</p>
      ) : alerts.length === 0 ? (
        <p className="empty">최근 시스템 경고가 없습니다.</p>
      ) : filteredAlerts.length === 0 ? (
        <p className="empty">선택한 필터에 해당하는 시스템 경고가 없습니다.</p>
      ) : (
        <div className="system-alert-list" ref={listRef} onScroll={handleListScroll}>
          {filteredAlerts.map((alert) => {
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
