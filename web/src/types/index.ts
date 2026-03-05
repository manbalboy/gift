export type WorkflowNode = {
  id: string;
  type: string;
  label: string;
  command?: string;
  timeout_override?: number;
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
};

export type Workflow = {
  id: number;
  name: string;
  description: string;
  graph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
};

export type NodeRun = {
  id: number;
  node_id: string;
  node_name: string;
  status: string;
  sequence: number;
  log: string;
  artifact_path: string | null;
  attempt_count?: number;
  attempt_limit?: number;
  error_snippet?: string;
  updated_at: string;
};

export type WorkflowRun = {
  id: number;
  workflow_id: number;
  status: string;
  started_at: string;
  updated_at: string;
  node_runs: NodeRun[];
};

export type ConstellationData = {
  run_id: number;
  status: string;
  nodes: Array<{ id: string; label: string; status: string; sequence: number }>;
  links: Array<{ source: string; target: string }>;
};

export type WorkflowRunsStreamEvent = {
  workflow_id: number;
  runs: Array<{ id: number; status: string; updated_at: string }>;
};

export type WorkflowGraphValidationResult = {
  valid: boolean;
  node_count: number;
  edge_count: number;
};

export type ArtifactChunkResponse = {
  run_id: number;
  node_id: string;
  offset: number;
  next_offset: number;
  limit: number;
  has_more: boolean;
  content: string;
};

export type WebhookBlockedEvent = {
  id: string;
  created_at: string;
  reason: string;
  client_ip: string;
  provider: string;
  event_type: string;
  detail: string;
};

export type HumanGateAuditEntry = {
  id: number;
  run_id: number;
  node_id: string;
  decision: string;
  decided_by: string;
  decided_at: string;
  payload: Record<string, unknown>;
};

export type HumanGateAuditDecision = 'approved' | 'rejected' | 'cancelled';

export type HumanGateAuditListResponse = {
  items: HumanGateAuditEntry[];
  total_count: number;
  limit: number;
  offset: number;
};

export type StatusArtifactAuditEntry = {
  run_id: number;
  node_id: string;
  decision: string;
  decided_by: string;
  decided_at: string;
  payload: Record<string, unknown>;
};

export type StatusArtifactAuditListResponse = {
  items: StatusArtifactAuditEntry[];
  total_count: number;
  limit: number;
  offset: number;
};

export type HumanGateStaleAlert = {
  run_id: number;
  workflow_id: number;
  node_id: string;
  node_name: string;
  run_status: string;
  node_status: string;
  pending_since: string;
  overdue_seconds: number;
};

export type SystemAlertEntry = {
  id: string;
  created_at: string;
  level: 'warning' | 'error' | 'info';
  code: string;
  message: string;
  source: string;
  context: Record<string, unknown>;
  risk_score?: number | null;
};
