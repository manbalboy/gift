import type { ConstellationData, Workflow, WorkflowRun, WorkflowRunsStreamEvent } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3101/api';
const API_ORIGIN = API_BASE.replace(/\/api$/, '');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  listWorkflows: () => request<Workflow[]>('/workflows'),
  createWorkflow: (payload: Omit<Workflow, 'id'>) =>
    request<Workflow>('/workflows', { method: 'POST', body: JSON.stringify(payload) }),
  updateWorkflow: (id: number, payload: Omit<Workflow, 'id'>) =>
    request<Workflow>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  startRun: (workflowId: number) => request<WorkflowRun>(`/workflows/${workflowId}/runs`, { method: 'POST' }),
  getRun: (runId: number) => request<WorkflowRun>(`/runs/${runId}`),
  getConstellation: (runId: number) => request<ConstellationData>(`/runs/${runId}/constellation`),
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
