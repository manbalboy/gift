import StatusBadge from './StatusBadge';
import type { WebhookBlockedEvent, WorkflowRun } from '../types';

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

export default function Dashboard({
  run,
  blockedEvents,
  onTriggerMalformedWebhook,
  onTriggerInvalidWorkflowWebhook,
  onApproveHumanGate,
  onRejectHumanGate,
  onCancelRun,
  onResumeRun,
  onRetryNode,
}: {
  run: WorkflowRun | null;
  blockedEvents?: WebhookBlockedEvent[];
  onTriggerMalformedWebhook?: () => Promise<void>;
  onTriggerInvalidWorkflowWebhook?: () => Promise<void>;
  onApproveHumanGate?: (nodeId: string) => Promise<void>;
  onRejectHumanGate?: (nodeId: string) => Promise<void>;
  onCancelRun?: () => Promise<void>;
  onResumeRun?: () => Promise<void>;
  onRetryNode?: (nodeId: string) => Promise<void>;
}) {
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
  const pendingApproval = nodeRuns.find((node) => node.status === 'approval_pending') ?? null;
  const failedNode = nodeRuns.find((node) => node.status === 'failed') ?? null;
  const recentBlockedEvents = blockedEvents ?? [];

  return (
    <section className="card">
      <div className="card-header">
        <h2>Run Timeline & KPI</h2>
        <p>현재 상태, 다음 액션, 장애 지점을 한 번에 확인합니다.</p>
      </div>
      {run ? (
        <>
          {run.status === 'paused' && (
            <section className="pause-alert" role="status" aria-live="polite">
              <div>
                <strong>실행 일시정지 감지</strong>
                <p className="mono">보호 로직으로 중단되었습니다. 원인 확인 후 재개하세요.</p>
              </div>
              <button
                className="btn btn-warning"
                type="button"
                onClick={() => {
                  void onResumeRun?.();
                }}
              >
                Run 재개
              </button>
            </section>
          )}
          {failedNode && (
            <section className="failed-alert" role="alert" aria-live="assertive">
              <div>
                <strong>실행 실패 감지</strong>
                <p className="mono">node={failedNode.node_id} · 즉시 재시도로 복구를 시도하세요.</p>
                <p className="mono">{`Attempt ${failedNode.attempt_count ?? 0}/${failedNode.attempt_limit ?? 1}`}</p>
                {(failedNode.error_snippet ?? '').trim() && (
                  <pre className="mono failed-snippet">{failedNode.error_snippet}</pre>
                )}
              </div>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  void onRetryNode?.(failedNode.node_id);
                }}
              >
                Retry Node
              </button>
            </section>
          )}
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
      <section className="webhook-actions" aria-label="run-control-actions">
        <h3>Run 제어</h3>
        <p>승인 대기 노드와 실행 취소를 즉시 처리합니다.</p>
        <div className="webhook-actions-row">
          <button
            className="btn btn-ghost"
            type="button"
            disabled={!pendingApproval}
            onClick={() => {
              if (!pendingApproval) return;
              void onApproveHumanGate?.(pendingApproval.node_id);
            }}
          >
            Human Gate 승인
          </button>
          <button
            className="btn btn-ghost btn-danger"
            type="button"
            disabled={!pendingApproval}
            onClick={() => {
              if (!pendingApproval) return;
              void onRejectHumanGate?.(pendingApproval.node_id);
            }}
          >
            Human Gate 반려
          </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={!run || ['done', 'failed', 'cancelled', 'blocked'].includes(run.status)}
              onClick={() => {
                void onCancelRun?.();
              }}
            >
            Run 취소
          </button>
          <button
            className="btn btn-warning"
            type="button"
            disabled={!run || run.status !== 'paused'}
            onClick={() => {
              void onResumeRun?.();
            }}
          >
            Run 재개
          </button>
        </div>
      </section>
      <section className="webhook-actions" aria-label="webhook-feedback-actions">
        <h3>Webhook 피드백 검증</h3>
        <p>파싱 오류(422)와 workflow_id 검증 오류를 즉시 확인합니다.</p>
        <div className="webhook-actions-row">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              void onTriggerMalformedWebhook?.();
            }}
          >
            파싱 오류 시뮬레이션
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              void onTriggerInvalidWorkflowWebhook?.();
            }}
          >
            workflow_id 오류 시뮬레이션
          </button>
        </div>
      </section>
      <section className="webhook-actions" aria-label="webhook-blocked-events">
        <h3>Webhook 차단 로그</h3>
        <p>인가되지 않은 접근 또는 서명 오류를 실시간으로 확인합니다.</p>
        {recentBlockedEvents.length === 0 ? (
          <p className="empty">최근 차단 이벤트가 없습니다.</p>
        ) : (
          <div className="blocked-event-list">
            {recentBlockedEvents.slice(0, 6).map((event) => (
              <article key={event.id} className="blocked-event-item">
                <div className="blocked-event-head">
                  <strong className="mono">{event.reason}</strong>
                  <span className="mono">{new Date(event.created_at).toLocaleTimeString('ko-KR', { hour12: false })}</span>
                </div>
                <p className="mono">{event.detail}</p>
                <p className="mono">
                  {event.provider} · {event.event_type} · {event.client_ip}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
