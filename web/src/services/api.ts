import type {
  ArtifactChunkResponse,
  ConstellationData,
  HumanGateAuditListResponse,
  HumanGateAuditDecision,
  WebhookBlockedEvent,
  Workflow,
  WorkflowGraphValidationResult,
  WorkflowRun,
  WorkflowRunsStreamEvent,
} from '../types';
import { calculateReconnectDelayMs } from './reconnect';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3101/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');

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

export const api = {
  listWorkflows: () => request<Workflow[]>('/workflows'),
  createWorkflow: (payload: Omit<Workflow, 'id'>) =>
    request<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(payload) }),
  updateWorkflow: (id: number, payload: Omit<Workflow, 'id'>) =>
    request<Workflow>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  validateWorkflowGraph: (graph: Workflow['graph']) =>
    request<WorkflowGraphValidationResult>('/workflows/validate', { method: 'POST', body: JSON.stringify(graph) }),
  startRun: (workflowId: number) => request<WorkflowRun>(`/workflows/${workflowId}/runs`, { method: 'POST' }),
  getRun: (runId: number) => request<WorkflowRun>(`/runs/${runId}`),
  getConstellation: (runId: number) => request<ConstellationData>(`/runs/${runId}/constellation`),
  approveRunNode: (runId: number, nodeId: string) =>
    requestHumanGateAction(`/runs/${runId}/approve?node_id=${encodeURIComponent(nodeId)}`),
  rejectRunNode: (runId: number, nodeId: string) =>
    requestHumanGateAction(`/runs/${runId}/reject?node_id=${encodeURIComponent(nodeId)}`),
  cancelRun: (runId: number) => request<WorkflowRun>(`/runs/${runId}/cancel`, { method: 'POST' }),
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
      onStateChange?: (state: 'connecting' | 'connected' | 'reconnecting' | 'closed') => void;
      onReconnectSchedule?: (payload: { attempt: number; delayMs: number }) => void;
    },
  ) => {
    let closedByClient = false;
    let stream: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let isConnecting = false;

    const closeStream = (target?: EventSource) => {
      if (!stream) return;
      if (target && stream !== target) return;
      stream.close();
      stream = null;
    };

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const scheduleReconnect = () => {
      if (closedByClient || reconnectTimer !== null) return;
      handlers.onStateChange?.('reconnecting');
      reconnectAttempt += 1;
      const delayMs = calculateReconnectDelayMs(reconnectAttempt);
      handlers.onReconnectSchedule?.({ attempt: reconnectAttempt, delayMs });
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delayMs);
    };

    const connect = () => {
      if (closedByClient || isConnecting || stream) return;
      isConnecting = true;
      clearReconnectTimer();
      handlers.onStateChange?.(reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
      const nextStream = new EventSource(`${API_ORIGIN}/api/workflows/${workflowId}/runs/stream?max_ticks=600`, {
        withCredentials: true,
      });
      stream = nextStream;
      isConnecting = false;
      nextStream.addEventListener('open', () => {
        if (stream !== nextStream) return;
        reconnectAttempt = 0;
        handlers.onStateChange?.('connected');
        handlers.onReconnectSchedule?.({ attempt: 0, delayMs: 0 });
      });
      nextStream.addEventListener('run_status', (event) => {
        if (stream !== nextStream) return;
        const message = event as MessageEvent<string>;
        handlers.onRunStatus(JSON.parse(message.data) as WorkflowRunsStreamEvent);
      });
      nextStream.onerror = (event) => {
        if (stream !== nextStream) return;
        handlers.onError?.(event);
        closeStream(nextStream);
        scheduleReconnect();
      };
    };

    connect();
    return () => {
      closedByClient = true;
      clearReconnectTimer();
      closeStream();
      handlers.onStateChange?.('closed');
    };
  },
  listWebhookBlockedEvents: (limit = 20) =>
    request<WebhookBlockedEvent[]>(`/webhooks/blocked-events?limit=${Math.max(1, Math.min(limit, 50))}`),
  getHumanGateAudits: (
    runId: number,
    options?: {
      limit?: number;
      offset?: number;
      status?: HumanGateAuditDecision | 'all';
      dateRange?: 'all' | '24h' | '7d' | '30d';
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
    }
    return request<HumanGateAuditListResponse>(`/runs/${runId}/human-gate-audits?${params.toString()}`);
  },
  cancelApproval: (approvalId: number) => requestHumanGateAction(`/approvals/${approvalId}/cancel`),
};
