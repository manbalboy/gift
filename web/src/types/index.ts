export type WorkflowNode = {
  id: string;
  type: string;
  label: string;
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
