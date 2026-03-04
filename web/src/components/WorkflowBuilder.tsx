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
  type NodeMouseHandler,
} from 'reactflow';
import StatusBadge from './StatusBadge';
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
    data: { label: n.label, command: n.command ?? '', nodeType: n.type },
    draggable: true,
  }));

  const edges: Edge[] = workflow.graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
  return { nodes, edges };
}

export default function WorkflowBuilder({
  workflow,
  onSave,
  mobileViewOnly,
  nodeStatuses,
}: {
  workflow: Workflow | null;
  onSave: (payload: Omit<Workflow, 'id'>, existingId?: number) => Promise<void>;
  mobileViewOnly: boolean;
  nodeStatuses?: Record<string, string>;
}) {
  const initial = useMemo(() => {
    if (workflow) return convertToFlow(workflow);
    return {
      nodes: baseNodes.map((node, idx) => ({
        id: node.id,
        position: { x: idx * 180, y: 100 },
        data: { label: node.label, command: '', nodeType: node.type },
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    setTitle(workflow?.name ?? 'Level 1 SDLC Pipeline');
    setDescription(workflow?.description ?? 'Idea에서 PR까지의 기본 파이프라인');
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setSelectedNodeId(null);
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
        nodes: nodes.map((n) => ({
          id: n.id,
          type: String(n.type ?? n.data?.nodeType ?? 'task'),
          label: String(n.data?.label ?? n.id),
        })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      },
    };
    payload.graph.nodes = payload.graph.nodes.map((node) => {
      const flowNode = nodes.find((item) => item.id === node.id);
      const command = String(flowNode?.data?.command ?? '').trim();
      return command ? { ...node, command } : node;
    });
    await onSave(payload, workflow?.id);
  };

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedNodeId(node.id);
  }, []);

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
      <div className="builder-status-list" aria-label="node-status-list">
        {nodes.map((node) => {
          const status = nodeStatuses?.[node.id] ?? 'queued';
          return (
            <div key={node.id} className="builder-status-item">
              <span className="mono">{String(node.data?.label ?? node.id)}</span>
              <StatusBadge status={status} />
            </div>
          );
        })}
      </div>
      <div className="canvas-wrap">
        {mobileViewOnly && <div className="mobile-blocker">세로 모바일에서는 모니터링을 우선 제공하며 편집은 가로/태블릿 이상에서 권장됩니다.</div>}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={mobileViewOnly ? undefined : onNodesChange}
          onEdgesChange={mobileViewOnly ? undefined : onEdgesChange}
          onConnect={mobileViewOnly ? undefined : onConnect}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background gap={20} size={1} color="#27324A" />
          <Controls />
          {!mobileViewOnly && <MiniMap pannable zoomable style={{ background: '#121A2B' }} />}
        </ReactFlow>
      </div>
      <section className="node-detail-panel" aria-label="selected-node-panel">
        <h3>선택 노드</h3>
        {selectedNode ? (
          <div className="node-detail-grid">
            <p>
              <span>ID</span>
              <code className="mono">{selectedNode.id}</code>
            </p>
            <p>
              <span>Type</span>
              <code className="mono">{String(selectedNode.type ?? selectedNode.data?.nodeType ?? 'task')}</code>
            </p>
          </div>
        ) : (
          <p className="node-detail-empty">캔버스에서 노드를 선택하면 ID와 Type을 확인할 수 있습니다.</p>
        )}
      </section>
    </section>
  );
}
