import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow';
import type { Workflow } from '../types';

const baseNodes = [
  { id: 'idea', type: 'task', label: 'Idea' },
  { id: 'plan', type: 'task', label: 'Plan' },
  { id: 'code', type: 'task', label: 'Code' },
  { id: 'test', type: 'task', label: 'Test' },
  { id: 'pr', type: 'task', label: 'PR' },
];

function convertToFlow(workflow: Workflow) {
  const nodes: Node[] = workflow.graph.nodes.map((n, idx) => ({
    id: n.id,
    position: { x: idx * 180, y: 70 + (idx % 2) * 50 },
    data: { label: n.label },
    draggable: true,
  }));

  const edges: Edge[] = workflow.graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
  return { nodes, edges };
}

export default function WorkflowBuilder({
  workflow,
  onSave,
  mobileViewOnly,
}: {
  workflow: Workflow | null;
  onSave: (payload: Omit<Workflow, 'id'>, existingId?: number) => Promise<void>;
  mobileViewOnly: boolean;
}) {
  const initial = useMemo(() => {
    if (workflow) return convertToFlow(workflow);
    return {
      nodes: baseNodes.map((node, idx) => ({
        id: node.id,
        position: { x: idx * 180, y: 100 },
        data: { label: node.label },
      })),
      edges: [
        { id: 'e1', source: 'idea', target: 'plan' },
        { id: 'e2', source: 'plan', target: 'code' },
        { id: 'e3', source: 'code', target: 'test' },
        { id: 'e4', source: 'test', target: 'pr' },
      ],
    };
  }, [workflow]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [title, setTitle] = useState(workflow?.name ?? 'Level 1 SDLC Pipeline');
  const [description, setDescription] = useState(workflow?.description ?? 'Idea에서 PR까지의 기본 파이프라인');

  useEffect(() => {
    setTitle(workflow?.name ?? 'Level 1 SDLC Pipeline');
    setDescription(workflow?.description ?? 'Idea에서 PR까지의 기본 파이프라인');
    setNodes(initial.nodes);
    setEdges(initial.edges);
  }, [workflow, initial, setEdges, setNodes]);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge({ ...params, id: `edge-${Date.now()}` }, eds)),
    [setEdges],
  );

  const handleSave = async () => {
    const payload = {
      name: title,
      description,
      graph: {
        nodes: nodes.map((n) => ({ id: n.id, type: 'task', label: String(n.data?.label ?? n.id) })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      },
    };
    await onSave(payload, workflow?.id);
  };

  return (
    <section className="card builder-card">
      <div className="card-header builder-header">
        <div>
          <h2>Workflow Canvas</h2>
          <p>노드 연결로 SDLC를 정의하고 저장합니다.</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave}>
          저장
        </button>
      </div>
      <div className="builder-meta">
        <label>
          <span>워크플로우 이름</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          <span>설명</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      <div className="canvas-wrap">
        {mobileViewOnly && <div className="mobile-blocker">세로 모바일에서는 모니터링을 우선 제공하며 편집은 가로/태블릿 이상에서 권장됩니다.</div>}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={mobileViewOnly ? undefined : onNodesChange}
          onEdgesChange={mobileViewOnly ? undefined : onEdgesChange}
          onConnect={mobileViewOnly ? undefined : onConnect}
          fitView
        >
          <Background gap={20} size={1} color="#27324A" />
          <Controls />
          {!mobileViewOnly && <MiniMap pannable zoomable style={{ background: '#121A2B' }} />}
        </ReactFlow>
      </div>
    </section>
  );
}
