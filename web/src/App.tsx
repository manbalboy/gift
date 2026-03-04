import { useEffect, useMemo, useState } from 'react';
import Dashboard from './components/Dashboard';
import LiveRunConstellation from './components/LiveRunConstellation';
import StatusBadge from './components/StatusBadge';
import WorkflowBuilder from './components/WorkflowBuilder';
import { api } from './services/api';
import type { ConstellationData, Workflow, WorkflowRun } from './types';

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
  const isMobilePortrait = useIsMobilePortrait();

  const loadWorkflows = async () => {
    const items = await api.listWorkflows();
    setWorkflows(items);
    if (!activeWorkflow && items.length > 0) {
      setActiveWorkflow(items[0]);
    }
  };

  useEffect(() => {
    void loadWorkflows();
  }, []);

  useEffect(() => {
    if (!run) return;

    const timer = setInterval(async () => {
      const [latestRun, latestConstellation] = await Promise.all([api.getRun(run.id), api.getConstellation(run.id)]);
      setRun(latestRun);
      setConstellation(latestConstellation);
    }, 1500);

    return () => clearInterval(timer);
  }, [run?.id]);

  const runStatus = useMemo(() => run?.status ?? 'queued', [run?.status]);

  const handleSaveWorkflow = async (payload: Omit<Workflow, 'id'>, existingId?: number) => {
    const saved = existingId ? await api.updateWorkflow(existingId, payload) : await api.createWorkflow(payload);
    await loadWorkflows();
    setActiveWorkflow(saved);
  };

  const handleStartRun = async () => {
    if (!activeWorkflow) return;
    const created = await api.startRun(activeWorkflow.id);
    setRun(created);
    const data = await api.getConstellation(created.id);
    setConstellation(data);
  };

  return (
    <div className="app-shell">
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
          <Dashboard run={run} />
          <WorkflowBuilder workflow={activeWorkflow} onSave={handleSaveWorkflow} mobileViewOnly={isMobilePortrait} />
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
