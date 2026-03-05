import { useEffect, useMemo, useRef, useState } from 'react';
import Dashboard from './components/Dashboard';
import LiveRunConstellation from './components/LiveRunConstellation';
import LoopMonitorWidget from './components/LoopMonitorWidget';
import SafeArtifactViewer from './components/SafeArtifactViewer';
import StatusBadge from './components/StatusBadge';
import SystemAlertWidget from './components/SystemAlertWidget';
import Toast, { type ToastItem } from './components/Toast';
import WorkflowBuilder from './components/WorkflowBuilder';
import { useViewport } from './hooks/useViewport';
import { LAYER_Z_INDEX } from './constants/layers';
import { ApiError, api } from './services/api';
import type {
  ConstellationData,
  HumanGateAuditDecision,
  HumanGateStaleAlert,
  LoopEngineStatus,
  StatusArtifactAuditEntry,
  SystemAlertEntry,
  WebhookBlockedEvent,
  Workflow,
  WorkflowRun,
} from './types';
import { createToastId } from './utils/toastId';

const HUMAN_GATE_REJECT_PRESETS = [
  '요구사항 대비 테스트 커버리지가 부족합니다.',
  '핵심 오류가 재현되어 수정 후 재검토가 필요합니다.',
  '보안/권한 검증 근거가 부족하여 반려합니다.',
];
const RUN_SYNC_THROTTLE_MS = 180;

type LoopPendingAction = 'start' | 'pause' | 'resume' | 'stop' | 'inject' | null;
type QueueOverflowDetail = {
  instructionId: string;
  droppedReason: string;
  updatedAt: string;
} | null;

export default function App() {
  const [streamState, setStreamState] = useState<'connecting' | 'connected' | 'reconnecting' | 'closed' | 'failed'>('closed');
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
  const [systemAlerts, setSystemAlerts] = useState<SystemAlertEntry[]>([]);
  const [systemAlertsLoading, setSystemAlertsLoading] = useState(false);
  const [systemAlertsNextCursor, setSystemAlertsNextCursor] = useState<string | null>(null);
  const [systemAlertsActionLoading, setSystemAlertsActionLoading] = useState(false);
  const [loopEngineStatus, setLoopEngineStatus] = useState<LoopEngineStatus | null>(null);
  const [loopEngineActionLoading, setLoopEngineActionLoading] = useState(false);
  const [loopPendingAction, setLoopPendingAction] = useState<LoopPendingAction>(null);
  const [loopInjectInstruction, setLoopInjectInstruction] = useState('');
  const [queueOverflowDetail, setQueueOverflowDetail] = useState<QueueOverflowDetail>(null);
  const [humanGateAuditModalOpen, setHumanGateAuditModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetNodeId, setRejectTargetNodeId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('reviewer/admin 권한 또는 workspace 접근 권한이 필요합니다.');
  const [apiDegradedMessage, setApiDegradedMessage] = useState<string | null>(null);
  const viewport = useViewport();
  const isMobilePortrait = viewport.isMobile && viewport.isPortrait;
  const activeRunRef = useRef<WorkflowRun | null>(null);
  const toastsRef = useRef<ToastItem[]>([]);
  const toastQueueRef = useRef<ToastItem[]>([]);
  const dedupedToastKeysRef = useRef<Set<string>>(new Set());
  const trackedLoopInstructionIdsRef = useRef<string[]>([]);
  const notifiedDroppedInstructionIdsRef = useRef<Set<string>>(new Set());
  const pendingRunSyncIdRef = useRef<number | null>(null);
  const runSyncTimerRef = useRef<number | null>(null);
  const runSyncInFlightRef = useRef(false);
  const timezoneOffsetMinutes = useMemo(() => new Date().getTimezoneOffset(), []);

  const resolveErrorMessage = (error: unknown, fallback: string) =>
    error instanceof ApiError ? `${error.status}: ${error.detail}` : fallback;

  const markApiDegraded = (error: unknown, message: string) => {
    if (error instanceof ApiError) {
      if (error.status < 500 && error.status !== 429) return;
      setApiDegradedMessage(`${message} (${error.status}: ${error.detail})`);
      return;
    }
    setApiDegradedMessage(message);
  };

  const clearApiDegraded = () => {
    setApiDegradedMessage(null);
  };

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

  const flushRunSync = async () => {
    if (runSyncInFlightRef.current) return;
    const targetRunId = pendingRunSyncIdRef.current;
    if (!targetRunId) return;
    pendingRunSyncIdRef.current = null;
    runSyncInFlightRef.current = true;
    try {
      const [latestRun, latestConstellation] = await Promise.all([api.getRun(targetRunId), api.getConstellation(targetRunId)]);
      setRun(latestRun);
      setConstellation(latestConstellation);
      clearApiDegraded();
    } catch (error) {
      const message = resolveErrorMessage(error, '실시간 상태 동기화 실패');
      markApiDegraded(error, '서버 상태가 불안정합니다');
      enqueueToast('error', `실시간 상태 동기화 실패 (${message})`);
    } finally {
      runSyncInFlightRef.current = false;
      if (pendingRunSyncIdRef.current && runSyncTimerRef.current === null) {
        runSyncTimerRef.current = window.setTimeout(() => {
          runSyncTimerRef.current = null;
          void flushRunSync();
        }, RUN_SYNC_THROTTLE_MS);
      }
    }
  };

  const scheduleRunSync = (runId: number) => {
    pendingRunSyncIdRef.current = runId;
    if (runSyncTimerRef.current !== null || runSyncInFlightRef.current) return;
    runSyncTimerRef.current = window.setTimeout(() => {
      runSyncTimerRef.current = null;
      void flushRunSync();
    }, RUN_SYNC_THROTTLE_MS);
  };

  const loadWorkflows = async () => {
    try {
      const items = await api.listWorkflows();
      setWorkflows(items);
      if (!activeWorkflow && items.length > 0) {
        setActiveWorkflow(items[0]);
      }
      clearApiDegraded();
    } catch (error) {
      const message = resolveErrorMessage(error, '워크플로우 목록 조회 실패');
      markApiDegraded(error, '서버 상태가 불안정합니다');
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
    let cancelled = false;

    const syncLoopStatus = async () => {
      try {
        const status = await api.getLoopEngineStatus();
        if (!cancelled) {
          setLoopEngineStatus(status);
        }
      } catch {
        if (!cancelled) {
          setLoopEngineStatus(null);
        }
      }
    };

    void syncLoopStatus();
    const timer = window.setInterval(() => {
      void syncLoopStatus();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const syncSystemAlerts = async () => {
      if (!cancelled) {
        setSystemAlertsLoading(true);
      }
      try {
        const page = await api.listSystemAlerts(50, null);
        if (!cancelled) {
          setSystemAlerts(page.items);
          setSystemAlertsNextCursor(page.next_cursor);
        }
      } catch {
        if (!cancelled) {
          setSystemAlerts([]);
          setSystemAlertsNextCursor(null);
        }
      } finally {
        if (!cancelled) {
          setSystemAlertsLoading(false);
        }
      }
    };

    void syncSystemAlerts();
    const timer = window.setInterval(() => {
      void syncSystemAlerts();
    }, loopEngineStatus?.mode === 'running' ? 1_500 : 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loopEngineStatus?.mode]);

  useEffect(() => {
    let cancelled = false;

    const pollInstructionStatuses = async () => {
      const instructionIds = trackedLoopInstructionIdsRef.current;
      if (instructionIds.length === 0) return;

      const checks = await Promise.all(
        instructionIds.slice(0, 30).map(async (instructionId) => {
          try {
            const status = await api.getLoopInstructionStatus(instructionId);
            return { instructionId, status };
          } catch {
            return { instructionId, status: null };
          }
        }),
      );
      if (cancelled) return;

      const retainedInstructionIds = new Set(instructionIds);
      checks.forEach(({ instructionId, status }) => {
        if (!status) return;
        if (status.status === 'applied') {
          retainedInstructionIds.delete(instructionId);
          return;
        }
        if (status.status === 'dropped' && status.dropped_reason === 'queue_overflow') {
          retainedInstructionIds.delete(instructionId);
          if (notifiedDroppedInstructionIdsRef.current.has(instructionId)) return;
          notifiedDroppedInstructionIdsRef.current.add(instructionId);
          enqueueToast('warning', '큐 포화로 이전 지시사항 일부가 drop 처리되었습니다. 처리량을 낮추거나 재주입하세요.', {
            dedupeKey: `loop-queue-overflow-${instructionId}`,
            action: {
              label: '상세 보기',
              onClick: () =>
                setQueueOverflowDetail({
                  instructionId,
                  droppedReason: status.dropped_reason ?? 'unknown',
                  updatedAt: status.updated_at,
                }),
            },
          });
        }
      });
      trackedLoopInstructionIdsRef.current = instructionIds.filter((instructionId) => retainedInstructionIds.has(instructionId));
    };

    const timer = window.setInterval(() => {
      void pollInstructionStatuses();
    }, 1_200);
    void pollInstructionStatuses();

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
      onRunStatus: (event) => {
        const targetRunId = activeRunRef.current?.id ?? event.runs[0]?.id;
        if (!targetRunId) return;
        scheduleRunSync(targetRunId);
      },
      onError: () => {
        enqueueToast('error', '실시간 스트림 연결이 끊겨 재연결을 시도합니다.', {
          dedupeKey: 'stream-disconnect',
        });
      },
      onStateChange: (state) => {
        setStreamState(state);
        if (state === 'connected') {
          clearApiDegraded();
          return;
        }
        if (state === 'failed') {
          setApiDegradedMessage('실시간 스트림 재연결 한도를 초과했습니다. 네트워크 또는 API 서버(3100) 상태를 확인하세요.');
        }
      },
      onReconnectSchedule: (payload) => {
        setReconnectMeta(payload.attempt > 0 ? payload : null);
      },
    });

    return () => {
      unsubscribe();
      pendingRunSyncIdRef.current = null;
      runSyncInFlightRef.current = false;
      if (runSyncTimerRef.current !== null) {
        window.clearTimeout(runSyncTimerRef.current);
        runSyncTimerRef.current = null;
      }
    };
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
    if (streamState === 'failed') return '연결 실패';
    return '연결 종료';
  }, [streamState]);
  const loopModeLabel = useMemo(() => {
    if (loopEngineStatus?.mode === 'running') return '실행 중';
    if (loopEngineStatus?.mode === 'paused') return '일시정지';
    if (loopEngineStatus?.mode === 'safe_mode') return '안전 모드';
    if (loopEngineStatus?.mode === 'stopped') return '중지됨';
    return '대기 중';
  }, [loopEngineStatus?.mode]);
  const loopStageLabel = useMemo(() => {
    if (!loopEngineStatus?.current_stage) return '-';
    return loopEngineStatus.current_stage.toUpperCase();
  }, [loopEngineStatus?.current_stage]);
  const loopPendingActionLabel = useMemo(() => {
    if (loopPendingAction === 'start') return '시작';
    if (loopPendingAction === 'pause') return '일시정지';
    if (loopPendingAction === 'resume') return '재개';
    if (loopPendingAction === 'stop') return '중지';
    if (loopPendingAction === 'inject') return '지시사항 등록';
    return '명령';
  }, [loopPendingAction]);
  const nodeStatuses = useMemo(
    () =>
      Object.fromEntries(
        (run?.node_runs ?? []).map((node) => [node.node_id, node.status]),
      ),
    [run?.node_runs],
  );
  const nodeMeta = useMemo(
    () =>
      Object.fromEntries(
        (run?.node_runs ?? []).map((node) => [
          node.node_id,
          {
            attemptCount: node.attempt_count ?? 0,
            attemptLimit: node.attempt_limit ?? 1,
            errorSnippet: node.error_snippet ?? '',
          },
        ]),
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
      clearApiDegraded();
    } catch (error) {
      const message = resolveErrorMessage(error, '워크플로우 실행 실패');
      markApiDegraded(error, '서버 상태가 불안정합니다');
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
    setRejectTargetNodeId(nodeId);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleRejectReasonPreset = (preset: string) => {
    setRejectReason((current) => {
      const normalizedPreset = preset.trim();
      if (!normalizedPreset) return current;
      const hadTrailingNewline = /\r?\n\s*$/.test(current);
      const body = current.trimEnd();
      if (!body) return normalizedPreset;
      const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.includes(normalizedPreset)) return body;
      const separator = hadTrailingNewline ? '\n' : '\n\n';
      return `${body}${separator}${normalizedPreset}`;
    });
  };

  const handleSubmitRejectHumanGate = async () => {
    if (!run || !rejectTargetNodeId) return;
    setRejectSubmitting(true);
    try {
      const rejected = await api.rejectRunNode(run.id, rejectTargetNodeId);
      setRun(rejected);
      await refreshRunAndConstellation(rejected.id);
      const reasonSuffix = rejectReason.trim() ? ` 사유: ${rejectReason.trim()}` : '';
      enqueueToast('warning', `Human Gate(${rejectTargetNodeId}) 반려가 반영되었습니다.${reasonSuffix}`);
      setRejectModalOpen(false);
      setRejectTargetNodeId(null);
      setRejectReason('');
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setAuthModalMessage('반려 권한이 없습니다. reviewer/admin 역할과 올바른 workspace 접근 권한을 확인하세요.');
        setAuthModalOpen(true);
      }
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : 'Human Gate 반려 실패';
      enqueueToast('error', `Human Gate 반려 실패 (${message})`);
    } finally {
      setRejectSubmitting(false);
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

  const handleResumeRun = async () => {
    if (!run) return;
    try {
      const resumed = await api.resumeRun(run.id);
      setRun(resumed);
      await refreshRunAndConstellation(resumed.id);
      clearApiDegraded();
      enqueueToast('warning', '중단된 실행을 재개했습니다.');
    } catch (error) {
      const message = resolveErrorMessage(error, '실행 재개 실패');
      markApiDegraded(error, '서버 상태가 불안정합니다');
      enqueueToast('error', `실행 재개 실패 (${message})`);
    }
  };

  const handleRetryNode = async (nodeId: string) => {
    if (!activeWorkflow) return;
    setFocusNodeRequest({ nodeId, requestId: Date.now() });

    if (run?.status === 'paused') {
      await handleResumeRun();
      return;
    }

    try {
      const created = await api.startRun(activeWorkflow.id);
      setRun(created);
      await refreshRunAndConstellation(created.id);
      clearApiDegraded();
      enqueueToast('warning', `Retry Node 실행: ${nodeId}`);
    } catch (error) {
      const message = resolveErrorMessage(error, 'Retry Node 실행 실패');
      markApiDegraded(error, '서버 상태가 불안정합니다');
      enqueueToast('error', `Retry Node 실행 실패 (${message})`);
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
      clearApiDegraded();
    } catch (error) {
      const message = resolveErrorMessage(error, '아티팩트 조회 실패');
      markApiDegraded(error, '서버 상태가 불안정합니다');
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

  const handleLoadMoreSystemAlerts = async () => {
    if (!systemAlertsNextCursor || systemAlertsActionLoading) return;
    setSystemAlertsActionLoading(true);
    try {
      const page = await api.listSystemAlerts(50, systemAlertsNextCursor);
      setSystemAlerts((current) => [...current, ...page.items]);
      setSystemAlertsNextCursor(page.next_cursor);
    } finally {
      setSystemAlertsActionLoading(false);
    }
  };

  const handleClearAllSystemAlerts = async () => {
    if (systemAlertsActionLoading) return;
    setSystemAlertsActionLoading(true);
    try {
      await api.clearSystemAlerts();
      setSystemAlerts([]);
      setSystemAlertsNextCursor(null);
      enqueueToast('warning', '시스템 알림을 모두 비웠습니다.');
    } catch (error) {
      const message = resolveErrorMessage(error, '시스템 알림 초기화 실패');
      enqueueToast('error', `시스템 알림 초기화 실패 (${message})`);
    } finally {
      setSystemAlertsActionLoading(false);
    }
  };

  const handleExportSystemAlerts = () => {
    if (systemAlerts.length === 0) return;
    const payload = {
      exported_at: new Date().toISOString(),
      count: systemAlerts.length,
      items: systemAlerts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `system-alerts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    enqueueToast('warning', `시스템 알림 ${systemAlerts.length}건을 내보냈습니다.`);
  };

  const syncLoopEngineStatus = async () => {
    try {
      const next = await api.getLoopEngineStatus();
      setLoopEngineStatus(next);
    } catch {
      setLoopEngineStatus(null);
    }
  };

  const handleStartLoopEngine = async () => {
    if (loopEngineActionLoading) return;
    setLoopPendingAction('start');
    setLoopEngineActionLoading(true);
    try {
      const next = await api.startLoopEngine();
      setLoopEngineStatus(next);
      enqueueToast('warning', 'Loop Engine을 시작했습니다.');
    } catch (error) {
      const message = resolveErrorMessage(error, 'Loop Engine 시작 실패');
      enqueueToast('error', `Loop Engine 시작 실패 (${message})`);
    } finally {
      setLoopEngineActionLoading(false);
      setLoopPendingAction(null);
      void syncLoopEngineStatus();
    }
  };

  const handlePauseLoopEngine = async () => {
    if (loopEngineActionLoading) return;
    setLoopPendingAction('pause');
    setLoopEngineActionLoading(true);
    try {
      const next = await api.pauseLoopEngine();
      setLoopEngineStatus(next);
      enqueueToast('warning', 'Loop Engine을 일시정지했습니다.');
    } catch (error) {
      const message = resolveErrorMessage(error, 'Loop Engine 일시정지 실패');
      enqueueToast('error', `Loop Engine 일시정지 실패 (${message})`);
    } finally {
      setLoopEngineActionLoading(false);
      setLoopPendingAction(null);
      void syncLoopEngineStatus();
    }
  };

  const handleStopLoopEngine = async () => {
    if (loopEngineActionLoading) return;
    setLoopPendingAction('stop');
    setLoopEngineActionLoading(true);
    try {
      const next = await api.stopLoopEngine();
      setLoopEngineStatus(next);
      enqueueToast('warning', 'Loop Engine을 중지했습니다.');
    } catch (error) {
      const message = resolveErrorMessage(error, 'Loop Engine 중지 실패');
      enqueueToast('error', `Loop Engine 중지 실패 (${message})`);
    } finally {
      setLoopEngineActionLoading(false);
      setLoopPendingAction(null);
      void syncLoopEngineStatus();
    }
  };

  const handleResumeLoopEngine = async () => {
    if (loopEngineActionLoading) return;
    setLoopPendingAction('resume');
    setLoopEngineActionLoading(true);
    try {
      const next = await api.resumeLoopEngine();
      setLoopEngineStatus(next);
      enqueueToast('warning', 'Loop Engine을 재개했습니다.');
    } catch (error) {
      const message = resolveErrorMessage(error, 'Loop Engine 재개 실패');
      enqueueToast('error', `Loop Engine 재개 실패 (${message})`);
    } finally {
      setLoopEngineActionLoading(false);
      setLoopPendingAction(null);
      void syncLoopEngineStatus();
    }
  };

  const handleInjectLoopInstruction = async () => {
    const instruction = loopInjectInstruction.trim();
    if (!instruction || loopEngineActionLoading) return;
    setLoopPendingAction('inject');
    setLoopEngineActionLoading(true);
    try {
      const queued = await api.injectLoopInstruction(instruction);
      setLoopEngineStatus(queued.status);
      setLoopInjectInstruction('');
      trackedLoopInstructionIdsRef.current = [...trackedLoopInstructionIdsRef.current, queued.instruction_id].slice(-40);
      enqueueToast('warning', `Inject Instruction을 큐에 등록했습니다. (${queued.instruction_id})`);
    } catch (error) {
      const message = resolveErrorMessage(error, 'Inject Instruction 등록 실패');
      enqueueToast('error', `Inject Instruction 등록 실패 (${message})`);
    } finally {
      setLoopEngineActionLoading(false);
      setLoopPendingAction(null);
      void syncLoopEngineStatus();
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
      {apiDegradedMessage && (
        <section className="network-banner network-banner-danger" role="alert">
          <strong>서버 상태가 불안정합니다</strong>
          <span className="mono">{apiDegradedMessage}</span>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              void loadWorkflows();
            }}
          >
            다시 시도
          </button>
        </section>
      )}
      {streamState === 'reconnecting' && reconnectMeta && (
        <section className="network-banner" role="status" aria-live="polite">
          <strong>네트워크 복구 중</strong>
          <span className="mono">{`${(reconnectMeta.delayMs / 1000).toFixed(2)}s 후 ${reconnectMeta.attempt}회차 재연결 시도`}</span>
        </section>
      )}
      {streamState === 'failed' && (
        <section className="network-banner network-banner-danger" role="alert" aria-live="assertive">
          <strong>서버 통신 실패</strong>
          <span className="mono">SSE 재연결 5회 초과로 자동 재시도를 중단했습니다. 네트워크 또는 API 서버(3100)를 확인하세요.</span>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              void loadWorkflows();
            }}
          >
            수동 재시도
          </button>
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
          <section className="card loop-engine-card" aria-label="loop-engine-control">
            <div className="card-header">
              <h2>Self-Improvement Loop Engine</h2>
              <p>Analyzer → Evaluator → Planner → Executor 순환 상태를 제어하고 모니터링합니다.</p>
            </div>
            <div className="loop-engine-summary mono">
              <span className={`loop-engine-mode loop-mode-${loopEngineStatus?.mode ?? 'idle'}`}>상태: {loopModeLabel}</span>
              <span>Stage: {loopStageLabel}</span>
              <span>Cycle: {loopEngineStatus?.cycle_count ?? 0}</span>
              <span>Quality: {loopEngineStatus?.quality_score ?? '-'}</span>
              <span>Events: {loopEngineStatus?.emitted_alert_count ?? 0}</span>
              <span>Queued: {loopEngineStatus?.pending_instruction_count ?? 0}</span>
            </div>
            <div className="loop-engine-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  void handleStartLoopEngine();
                }}
                disabled={loopEngineActionLoading || loopEngineStatus?.mode === 'running'}
              >
                시작
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void handlePauseLoopEngine();
                }}
                disabled={loopEngineActionLoading || loopEngineStatus?.mode !== 'running'}
              >
                일시정지
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void handleResumeLoopEngine();
                }}
                disabled={loopEngineActionLoading || loopEngineStatus?.mode !== 'paused'}
              >
                재개
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  void handleStopLoopEngine();
                }}
                disabled={loopEngineActionLoading || !loopEngineStatus || loopEngineStatus.mode === 'idle'}
              >
                중지
              </button>
            </div>
            {loopEngineActionLoading && (
              <p className="loop-engine-pending mono" role="status" aria-live="polite">
                <span className="loop-engine-spinner" aria-hidden />
                {loopPendingActionLabel} 요청 처리 중...
              </p>
            )}
            <form
              className="loop-engine-inject"
              onSubmit={(event) => {
                event.preventDefault();
                void handleInjectLoopInstruction();
              }}
            >
              <label htmlFor="loop-instruction-input" className="mono">
                Inject Instruction
              </label>
              <div className="loop-engine-inject-row">
                <input
                  id="loop-instruction-input"
                  value={loopInjectInstruction}
                  onChange={(event) => setLoopInjectInstruction(event.target.value)}
                  maxLength={2000}
                  placeholder="예: 동일 실패가 반복되면 자동 일시정지로 전환"
                  disabled={loopEngineActionLoading}
                />
                <button
                  type="submit"
                  className="btn btn-ghost"
                  disabled={loopEngineActionLoading || loopInjectInstruction.trim().length === 0}
                >
                  등록
                </button>
              </div>
            </form>
          </section>
          <LoopMonitorWidget status={loopEngineStatus} run={run} />
          <SystemAlertWidget
            alerts={systemAlerts}
            loading={systemAlertsLoading}
            hasMore={!!systemAlertsNextCursor}
            processingAction={systemAlertsActionLoading}
            onLoadMore={() => {
              void handleLoadMoreSystemAlerts();
            }}
            onClearAll={() => {
              void handleClearAllSystemAlerts();
            }}
            onExport={handleExportSystemAlerts}
          />
          <Dashboard
            run={run}
            blockedEvents={blockedWebhookEvents}
            onTriggerMalformedWebhook={handleMalformedWebhookSimulation}
            onTriggerInvalidWorkflowWebhook={handleInvalidWorkflowWebhookSimulation}
            onApproveHumanGate={handleApproveHumanGate}
            onRejectHumanGate={handleRejectHumanGate}
            onCancelRun={handleCancelRun}
            onResumeRun={handleResumeRun}
            onRetryNode={handleRetryNode}
          />
          <WorkflowBuilder
            workflow={activeWorkflow}
            onSave={handleSaveWorkflow}
            onValidate={api.validateWorkflowGraph}
            mobileViewOnly={isMobilePortrait}
            nodeStatuses={nodeStatuses}
            nodeMeta={nodeMeta}
            onRetryNode={(nodeId) => {
              void handleRetryNode(nodeId);
            }}
            onClientValidationError={(message) => {
              enqueueToast('error', message);
            }}
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
                hasMore={artifactHasMore}
                isLoading={artifactLoading}
                onLoadMore={() => {
                  if (!selectedArtifactNodeId) return;
                  void handleLoadArtifact(selectedArtifactNodeId, false);
                }}
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
      {queueOverflowDetail && (
        <div className="auth-modal-backdrop" role="presentation" onClick={() => setQueueOverflowDetail(null)}>
          <div
            className={`auth-modal card ${isMobilePortrait ? 'sheet-modal' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="큐 오버플로우 상세"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>큐 오버플로우 상세</h2>
            <p>루프 지시사항 큐가 포화되어 일부 항목이 drop 처리되었습니다.</p>
            <p className="mono">instruction_id: {queueOverflowDetail.instructionId}</p>
            <p className="mono">reason: {queueOverflowDetail.droppedReason}</p>
            <p className="mono">updated_at: {queueOverflowDetail.updatedAt}</p>
            <div className="builder-actions">
              <button type="button" className="btn btn-primary" onClick={() => setQueueOverflowDetail(null)}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
      {rejectModalOpen && (
        <div className="auth-modal-backdrop" role="presentation" onClick={() => setRejectModalOpen(false)}>
          <div
            className={`auth-modal card ${isMobilePortrait ? 'sheet-modal' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="Human Gate 반려 사유"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Human Gate 반려 사유</h2>
            <p className="mono">대상 노드: {rejectTargetNodeId ?? '-'}</p>
            <div className="webhook-actions-row reject-preset-row">
              {HUMAN_GATE_REJECT_PRESETS.map((preset, idx) => (
                <button
                  key={preset}
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleRejectReasonPreset(preset)}
                >
                  프리셋 {idx + 1}
                </button>
              ))}
            </div>
            <label className="reject-reason-field">
              반려 사유
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="반려 사유를 작성하세요. 프리셋 클릭 시 기존 텍스트 뒤에 추가됩니다."
                rows={5}
              />
            </label>
            <div className="builder-actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={rejectSubmitting}
                onClick={() => {
                  void handleSubmitRejectHumanGate();
                }}
              >
                {rejectSubmitting ? '반려 처리 중...' : '반려 실행'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setRejectModalOpen(false)}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
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
