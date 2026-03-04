import StatusBadge from './StatusBadge';
import type { WorkflowRun } from '../types';

export default function Dashboard({ run }: { run: WorkflowRun | null }) {
  const nodeRuns = run?.node_runs ?? [];

  return (
    <section className="card">
      <div className="card-header">
        <h2>Run Timeline</h2>
        <p>현재 상태, 다음 액션, 장애 지점을 한 번에 확인합니다.</p>
      </div>
      {run ? (
        <>
          <div className="run-kpi-grid">
            <article>
              <span>Run ID</span>
              <strong className="mono">#{run.id}</strong>
            </article>
            <article>
              <span>전체 상태</span>
              <StatusBadge status={run.status} />
            </article>
            <article>
              <span>완료 노드</span>
              <strong>{nodeRuns.filter((n) => n.status === 'done').length}</strong>
            </article>
            <article>
              <span>실패 노드</span>
              <strong>{nodeRuns.filter((n) => n.status === 'failed').length}</strong>
            </article>
          </div>
          <div className="run-list">
            {nodeRuns.map((node) => (
              <div className="run-row" key={node.id}>
                <div>
                  <strong>{node.node_name}</strong>
                  <p className="mono">{node.node_id}</p>
                </div>
                <StatusBadge status={node.status} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="empty">워크플로우 실행을 시작하면 실시간 상태가 표시됩니다.</p>
      )}
    </section>
  );
}
