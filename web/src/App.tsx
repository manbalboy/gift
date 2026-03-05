import { useEffect, useMemo, useRef, useState } from 'react';
import Dashboard from './components/Dashboard';
import LiveRunConstellation from './components/LiveRunConstellation';
import SafeArtifactViewer from './components/SafeArtifactViewer';
import StatusBadge from './components/StatusBadge';
import Toast, { type ToastItem } from './components/Toast';
import WorkflowBuilder from './components/WorkflowBuilder';
import { useViewport } from './hooks/useViewport';
import { LAYER_Z_INDEX } from './constants/layers';
import { ApiError, api } from './services/api';
import type {
  ConstellationData,
  HumanGateAuditDecision,
  HumanGateStaleAlert,
  StatusArtifactAuditEntry,
  WebhookBlockedEvent,
  Workflow,
  WorkflowRun,
} from './types';
import { createToastId } from './utils/toastId';

export default function App() {
  const [streamState, setStreamState] = useState<'connecting' | 'connected' | 'reconnecting' | 'closed'>('closed');
  const [reconnectMeta, setReconnectMeta] = useState<{ attempt: number; delayMs: number } | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [constellation, setConstellation] = useState<ConstellationData | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [queuedToastCount, setQueuedToastCount] = useState(0);
  const [focusNodeRequest, setFocusNodeRequest] = useState<{ nodeId: string; requestId: number } | null>(null);
  const [selectedArtifactNodeId, setSelectedArtifactNodeId] = useState<string | null>(null);
  const [artifactContent, setArtifactContent] = useState('');
  const [artifactNextOffset, setArtifactNextOffset] = useState(0);
  const [artifactHasMore, setArtifactHasMore] = useState(false);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [blockedWebhookEvents, setBlockedWebhookEvents] = useState<WebhookBlockedEvent[]>([]);
  const [humanGateAudits, setHumanGateAudits] = useState<StatusArtifactAuditEntry[]>([]);
  const [humanGateAuditTotalCount, setHumanGateAuditTotalCount] = useState(0);
  const [humanGateAuditLimit] = useState(10);
  const [humanGateAuditOffset, setHumanGateAuditOffset] = useState(0);
  const [humanGateAuditStatusFilter, setHumanGateAuditStatusFilter] = useState<HumanGateAuditDecision | 'all'>('all');
  const [humanGateAuditDateRange, setHumanGateAuditDateRange] = useState<'all' | '24h' | '7d' | '30d' | 'today'>('all');
  const [humanGateAuditsLoading, setHumanGateAuditsLoading] = useState(false);
  const [staleHumanGateAlerts, setStaleHumanGateAlerts] = useState<HumanGateStaleAlert[]>([]);
  const [humanGateAuditModalOpen, setHumanGateAuditModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('reviewer/admin 권한 또는 workspace 접근 권한이 필요합니다.');
  const viewport = useViewport();
  const isMobilePortrait = viewport.isMobile && viewport.isPortrait;
  const activeRunRef = useRef<WorkflowRun | null>(null);
  const toastsRef = useRef<ToastItem[]>([]);
  const toastQueueRef = useRef<ToastItem[]>([]);
  const dedupedToastKeysRef = useRef<Set<string>>(new Set());
  const timezoneOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const commitVisibleToasts = (next: ToastItem[]) => {
    toastsRef.current = next;
    setToasts(next);
  };

  const commitToastQueue = (next: ToastItem[]) => {
    toastQueueRef.current = next;
    setQueuedToastCount(next.length);
  };

  const enqueueToast = (
    level: ToastItem['level'],
    message: string,
    options?: {
      dedupeKey?: string;
      action?: ToastItem['action'];
    },
  ) => {
    if (options?.dedupeKey) {
      if (dedupedToastKeysRef.current.has(options.dedupeKey)) return;
      dedupedToastKeysRef.current.add(options.dedupeKey);
    }
    const nextToast = { id: createToastId(), level, message, dedupeKey: options?.dedupeKey, action: options?.action };
    if (toastsRef.current.length < 3) {
      commitVisibleToasts([...toastsRef.current, nextToast]);
      return;
    }
    commitToastQueue([...toastQueueRef.current, nextToast]);
  };

  const closeToast = (id: string) => {
    const target = toastsRef.current.find((toast) => toast.id === id);
    if (target?.dedupeKey) {
      dedupedToastKeysRef.current.delete(target.dedupeKey);
    }

    const nextVisible = toastsRef.current.filter((toast) => toast.id !== id);
    const nextQueue = [...toastQueueRef.current];
    while (nextVisible.length < 3 && nextQueue.length > 0) {
      const queued = nextQueue.shift();
      if (!queued) break;
      nextVisible.push(queued);
    }
    commitToastQueue(nextQueue);
    commitVisibleToasts(nextVisible);
  };

  const clearAllToasts = () => {
    commitToastQueue([]);
    dedupedToastKeysRef.current.clear();
    commitVisibleToasts([]);
  };

  const loadWorkflows = async () => {
    try {
      const items = await api.listWorkflows();
      setWorkflows(items);
      if (!activeWorkflow && items.length > 0) {
        setActiveWorkflow(items[0]);
      }
    } catch (error) {
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : '워크플로우 목록 조회 실패';
      enqueueToast('error', `워크플로우 조회 실패 (${message})`);
    }
  };

  useEffect(() => {
    void loadWorkflows();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncBlockedEvents = async () => {
      try {
        const items = await api.listWebhookBlockedEvents(20);
        if (!cancelled) {
          setBlockedWebhookEvents(items);
        }
      } catch {
        // 보안 로그 패널 동기화 실패는 핵심 실행을 막지 않도록 무시합니다.
      }
    };

    void syncBlockedEvents();
    const timer = window.setInterval(() => {
      void syncBlockedEvents();
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    activeRunRef.current = run;
  }, [run]);

  useEffect(() => {
    const firstArtifact = run?.node_runs.find((node) => node.artifact_path)?.node_id ?? null;
    setSelectedArtifactNodeId(firstArtifact);
    setArtifactContent('');
    setArtifactNextOffset(0);
    setArtifactHasMore(false);
  }, [run?.id, run?.updated_at]);

  useEffect(() => {
    let cancelled = false;
    if (!run) {
      setHumanGateAudits([]);
      setHumanGateAuditTotalCount(0);
      return () => {
        cancelled = true;
      };
    }

    const syncAudits = async () => {
      setHumanGateAuditsLoading(true);
      try {
        const response = await api.getStatusArtifactAudits(run.id, {
          limit: humanGateAuditLimit,
          offset: humanGateAuditOffset,
          status: humanGateAuditStatusFilter,
          dateRange: humanGateAuditDateRange,
          timezoneOffsetMinutes,
        });
        if (!cancelled) {
          setHumanGateAudits(response.items);
          setHumanGateAuditTotalCount(response.total_count);
        }
      } catch {
        if (!cancelled) {
          setHumanGateAudits([]);
          setHumanGateAuditTotalCount(0);
        }
      } finally {
        if (!cancelled) {
          setHumanGateAuditsLoading(false);
        }
      }
    };

    void syncAudits();
    return () => {
      cancelled = true;
    };
  }, [
    run?.id,
    run?.updated_at,
    humanGateAuditLimit,
    humanGateAuditOffset,
    humanGateAuditStatusFilter,
    humanGateAuditDateRange,
    timezoneOffsetMinutes,
  ]);

  useEffect(() => {
    let cancelled = false;
    const syncStaleAlerts = async () => {
      try {
        const alerts = await api.scanStaleHumanGateAlerts({ staleHours: 24, limit: 20 });
        if (!cancelled) {
          setStaleHumanGateAlerts(alerts);
        }
      } catch {
        if (!cancelled) {
          setStaleHumanGateAlerts([]);
        }
      }
    };

    void syncStaleAlerts();
    const timer = window.setInterval(() => {
      void syncStaleAlerts();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [run?.id, run?.updated_at]);

  useEffect(() => {
    setHumanGateAuditOffset(0);
  }, [run?.id, humanGateAuditStatusFilter, humanGateAuditDateRange]);

  useEffect(() => {
    if (!activeWorkflow) return;

    const unsubscribe = api.subscribeWorkflowRuns(activeWorkflow.id, {
      onRunStatus: async (event) => {
        try {
          const targetRunId = activeRunRef.current?.id ?? event.runs[0]?.id;
          if (!targetRunId) return;
          const [latestRun, latestConstellation] = await Promise.all([
            api.getRun(targetRunId),
            api.getConstellation(targetRunId),
          ]);
          setRun(latestRun);
          setConstellation(latestConstellation);
        } catch (error) {
          const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : '실시간 상태 동기화 실패';
          enqueueToast('error', `실시간 상태 동기화 실패 (${message})`);
        }
      },
      onError: () => {
        enqueueToast('error', '실시간 스트림 연결이 끊겨 재연결을 시도합니다.', {
          dedupeKey: 'stream-disconnect',
        });
      },
      onStateChange: (state) => {
        setStreamState(state);
      },
      onReconnectSchedule: (payload) => {
        setReconnectMeta(payload.attempt > 0 ? payload : null);
      },
    });

    return unsubscribe;
  }, [activeWorkflow?.id]);

  const runStatus = useMemo(() => run?.status ?? 'queued', [run?.status]);
  const pendingApprovalNode = useMemo(
    () => run?.node_runs.find((node) => node.status === 'approval_pending') ?? null,
    [run?.node_runs],
  );
  const streamStateLabel = useMemo(() => {
    if (streamState === 'connected') return '연결됨';
    if (streamState === 'connecting') return '연결 중';
    if (streamState === 'reconnecting') return '재연결 중';
    return '연결 종료';
  }, [streamState]);
  const nodeStatuses = useMemo(
    () =>
      Object.fromEntries(
        (run?.node_runs ?? []).map((node) => [node.node_id, node.status]),
      ),
    [run?.node_runs],
  );

  const handleSaveWorkflow = async (payload: Omit<Workflow, 'id'>, existingId?: number) => {
    try {
      const saved = existingId ? await api.updateWorkflow(existingId, payload) : await api.createWorkflow(payload);
      await loadWorkflows();
      setActiveWorkflow(saved);
    } catch (error) {
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : '워크플로우 저장 실패';
      enqueueToast('error', `워크플로우 저장 실패 (${message})`);
    }
  };

  const handleStartRun = async () => {
    if (!activeWorkflow) return;
    try {
      const created = await api.startRun(activeWorkflow.id);
      setRun(created);
      const data = await api.getConstellation(created.id);
      setConstellation(data);
    } catch (error) {
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : '워크플로우 실행 실패';
      enqueueToast('error', `워크플로우 실행 실패 (${message})`);
    }
  };

  const handleMalformedWebhookSimulation = async () => {
    try {
      await api.sendMalformedDevIntegrationWebhook();
      enqueueToast('warning', '웹훅 파싱 오류 시뮬레이션이 예상과 다르게 성공했습니다.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        enqueueToast('error', '웹훅 파싱 오류(422)가 감지되었습니다.');
        return;
      }
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : '웹훅 검증 요청 실패';
      enqueueToast('error', `웹훅 파싱 오류 시뮬레이션 실패 (${message})`);
    }
  };

  const refreshRunAndConstellation = async (runId: number) => {
    const [latestRun, latestConstellation] = await Promise.all([api.getRun(runId), api.getConstellation(runId)]);
    setRun(latestRun);
    setConstellation(latestConstellation);
  };

  const handleApproveHumanGate = async (nodeId: string) => {
    if (!run) return;
    try {
      const approved = await api.approveRunNode(run.id, nodeId);
      setRun(approved);
      await refreshRunAndConstellation(approved.id);
      enqueueToast('warning', `Human Gate(${nodeId}) 승인이 반영되었습니다.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setAuthModalMessage('승인 권한이 없습니다. reviewer/admin 역할과 올바른 workspace 접근 권한을 확인하세요.');
        setAuthModalOpen(true);
      }
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : 'Human Gate 승인 실패';
      enqueueToast('error', `Human Gate 승인 실패 (${message})`);
    }
  };

  const handleRejectHumanGate = async (nodeId: string) => {
    if (!run) return;
    try {
      const rejected = await api.rejectRunNode(run.id, nodeId);
      setRun(rejected);
      await refreshRunAndConstellation(rejected.id);
      enqueueToast('warning', `Human Gate(${nodeId}) 반려가 반영되었습니다.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setAuthModalMessage('반려 권한이 없습니다. reviewer/admin 역할과 올바른 workspace 접근 권한을 확인하세요.');
        setAuthModalOpen(true);
      }
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : 'Human Gate 반려 실패';
      enqueueToast('error', `Human Gate 반려 실패 (${message})`);
    }
  };

  const handleCancelRun = async () => {
    if (!run) return;
    try {
      const cancelled = await api.cancelRun(run.id);
      setRun(cancelled);
      await refreshRunAndConstellation(cancelled.id);
      enqueueToast('warning', '실행이 취소되었습니다.');
    } catch (error) {
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : '실행 취소 실패';
      enqueueToast('error', `실행 취소 실패 (${message})`);
    }
  };

  const handleCancelPendingApproval = async () => {
    if (!run || !pendingApprovalNode) return;
    try {
      const updated = await api.cancelApproval(pendingApprovalNode.id);
      setRun(updated);
      await refreshRunAndConstellation(updated.id);
      enqueueToast('warning', `승인 대기(${pendingApprovalNode.node_id})가 철회되었습니다.`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setAuthModalMessage('승인 대기 철회 권한이 없습니다. reviewer/admin 역할과 workspace 접근 권한을 확인하세요.');
        setAuthModalOpen(true);
      }
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : '승인 대기 철회 실패';
      enqueueToast('error', `승인 대기 철회 실패 (${message})`);
    }
  };

  const handleLoadArtifact = async (nodeId: string, reset: boolean) => {
    if (!run) return;
    const offset = reset || selectedArtifactNodeId !== nodeId ? 0 : artifactNextOffset;
    setArtifactLoading(true);
    try {
      const chunk = await api.getArtifactChunk(run.id, nodeId, offset, 16_384);
      setSelectedArtifactNodeId(nodeId);
      setArtifactContent((current) => (offset === 0 ? chunk.content : `${current}${chunk.content}`));
      setArtifactNextOffset(chunk.next_offset);
      setArtifactHasMore(chunk.has_more);
    } catch (error) {
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : '아티팩트 조회 실패';
      enqueueToast('error', `아티팩트 조회 실패 (${message})`);
    } finally {
      setArtifactLoading(false);
    }
  };

  const artifactNodes = useMemo(
    () => (run?.node_runs ?? []).filter((node) => node.artifact_path),
    [run?.node_runs],
  );

  useEffect(() => {
    if (!selectedArtifactNodeId || !run) return;
    if (artifactContent) return;
    void handleLoadArtifact(selectedArtifactNodeId, true);
  }, [artifactContent, run, selectedArtifactNodeId]);

  const handleInvalidWorkflowWebhookSimulation = async () => {
    try {
      const response = await api.sendDevIntegrationWebhook({
        provider: 'jenkins',
        event_type: 'ci.completed',
        workflow_id: 'invalid-id',
      });
      if (response.warning_message) {
        enqueueToast('warning', response.warning_message);
        return;
      }
      enqueueToast('warning', 'workflow_id 검증 오류를 확인하지 못했습니다.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        enqueueToast('error', 'workflow_id 검증 오류(422)가 감지되었습니다.');
        return;
      }
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : '웹훅 검증 요청 실패';
      enqueueToast('error', `workflow_id 오류 시뮬레이션 실패 (${message})`);
    }
  };

  return (
    <div className="app-shell">
      <div className="toast-stack" data-testid="toast-stack" style={{ zIndex: LAYER_Z_INDEX.toast }} aria-label="시스템 알림">
        {toasts.length + queuedToastCount > 1 && (
          <button type="button" className="toast-clear-all btn btn-ghost" onClick={clearAllToasts} aria-label="모든 알림 닫기">
            일괄 닫기
          </button>
        )}
        {toasts.map((item) => (
          <Toast key={item.id} item={item} onClose={closeToast} />
        ))}
      </div>
      <header className="top-bar">
        <button className="btn btn-ghost mobile-only" onClick={() => setNavOpen((v) => !v)}>
          메뉴
        </button>
        <h1>DevFlow Agent Hub</h1>
        <div className="top-actions">
          <span className={`live-indicator live-${streamState}`} aria-label={`실시간 연결 상태 ${streamState}`}>
            {streamStateLabel}
          </span>
          <StatusBadge status={runStatus} />
          <button className="btn btn-primary" onClick={handleStartRun} disabled={!activeWorkflow}>
            Run 시작
          </button>
        </div>
      </header>
      {streamState === 'reconnecting' && reconnectMeta && (
        <section className="network-banner" role="status" aria-live="polite">
          <strong>네트워크 복구 중</strong>
          <span className="mono">{`${(reconnectMeta.delayMs / 1000).toFixed(2)}s 후 ${reconnectMeta.attempt}회차 재연결 시도`}</span>
        </section>
      )}

      <div className="layout-grid">
        <aside className={`left-nav ${navOpen ? 'open' : ''}`}>
          <h2>Workflow 목록</h2>
          <div className="nav-list">
            {workflows.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${activeWorkflow?.id === item.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveWorkflow(item);
                  setNavOpen(false);
                }}
              >
                <strong>{item.name}</strong>
                <span>{item.description || '설명 없음'}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="main-workspace">
          <LiveRunConstellation data={constellation} />
          <Dashboard
            run={run}
            blockedEvents={blockedWebhookEvents}
            onTriggerMalformedWebhook={handleMalformedWebhookSimulation}
            onTriggerInvalidWorkflowWebhook={handleInvalidWorkflowWebhookSimulation}
            onApproveHumanGate={handleApproveHumanGate}
            onRejectHumanGate={handleRejectHumanGate}
            onCancelRun={handleCancelRun}
          />
          <WorkflowBuilder
            workflow={activeWorkflow}
            onSave={handleSaveWorkflow}
            onValidate={api.validateWorkflowGraph}
            mobileViewOnly={isMobilePortrait}
            nodeStatuses={nodeStatuses}
            onNodeFallback={({ count, signature, nodeIds }) => {
              const action = isMobilePortrait
                ? undefined
                : {
                    label: '해당 노드로 이동',
                    onClick: () => {
                      const [firstNodeId] = nodeIds;
                      if (!firstNodeId) return;
                      setFocusNodeRequest({ nodeId: firstNodeId, requestId: Date.now() });
                    },
                  };
              enqueueToast('warning', `속성 누락 노드 ${count}개가 task 타입으로 폴백되었습니다.`, {
                dedupeKey: signature,
                action,
              });
            }}
            focusNodeRequest={focusNodeRequest}
            onFocusNodeHandled={() => setFocusNodeRequest(null)}
          />
        </main>

        <aside className="right-panel">
          <section className="card">
            <div className="card-header">
              <h2>Node Detail</h2>
              <p>노드 로그와 산출물을 확인합니다.</p>
            </div>
            <details>
              <summary>실행 로그</summary>
              <pre className="log-pane mono">
                {run?.node_runs
                  .map((n) => {
                    const raw = n.log ?? '';
                    const preview = raw.length > 3000 ? `${raw.slice(0, 3000)}\n... (로그가 길어 일부만 표시)` : raw;
                    return `[${n.status}] ${n.node_name}: ${preview}`;
                  })
                  .join('\n') || '아직 로그가 없습니다.'}
              </pre>
            </details>
            <div className="artifact-list">
              {artifactNodes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`artifact-item ${selectedArtifactNodeId === n.node_id ? 'artifact-item-active' : ''}`}
                  onClick={() => {
                    void handleLoadArtifact(n.node_id, true);
                  }}
                >
                  <span>{n.node_name}</span>
                  <code>{n.artifact_path}</code>
                </button>
              ))}
            </div>
            <div className="artifact-viewer">
              <div className="artifact-viewer-header">
                <strong>아티팩트 미리보기</strong>
                {selectedArtifactNodeId && (
                  <span className="mono">node: {selectedArtifactNodeId}</span>
                )}
              </div>
              <SafeArtifactViewer
                className="log-pane mono artifact-pane safe-artifact-viewer"
                content={artifactContent}
                fallback="아티팩트를 선택하면 일부 구간부터 순차 로딩합니다."
              />
              <div className="webhook-actions-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!selectedArtifactNodeId || artifactLoading}
                  onClick={() => {
                    if (!selectedArtifactNodeId) return;
                    void handleLoadArtifact(selectedArtifactNodeId, true);
                  }}
                >
                  다시 로딩
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!selectedArtifactNodeId || !artifactHasMore || artifactLoading}
                  onClick={() => {
                    if (!selectedArtifactNodeId) return;
                    void handleLoadArtifact(selectedArtifactNodeId, false);
                  }}
                >
                  다음 청크 로딩
                </button>
              </div>
            </div>
            <div className="audit-summary">
              <div className="artifact-viewer-header">
                <strong>Human Gate 감사 로그 (`status.md`)</strong>
                <span className="mono">총 {humanGateAuditTotalCount}건</span>
              </div>
              <div className="webhook-actions-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={!run}
                  onClick={() => setHumanGateAuditModalOpen(true)}
                >
                  이력 보기
                </button>
              </div>
              <p className="mono audit-summary-line">
                {humanGateAuditsLoading
                  ? '감사 로그를 불러오는 중입니다.'
                  : humanGateAudits[0]
                    ? `${humanGateAudits[0].decision} · ${humanGateAudits[0].decided_by}`
                    : 'status.md 기준 조회 조건에 맞는 Human Gate 결정 이력이 없습니다.'}
              </p>
            </div>
            <div className="audit-summary">
              <div className="artifact-viewer-header">
                <strong>장기 미처리 Human Gate 알림</strong>
                <span className="mono">24h+ {staleHumanGateAlerts.length}건</span>
              </div>
              {staleHumanGateAlerts.length === 0 ? (
                <p className="mono audit-summary-line">현재 24시간 이상 대기 중인 승인 건이 없습니다.</p>
              ) : (
                <div className="audit-log-list">
                  {staleHumanGateAlerts.slice(0, 4).map((alert) => (
                    <article key={`${alert.run_id}:${alert.node_id}:${alert.pending_since}`} className="blocked-event-item">
                      <div className="blocked-event-head">
                        <strong className="mono">
                          run #{alert.run_id} · {alert.node_id}
                        </strong>
                        <span className="mono">{Math.floor(alert.overdue_seconds / 3600)}h 경과</span>
                      </div>
                      <p className="mono">
                        status: {alert.run_status}/{alert.node_status}
                      </p>
                      <p className="mono">{new Date(alert.pending_since).toLocaleString('ko-KR', { hour12: false })}</p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
      {authModalOpen && (
        <div className="auth-modal-backdrop" role="presentation" onClick={() => setAuthModalOpen(false)}>
          <div
            className={`auth-modal card ${isMobilePortrait ? 'sheet-modal' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="권한 안내"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>권한이 필요합니다</h2>
            <p>{authModalMessage}</p>
            <p className="mono">필요 권한: reviewer/admin · workspace membership</p>
            <div className="builder-actions">
              <button type="button" className="btn btn-primary" onClick={() => setAuthModalOpen(false)}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
      {humanGateAuditModalOpen && (
        <div className="auth-modal-backdrop" role="presentation" onClick={() => setHumanGateAuditModalOpen(false)}>
          <div
            className={`auth-modal card audit-modal ${isMobilePortrait ? 'sheet-modal' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="Human Gate 감사 로그"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Human Gate 감사 로그</h2>
            <p>`status.md` 아티팩트에서 파싱한 승인/반려 이력을 읽기 전용으로 제공합니다.</p>
            <div className="audit-controls">
              <label>
                상태 필터
                <select
                  value={humanGateAuditStatusFilter}
                  onChange={(event) => setHumanGateAuditStatusFilter(event.target.value as HumanGateAuditDecision | 'all')}
                >
                  <option value="all">전체</option>
                  <option value="approved">승인</option>
                  <option value="rejected">반려</option>
                  <option value="cancelled">철회</option>
                </select>
              </label>
              <label>
                기간 필터
                <select
                  value={humanGateAuditDateRange}
                  onChange={(event) => setHumanGateAuditDateRange(event.target.value as 'all' | '24h' | '7d' | '30d' | 'today')}
                >
                  <option value="all">전체 기간</option>
                  <option value="today">오늘</option>
                  <option value="24h">최근 24시간</option>
                  <option value="7d">최근 7일</option>
                  <option value="30d">최근 30일</option>
                </select>
              </label>
            </div>
            {humanGateAuditsLoading ? (
              <p className="mono">로딩 중...</p>
            ) : humanGateAudits.length === 0 ? (
              <p className="mono">기록이 없습니다.</p>
            ) : (
              <div className="audit-log-list">
                {humanGateAudits.map((audit) => (
                  <article key={`${audit.run_id}:${audit.node_id}:${audit.decided_at}:${audit.decision}`} className="blocked-event-item">
                    <div className="blocked-event-head">
                      <strong className="mono">{audit.decision}</strong>
                      <span className="mono">{new Date(audit.decided_at).toLocaleString('ko-KR', { hour12: false })}</span>
                    </div>
                    <p className="mono">
                      node: {audit.node_id} · by: {audit.decided_by}
                    </p>
                    <p className="mono">{JSON.stringify(audit.payload)}</p>
                  </article>
                ))}
              </div>
            )}
            <div className="audit-pagination mono">
              <span>
                {humanGateAuditTotalCount === 0
                  ? '0-0 / 0'
                  : `${humanGateAuditOffset + 1}-${Math.min(humanGateAuditOffset + humanGateAudits.length, humanGateAuditTotalCount)} / ${humanGateAuditTotalCount}`}
              </span>
              <div className="webhook-actions-row">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={humanGateAuditOffset <= 0 || humanGateAuditsLoading}
                  onClick={() => setHumanGateAuditOffset((current) => Math.max(0, current - humanGateAuditLimit))}
                >
                  이전
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={humanGateAuditOffset + humanGateAuditLimit >= humanGateAuditTotalCount || humanGateAuditsLoading}
                  onClick={() => setHumanGateAuditOffset((current) => current + humanGateAuditLimit)}
                >
                  다음
                </button>
              </div>
            </div>
            <div className="builder-actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={!pendingApprovalNode}
                onClick={() => {
                  void handleCancelPendingApproval();
                }}
              >
                승인 대기 철회
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setHumanGateAuditModalOpen(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
