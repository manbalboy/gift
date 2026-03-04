import type { ConstellationData, Workflow, WorkflowRun } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3101/api';

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
};
