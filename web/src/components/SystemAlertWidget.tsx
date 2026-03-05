import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { SystemAlertEntry } from '../types';
import { parseAlertTextParts } from '../utils/alertHighlighter';
import { MASKED_TOKEN, sanitizeAlertPath, sanitizeAlertText } from '../utils/security';

const ESTIMATED_ALERT_ROW_HEIGHT = 116;
const VIRTUAL_OVERSCAN = 6;
const SCROLL_SYNC_THROTTLE_MS = 48;

type AlertFilter = 'all' | 'error' | 'warning';

type PreparedAlert = {
  alert: SystemAlertEntry;
  level: { label: string; className: string };
  riskScore: number | null;
  risk: { label: string; className: string } | null;
  message: string;
  source: string;
  path: string;
};

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

function levelMeta(level: string): { label: string; className: string } {
  if (level === 'error') {
    return { label: 'Error', className: 'system-alert-level-error' };
  }
  if (level === 'warning') {
    return { label: 'Warning', className: 'system-alert-level-warning' };
  }
  return { label: 'Info', className: 'system-alert-level-info' };
}

function resolveBottomThreshold(): number {
  if (typeof window === 'undefined') return 16;
  const viewportScale = window.visualViewport?.scale;
  const zoomScale =
    typeof viewportScale === 'number' && Number.isFinite(viewportScale) && viewportScale > 1 ? viewportScale : 1;
  return Math.min(72, Math.max(16, Math.round(16 * zoomScale)));
}

function renderSanitizedTextWithHighlights(message: string, keyPrefix: string): ReactNode {
  const maskedChunks = message.split(MASKED_TOKEN);
  if (maskedChunks.length === 0) return message;

  return (
    <>
      {maskedChunks.map((chunk, maskedIdx) => {
        const parts = parseAlertTextParts(chunk);
        return (
          <span key={`${keyPrefix}-masked-${maskedIdx}`}>
            {parts.map((part, partIdx) => {
              const key = `${keyPrefix}-part-${maskedIdx}-${partIdx}`;
              if (part.kind === 'url') {
                return (
                  <a
                    key={key}
                    className="system-alert-message-link"
                    href={part.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {part.value}
                  </a>
                );
              }
              if (part.kind === 'ticket') {
                return (
                  <a
                    key={key}
                    className="system-alert-ticket-link mono"
                    href={part.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {part.value}
                  </a>
                );
              }
              return <span key={key}>{part.value}</span>;
            })}
            {maskedIdx < maskedChunks.length - 1 ? <mark className="system-alert-masked mono">{MASKED_TOKEN}</mark> : null}
          </span>
        );
      })}
    </>
  );
}

export function filterSystemAlerts(alerts: SystemAlertEntry[], activeFilter: AlertFilter): SystemAlertEntry[] {
  if (activeFilter === 'all') return alerts;
  return alerts.filter((alert) => alert.level === activeFilter);
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
  const [activeFilter, setActiveFilter] = useState<AlertFilter>('all');
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);

  const filteredAlerts = useMemo(() => {
    return filterSystemAlerts(alerts, activeFilter);
  }, [activeFilter, alerts]);

  const preparedAlerts = useMemo<PreparedAlert[]>(() => {
    return filteredAlerts.map((alert) => {
      const riskScore = resolveRiskScore(alert);
      const risk = riskScore === null ? null : riskMeta(riskScore);
      const rawPath = alert.context?.path;
      return {
        alert,
        level: levelMeta(alert.level),
        riskScore,
        risk,
        message: sanitizeAlertText(alert.message),
        source: sanitizeAlertText(alert.source),
        path: sanitizeAlertPath(rawPath),
      };
    });
  }, [filteredAlerts]);

  const updateVirtualWindowState = (list: HTMLDivElement) => {
    const nextTop = Math.max(0, list.scrollTop);
    const nextViewportHeight = Math.max(1, list.clientHeight || 0);

    setScrollTop((current) => (current === nextTop ? current : nextTop));
    setViewportHeight((current) => (current === nextViewportHeight ? current : nextViewportHeight));
  };

  const syncAutoScrollPauseState = (list: HTMLDivElement) => {
    const distance = Math.max(0, Math.ceil(list.scrollHeight - list.clientHeight - list.scrollTop));
    const paused = distance > resolveBottomThreshold();
    setIsAutoScrollPaused((current) => (current === paused ? current : paused));
  };

  const syncScrollState = (list: HTMLDivElement) => {
    updateVirtualWindowState(list);
    syncAutoScrollPauseState(list);
  };

  const scheduleScrollSync = () => {
    const list = listRef.current;
    if (!list) return;

    if (scrollAnimationFrameRef.current === null) {
      scrollAnimationFrameRef.current = window.requestAnimationFrame(() => {
        scrollAnimationFrameRef.current = null;
        const currentList = listRef.current;
        if (!currentList) return;
        syncScrollState(currentList);
      });
    }

    if (scrollThrottleTimerRef.current !== null) {
      clearTimeout(scrollThrottleTimerRef.current);
    }
    scrollThrottleTimerRef.current = setTimeout(() => {
      scrollThrottleTimerRef.current = null;
      const currentList = listRef.current;
      if (!currentList) return;
      syncScrollState(currentList);
    }, SCROLL_SYNC_THROTTLE_MS);
  };

  const handleListScroll = () => {
    scheduleScrollSync();
  };

  const totalAlerts = preparedAlerts.length;
  const effectiveViewportHeight = viewportHeight > 0 ? viewportHeight : ESTIMATED_ALERT_ROW_HEIGHT * 3;
  const startIndex = Math.max(0, Math.floor(scrollTop / ESTIMATED_ALERT_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
  const visibleCount = Math.ceil(effectiveViewportHeight / ESTIMATED_ALERT_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2;
  const endIndex = totalAlerts > 0 ? Math.min(totalAlerts - 1, startIndex + visibleCount - 1) : -1;
  const visibleAlerts = endIndex >= startIndex ? preparedAlerts.slice(startIndex, endIndex + 1) : [];
  const topSpacerHeight = startIndex * ESTIMATED_ALERT_ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalAlerts - endIndex - 1) * ESTIMATED_ALERT_ROW_HEIGHT);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = 0;
    syncScrollState(list);
  }, [activeFilter]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || isAutoScrollPaused) return;
    list.scrollTop = list.scrollHeight;
    syncScrollState(list);
  }, [preparedAlerts, isAutoScrollPaused]);

  useEffect(
    () => () => {
      if (scrollThrottleTimerRef.current !== null) {
        clearTimeout(scrollThrottleTimerRef.current);
        scrollThrottleTimerRef.current = null;
      }
      if (scrollAnimationFrameRef.current !== null) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
        scrollAnimationFrameRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    syncScrollState(list);

    const resizeObserver = new ResizeObserver(() => {
      const currentList = listRef.current;
      if (!currentList) return;
      syncScrollState(currentList);
    });
    resizeObserver.observe(list);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      window.requestAnimationFrame(() => {
        const list = listRef.current;
        if (!list) return;
        if (!isAutoScrollPaused) {
          list.scrollTop = list.scrollHeight;
        }
        syncScrollState(list);
      });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAutoScrollPaused]);

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
        <div className="system-alert-empty" role="status" aria-live="polite">
          <strong className="mono">LOADING</strong>
          <p className="empty">시스템 경고를 불러오는 중입니다.</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="system-alert-empty" role="status" aria-live="polite">
          <strong className="mono">EMPTY</strong>
          <p className="empty">최근 시스템 경고가 없습니다.</p>
        </div>
      ) : preparedAlerts.length === 0 ? (
        <div className="system-alert-empty" role="status" aria-live="polite">
          <strong className="mono">NO MATCH</strong>
          <p className="empty">선택한 필터에 해당하는 시스템 경고가 없습니다.</p>
        </div>
      ) : (
        <div className="system-alert-list" data-testid="system-alert-list" ref={listRef} onScroll={handleListScroll}>
          {topSpacerHeight > 0 ? (
            <div className="system-alert-spacer" style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" />
          ) : null}
          {visibleAlerts.map(({ alert, level, riskScore, risk, message, source, path }, idx) => (
            <article
              key={alert.id}
              className={`system-alert-item system-alert-${alert.level}`}
              data-testid="system-alert-item"
              data-window-index={startIndex + idx}
            >
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
              <p className="system-alert-message mono">{renderSanitizedTextWithHighlights(message, `${alert.id}-message`)}</p>
              <p className="system-alert-meta mono">
                {renderSanitizedTextWithHighlights(source, `${alert.id}-source`)}
                {path ? (
                  <>
                    {' · '}
                    {renderSanitizedTextWithHighlights(path, `${alert.id}-path`)}
                  </>
                ) : null}
              </p>
            </article>
          ))}
          {bottomSpacerHeight > 0 ? (
            <div className="system-alert-spacer" style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true" />
          ) : null}
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
