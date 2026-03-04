import StatusBadge from './StatusBadge';
import type { WorkflowRun } from '../types';

function toMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDuration(totalMs: number): string {
  const seconds = Math.max(0, Math.floor(totalMs / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function Dashboard({ run }: { run: WorkflowRun | null }) {
  const nodeRuns = run?.node_runs ?? [];
  const doneCount = nodeRuns.filter((n) => n.status === 'done').length;
  const failedCount = nodeRuns.filter((n) => n.status === 'failed').length;
  const runningCount = nodeRuns.filter((n) => n.status === 'running').length;
  const totalCount = nodeRuns.length;

  const leadTimeMs =
    run && run.started_at && run.updated_at ? Math.max(0, toMs(run.updated_at) - toMs(run.started_at)) : 0;

  const testNodes = nodeRuns.filter((node) => /test/i.test(node.node_id) || /test/i.test(node.node_name));
  const testPassed = testNodes.filter((node) => node.status === 'done').length;
  const testPassRate = testNodes.length > 0 ? Math.round((testPassed / testNodes.length) * 100) : null;

  const bottleneckNode =
    nodeRuns.find((node) => node.status === 'failed') ??
    nodeRuns.find((node) => node.status === 'running') ??
    nodeRuns.find((node) => node.status === 'queued') ??
    null;

  const completionRate = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <section className="card">
      <div className="card-header">
        <h2>Run Timeline & KPI</h2>
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
              <span>Lead Time</span>
              <strong>{formatDuration(leadTimeMs)}</strong>
            </article>
            <article>
              <span>테스트 통과율</span>
              <strong>{testPassRate === null ? 'N/A' : `${testPassRate}%`}</strong>
            </article>
            <article>
              <span>완료율</span>
              <strong>{completionRate}%</strong>
            </article>
            <article>
              <span>실패 노드</span>
              <strong>{failedCount}</strong>
            </article>
            <article>
              <span>실행 중 노드</span>
              <strong>{runningCount}</strong>
            </article>
            <article>
              <span>병목 노드</span>
              <strong className="mono">{bottleneckNode ? bottleneckNode.node_id : '없음'}</strong>
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
