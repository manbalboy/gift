import { useEffect, useMemo, useRef, useState } from 'react';
import Dashboard from './components/Dashboard';
import LiveRunConstellation from './components/LiveRunConstellation';
import StatusBadge from './components/StatusBadge';
import Toast, { type ToastItem } from './components/Toast';
import WorkflowBuilder from './components/WorkflowBuilder';
import { LAYER_Z_INDEX } from './constants/layers';
import { ApiError, api } from './services/api';
import type { ConstellationData, Workflow, WorkflowRun } from './types';
import { createToastId } from './utils/toastId';

function useIsMobilePortrait() {
  const query = '(max-width: 767px) and (orientation: portrait)';
  const [isMobilePortrait, setIsMobilePortrait] = useState<boolean>(window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = () => setIsMobilePortrait(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  return isMobilePortrait;
}

export default function App() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [constellation, setConstellation] = useState<ConstellationData | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [focusNodeRequest, setFocusNodeRequest] = useState<{ nodeId: string; requestId: number } | null>(null);
  const isMobilePortrait = useIsMobilePortrait();
  const activeRunRef = useRef<WorkflowRun | null>(null);
  const toastsRef = useRef<ToastItem[]>([]);
  const dedupedToastKeysRef = useRef<Set<string>>(new Set());

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
    const next = [
      ...toastsRef.current,
      { id: createToastId(), level, message, dedupeKey: options?.dedupeKey, action: options?.action },
    ];
    const overflowCount = Math.max(0, next.length - 3);
    if (overflowCount > 0) {
      next.slice(0, overflowCount).forEach((toast) => {
        if (toast.dedupeKey) {
          dedupedToastKeysRef.current.delete(toast.dedupeKey);
        }
      });
    }
    const trimmed = next.slice(-3);
    toastsRef.current = trimmed;
    setToasts(trimmed);
  };

  const closeToast = (id: string) => {
    const target = toastsRef.current.find((toast) => toast.id === id);
    if (target?.dedupeKey) {
      dedupedToastKeysRef.current.delete(target.dedupeKey);
    }
    const next = toastsRef.current.filter((toast) => toast.id !== id);
    toastsRef.current = next;
    setToasts(next);
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
    activeRunRef.current = run;
  }, [run]);

  useEffect(() => {
    toastsRef.current = toasts;
    dedupedToastKeysRef.current = new Set(
      toasts
        .map((toast) => toast.dedupeKey)
        .filter((key): key is string => Boolean(key)),
    );
  }, [toasts]);

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
        enqueueToast('error', '실시간 스트림 연결이 끊겼습니다.');
      },
    });

    return unsubscribe;
  }, [activeWorkflow?.id]);

  const runStatus = useMemo(() => run?.status ?? 'queued', [run?.status]);
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

  const handleInvalidWorkflowWebhookSimulation = async () => {
    try {
      const response = await api.sendDevIntegrationWebhook({
        provider: 'jenkins',
        event_type: 'ci.completed',
        workflow_id: 'invalid-id',
      });
      if (response.warning_code === 'workflow_id_ignored') {
        enqueueToast('warning', response.warning_message ?? 'workflow_id 예외 데이터가 감지되어 무시되었습니다.');
        return;
      }
      enqueueToast('warning', 'workflow_id 예외 경고를 확인하지 못했습니다.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        enqueueToast('error', 'workflow_id 검증 오류(422)가 감지되었습니다.');
        return;
      }
      const message = error instanceof ApiError ? `${error.status}: ${error.detail}` : '웹훅 검증 요청 실패';
      enqueueToast('error', `workflow_id 경고 시뮬레이션 실패 (${message})`);
    }
  };

  return (
    <div className="app-shell">
      <div className="toast-stack" data-testid="toast-stack" style={{ zIndex: LAYER_Z_INDEX.toast }} aria-label="시스템 알림">
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
          <StatusBadge status={runStatus} />
          <button className="btn btn-primary" onClick={handleStartRun} disabled={!activeWorkflow}>
            Run 시작
          </button>
        </div>
      </header>

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
            onTriggerMalformedWebhook={handleMalformedWebhookSimulation}
            onTriggerInvalidWorkflowWebhook={handleInvalidWorkflowWebhookSimulation}
          />
          <WorkflowBuilder
            workflow={activeWorkflow}
            onSave={handleSaveWorkflow}
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
{run?.node_runs.map((n) => `[${n.status}] ${n.node_name}: ${n.log}`).join('\n') || '아직 로그가 없습니다.'}
              </pre>
            </details>
            <div className="artifact-list">
              {(run?.node_runs ?? [])
                .filter((n) => n.artifact_path)
                .map((n) => (
                  <div key={n.id} className="artifact-item">
                    <span>{n.node_name}</span>
                    <code>{n.artifact_path}</code>
                  </div>
                ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
