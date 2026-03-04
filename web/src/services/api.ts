import type {
  ConstellationData,
  Workflow,
  WorkflowGraphValidationResult,
  WorkflowRun,
  WorkflowRunsStreamEvent,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3101/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');
const WEBHOOK_SECRET = import.meta.env.VITE_WEBHOOK_SECRET ?? '';

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

function buildWebhookHeaders(base?: HeadersInit): HeadersInit {
  if (!WEBHOOK_SECRET) return base ?? {};
  return {
    ...(base ?? {}),
    'X-API-Secret': WEBHOOK_SECRET,
  };
}

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
  sendDevIntegrationWebhook: (payload: unknown) =>
    request<WebhookResponse>('/webhooks/dev-integration', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: buildWebhookHeaders(),
    }),
  sendMalformedDevIntegrationWebhook: async () => {
    const response = await fetch(`${API_BASE}/webhooks/dev-integration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildWebhookHeaders(),
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
    },
  ) => {
    const stream = new EventSource(`${API_ORIGIN}/api/workflows/${workflowId}/runs/stream?max_ticks=600`);
    stream.addEventListener('run_status', (event) => {
      const message = event as MessageEvent<string>;
      handlers.onRunStatus(JSON.parse(message.data) as WorkflowRunsStreamEvent);
    });
    stream.onerror = (event) => {
      handlers.onError?.(event);
    };
    return () => stream.close();
  },
};
