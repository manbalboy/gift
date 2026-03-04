export type WorkflowNode = {
  id: string;
  type: string;
  label: string;
  command?: string;
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
