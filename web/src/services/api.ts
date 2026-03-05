import type {
  ArtifactChunkResponse,
  ConstellationData,
  HumanGateAuditDecision,
  HumanGateStaleAlert,
  LoopInstructionEnqueueResult,
  LoopInstructionStatus,
  LoopEngineStatus,
  SystemAlertPageResponse,
  StatusArtifactAuditListResponse,
  WebhookBlockedEvent,
  Workflow,
  WorkflowGraphValidationResult,
  WorkflowRun,
  WorkflowRunsStreamEvent,
} from '../types';
import { subscribeSSE } from '../hooks/useSSE';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3100/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');
const WORKFLOW_CONTROL_TOKEN = import.meta.env.VITE_WORKFLOW_CONTROL_TOKEN ?? '';
const WORKFLOW_CONTROL_ROLE = import.meta.env.VITE_WORKFLOW_CONTROL_ROLE ?? '';

export class ApiError extends Error {
  readonly status: number;

  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`API Error: ${status} ${detail}`);
    this.status = status;
    this.detail = detail;
  }
}

type WebhookResponse = {
  accepted: boolean;
  provider: string;
  category: string;
  event_type: string;
  workflow_id: number | null;
  warning_code: string | null;
  warning_message: string | null;
  triggered: boolean;
  triggered_run_id: number | null;
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });

  if (!response.ok) {
    let detail = response.statusText || 'request failed';
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        detail = payload.detail;
      }
    } catch {
      // Fallback to status text.
    }
    throw new ApiError(response.status, detail);
  }

  return response.json() as Promise<T>;
}

async function requestHumanGateAction(path: string): Promise<WorkflowRun> {
  try {
    return await request<WorkflowRun>(path, { method: 'POST' });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
    await request<{ ok: boolean }>('/workflows/auth/human-gate-session', { method: 'POST' });
    return request<WorkflowRun>(path, { method: 'POST' });
  }
}

function workflowControlHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (WORKFLOW_CONTROL_TOKEN.trim()) {
    headers['X-Workflow-Control-Token'] = WORKFLOW_CONTROL_TOKEN.trim();
  }
  if (WORKFLOW_CONTROL_ROLE.trim()) {
    headers['X-Workflow-Control-Role'] = WORKFLOW_CONTROL_ROLE.trim();
  }
  return headers;
}

export const api = {
  listWorkflows: () => request<Workflow[]>('/workflows'),
  createWorkflow: (payload: Omit<Workflow, 'id'>) =>
    request<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(payload) }),
  updateWorkflow: (id: number, payload: Omit<Workflow, 'id'>) =>
    request<Workflow>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  validateWorkflowGraph: (graph: Workflow['graph']) =>
    request<WorkflowGraphValidationResult>('/workflows/validate', { method: 'POST', body: JSON.stringify(graph) }),
  startRun: (workflowId: number) =>
    request<WorkflowRun>(`/workflows/${workflowId}/runs`, { method: 'POST', headers: workflowControlHeaders() }),
  getRun: (runId: number) => request<WorkflowRun>(`/runs/${runId}`),
  getConstellation: (runId: number) => request<ConstellationData>(`/runs/${runId}/constellation`),
  approveRunNode: (runId: number, nodeId: string) =>
    requestHumanGateAction(`/runs/${runId}/approve?node_id=${encodeURIComponent(nodeId)}`),
  rejectRunNode: (runId: number, nodeId: string) =>
    requestHumanGateAction(`/runs/${runId}/reject?node_id=${encodeURIComponent(nodeId)}`),
  cancelRun: (runId: number) => request<WorkflowRun>(`/runs/${runId}/cancel`, { method: 'POST', headers: workflowControlHeaders() }),
  resumeRun: (runId: number) => request<WorkflowRun>(`/runs/${runId}/resume`, { method: 'POST', headers: workflowControlHeaders() }),
  getArtifactChunk: (runId: number, nodeId: string, offset = 0, limit = 16384) =>
    request<ArtifactChunkResponse>(
      `/runs/${runId}/artifacts/${encodeURIComponent(nodeId)}?offset=${Math.max(0, offset)}&limit=${Math.max(1, limit)}`,
    ),
  sendDevIntegrationWebhook: (payload: unknown) =>
    request<WebhookResponse>('/webhooks/dev-integration', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  sendMalformedDevIntegrationWebhook: async () => {
    const response = await fetch(`${API_BASE}/webhooks/dev-integration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{"provider":"jenkins"',
    });

    if (!response.ok) {
      let detail = response.statusText || 'request failed';
      try {
        const payload = (await response.json()) as { detail?: string };
        if (payload.detail) {
          detail = payload.detail;
        }
      } catch {
        // Fallback to status text.
      }
      throw new ApiError(response.status, detail);
    }

    return response.json() as Promise<WebhookResponse>;
  },
  subscribeWorkflowRuns: (
    workflowId: number,
    handlers: {
      onRunStatus: (payload: WorkflowRunsStreamEvent) => void;
      onError?: (event: Event) => void;
      onStateChange?: (state: 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'failed') => void;
      onReconnectSchedule?: (payload: { attempt: number; delayMs: number }) => void;
    },
  ) => {
    return subscribeSSE<WorkflowRunsStreamEvent>({
      buildUrl: (lastEventId) => {
        const params = new URLSearchParams();
        params.set('max_ticks', '600');
        if (lastEventId) {
          params.set('last_event_id', lastEventId);
        }
        return `${API_ORIGIN}/api/workflows/${workflowId}/runs/stream?${params.toString()}`;
      },
      eventName: 'run_status',
      parse: (raw) => JSON.parse(raw) as WorkflowRunsStreamEvent,
      onEvent: handlers.onRunStatus,
      onError: handlers.onError,
      onStateChange: handlers.onStateChange,
      onReconnectSchedule: handlers.onReconnectSchedule,
    });
  },
  listWebhookBlockedEvents: (limit = 20) =>
    request<WebhookBlockedEvent[]>(`/webhooks/blocked-events?limit=${Math.max(1, Math.min(limit, 50))}`),
  getStatusArtifactAudits: (
    runId: number,
    options?: {
      limit?: number;
      offset?: number;
      status?: HumanGateAuditDecision | 'all';
      dateRange?: 'all' | '24h' | '7d' | '30d' | 'today';
      timezoneOffsetMinutes?: number;
    },
  ) => {
    const limit = Math.max(1, Math.min(options?.limit ?? 10, 100));
    const offset = Math.max(0, options?.offset ?? 0);
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (options?.status && options.status !== 'all') {
      params.set('status', options.status);
    }
    if (options?.dateRange && options.dateRange !== 'all') {
      params.set('date_range', options.dateRange);
      if (Number.isFinite(options?.timezoneOffsetMinutes)) {
        params.set('tz_offset_minutes', String(Math.trunc(options?.timezoneOffsetMinutes ?? 0)));
      }
    }
    return request<StatusArtifactAuditListResponse>(`/runs/${runId}/status-audits?${params.toString()}`);
  },
  scanStaleHumanGateAlerts: (options?: { staleHours?: number; limit?: number }) => {
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, Math.min(options?.limit ?? 10, 200))));
    if (options?.staleHours && options.staleHours > 0) {
      params.set('stale_hours', String(Math.floor(options.staleHours)));
    }
    return request<HumanGateStaleAlert[]>(`/runs/human-gate-alerts/scan?${params.toString()}`, { method: 'POST' });
  },
  cancelApproval: (approvalId: number) => requestHumanGateAction(`/approvals/${approvalId}/cancel`),
  listSystemAlerts: (limit = 50, cursor?: string | null) => {
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, Math.min(limit, 50))));
    if (cursor) {
      params.set('cursor', cursor);
    }
    return request<SystemAlertPageResponse>(`/logs/system-alerts?${params.toString()}`);
  },
  clearSystemAlerts: () => request<{ cleared_count: number }>('/logs/system-alerts', { method: 'DELETE' }),
  getLoopEngineStatus: () => request<LoopEngineStatus>('/loop/status'),
  startLoopEngine: () => request<LoopEngineStatus>('/loop/start', { method: 'POST', headers: workflowControlHeaders() }),
  pauseLoopEngine: () => request<LoopEngineStatus>('/loop/pause', { method: 'POST', headers: workflowControlHeaders() }),
  resumeLoopEngine: () => request<LoopEngineStatus>('/loop/resume', { method: 'POST', headers: workflowControlHeaders() }),
  stopLoopEngine: () => request<LoopEngineStatus>('/loop/stop', { method: 'POST', headers: workflowControlHeaders() }),
  injectLoopInstruction: (instruction: string) =>
    request<LoopInstructionEnqueueResult>('/loop/inject', {
      method: 'POST',
      headers: workflowControlHeaders(),
      body: JSON.stringify({ instruction }),
    }),
  getLoopInstructionStatus: (instructionId: string) =>
    request<LoopInstructionStatus>(`/loop/instruction/${encodeURIComponent(instructionId)}`, {
      headers: workflowControlHeaders(),
    }),
};
