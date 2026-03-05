import type { LoopEngineStatus, WorkflowRun } from '../types';

const DEFAULT_MAX_LOOP_COUNT = 120;

function resolveCurrentTask(run: WorkflowRun | null): string {
  if (!run) return '대기 중';
  const running = run.node_runs.find((node) => node.status === 'running');
  if (running) return `${running.node_name} (${running.node_id})`;
  const queued = run.node_runs.find((node) => node.status === 'queued');
  if (queued) return `${queued.node_name} (${queued.node_id})`;
  return run.status === 'done' ? '완료됨' : '대기 중';
}

function resolveQualityTone(score: number | null): 'good' | 'warn' | 'bad' | 'unknown' {
  if (typeof score !== 'number') return 'unknown';
  if (score >= 75) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

export default function LoopMonitorWidget({
  status,
  run,
  maxLoopCount = DEFAULT_MAX_LOOP_COUNT,
}: {
  status: LoopEngineStatus | null;
  run: WorkflowRun | null;
  maxLoopCount?: number;
}) {
  const cycleCount = status?.cycle_count ?? 0;
  const loopOverrunCount = Math.max(0, cycleCount - maxLoopCount);
  const remainingLoopCount = Math.max(0, maxLoopCount - cycleCount);
  const qualityScore = status?.quality_score ?? null;
  const qualityTone = resolveQualityTone(qualityScore);
  const qualityWidth = qualityScore === null ? 0 : Math.max(0, Math.min(100, qualityScore));
  const currentTask = resolveCurrentTask(run);
  const isOverrun = loopOverrunCount > 0;

  return (
    <section className="card loop-monitor-widget" aria-label="loop-monitor-widget">
      <div className="card-header">
        <h2>Loop Monitor</h2>
        <p>핵심 품질 지표와 현재 실행 Task를 모바일 우선으로 확인합니다.</p>
      </div>
      <div className="loop-monitor-grid">
        <article className="loop-monitor-panel">
          <span className="loop-monitor-label">Quality Score</span>
          <strong className={`loop-monitor-score loop-monitor-score-${qualityTone}`}>{qualityScore ?? '-'}</strong>
          <div className="loop-monitor-quality-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={qualityScore ?? 0}>
            <div className={`loop-monitor-quality-fill loop-monitor-quality-fill-${qualityTone}`} style={{ width: `${qualityWidth}%` }} />
          </div>
        </article>
        <article className="loop-monitor-panel">
          <span className="loop-monitor-label">Remaining Loops</span>
          <strong className={`loop-monitor-value mono ${isOverrun ? 'loop-monitor-value-overrun' : ''}`}>
            {isOverrun ? `+${loopOverrunCount}` : remainingLoopCount}
          </strong>
          <p className={`loop-monitor-meta mono ${isOverrun ? 'loop-monitor-meta-overrun' : ''}`}>
            max_loop_count={maxLoopCount} · cycle={cycleCount}
            {isOverrun ? ` · overrun=+${loopOverrunCount}` : ''}
          </p>
        </article>
        <article className="loop-monitor-panel loop-monitor-panel-wide">
          <span className="loop-monitor-label">Current Task</span>
          <strong className="loop-monitor-task mono">{currentTask}</strong>
          <p className="loop-monitor-meta mono">stage={status?.current_stage?.toUpperCase() ?? '-'} · mode={status?.mode ?? 'idle'}</p>
        </article>
      </div>
    </section>
  );
}
