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
const HUMAN_GATE_APPROVER_TOKEN = import.meta.env.VITE_HUMAN_GATE_APPROVER_TOKEN ?? '';
const HUMAN_GATE_APPROVER_ROLE = import.meta.env.VITE_HUMAN_GATE_APPROVER_ROLE ?? 'reviewer';
const WORKSPACE_ID = import.meta.env.VITE_WORKSPACE_ID ?? 'main';

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
    request<WorkflowRun>(`/runs/${runId}/approve?node_id=${encodeURIComponent(nodeId)}`, {
      method: 'POST',
      headers: HUMAN_GATE_APPROVER_TOKEN
        ? {
            'X-Approver-Token': HUMAN_GATE_APPROVER_TOKEN,
            'X-Approver-Role': HUMAN_GATE_APPROVER_ROLE,
            'X-Workspace-Id': WORKSPACE_ID,
          }
        : { 'X-Workspace-Id': WORKSPACE_ID },
    }),
  rejectRunNode: (runId: number, nodeId: string) =>
    request<WorkflowRun>(`/runs/${runId}/reject?node_id=${encodeURIComponent(nodeId)}`, {
      method: 'POST',
      headers: HUMAN_GATE_APPROVER_TOKEN
        ? {
            'X-Approver-Token': HUMAN_GATE_APPROVER_TOKEN,
            'X-Approver-Role': HUMAN_GATE_APPROVER_ROLE,
            'X-Workspace-Id': WORKSPACE_ID,
          }
        : { 'X-Workspace-Id': WORKSPACE_ID },
    }),
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

    const closeStream = () => {
      if (!stream) return;
      stream.close();
      stream = null;
    };

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const scheduleReconnect = () => {
      if (closedByClient) return;
      handlers.onStateChange?.('reconnecting');
      reconnectAttempt += 1;
      const delayMs = calculateReconnectDelayMs(reconnectAttempt);
      handlers.onReconnectSchedule?.({ attempt: reconnectAttempt, delayMs });
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(() => {
        connect();
      }, delayMs);
    };

    const connect = () => {
      if (closedByClient) return;
      clearReconnectTimer();
      closeStream();
      handlers.onStateChange?.(reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
      stream = new EventSource(`${API_ORIGIN}/api/workflows/${workflowId}/runs/stream?max_ticks=600`);
      stream.addEventListener('open', () => {
        reconnectAttempt = 0;
        handlers.onStateChange?.('connected');
        handlers.onReconnectSchedule?.({ attempt: 0, delayMs: 0 });
      });
      stream.addEventListener('run_status', (event) => {
        const message = event as MessageEvent<string>;
        handlers.onRunStatus(JSON.parse(message.data) as WorkflowRunsStreamEvent);
      });
      stream.onerror = (event) => {
        handlers.onError?.(event);
        closeStream();
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
  cancelApproval: (approvalId: number) =>
    request<WorkflowRun>(`/approvals/${approvalId}/cancel`, {
      method: 'POST',
      headers: HUMAN_GATE_APPROVER_TOKEN
        ? {
            'X-Approver-Token': HUMAN_GATE_APPROVER_TOKEN,
            'X-Approver-Role': HUMAN_GATE_APPROVER_ROLE,
            'X-Workspace-Id': WORKSPACE_ID,
          }
        : { 'X-Workspace-Id': WORKSPACE_ID },
    }),
};
