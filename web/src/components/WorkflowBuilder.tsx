import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  type NodeProps,
  type ReactFlowInstance,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from 'reactflow';
import { LAYER_Z_INDEX } from '../constants/layers';
import StatusBadge from './StatusBadge';
import type { Workflow, WorkflowGraphValidationResult } from '../types';

const baseNodes = [
  { id: 'idea', type: 'task', label: 'Idea' },
  { id: 'plan', type: 'task', label: 'Plan' },
  { id: 'code', type: 'task', label: 'Code' },
  { id: 'test', type: 'task', label: 'Test' },
  { id: 'pr', type: 'task', label: 'PR' },
];

const statusIcon: Record<string, string> = {
  queued: '○',
  paused: 'Ⅱ',
  blocked: '⛔',
  running: '▶',
  done: '✓',
  failed: '!',
  review_needed: '◆',
};

function normalizeNodeStatus(raw: string | undefined): string {
  const normalized = String(raw ?? 'queued').trim().toLowerCase();
  if (!normalized) return 'queued';
  return normalized;
}

function wouldCreateCycle(source: string, target: string, edges: Edge[]): boolean {
  if (source === target) return true;
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)?.push(edge.target);
  }

  const queue = [target];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const next = adjacency.get(current) ?? [];
    for (const nextNode of next) {
      queue.push(nextNode);
    }
  }
  return false;
}

function validateGraphForSave(graph: Workflow['graph']): string | null {
  if (graph.nodes.length < 1) return '저장 실패: 최소 1개 이상의 노드가 필요합니다.';

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (nodeIds.size !== graph.nodes.length) return '저장 실패: 중복된 노드 ID가 있습니다.';

  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return '저장 실패: 엣지는 반드시 기존 노드를 가리켜야 합니다.';
    }
    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  if (graph.nodes.length > 1 && graph.edges.length === 0) {
    return '저장 실패: 다중 노드 그래프에는 최소 1개의 엣지가 필요합니다.';
  }

  const entryNodes = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  if (entryNodes.length !== 1) {
    return '저장 실패: 다중 Entry 또는 단절된 노드가 있습니다. 그래프는 정확히 1개의 Entry 노드여야 합니다.';
  }

  const indegreeClone = new Map(indegree);
  const queue = [...entryNodes];
  let visited = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    visited += 1;
    for (const target of adjacency.get(current) ?? []) {
      const nextDegree = (indegreeClone.get(target) ?? 0) - 1;
      indegreeClone.set(target, nextDegree);
      if (nextDegree === 0) queue.push(target);
    }
  }
  if (visited !== graph.nodes.length) {
    return '저장 실패: 순환 그래프는 저장할 수 없습니다.';
  }

  const reachable = new Set<string>();
  const walk = [entryNodes[0]];
  while (walk.length > 0) {
    const current = walk.shift();
    if (!current || reachable.has(current)) continue;
    reachable.add(current);
    for (const target of adjacency.get(current) ?? []) {
      walk.push(target);
    }
  }
  if (reachable.size !== graph.nodes.length) {
    return '저장 실패: 단절된 노드가 있습니다. 모든 노드를 Entry 경로에 연결하세요.';
  }

  return null;
}

function TaskNode({
  data,
}: NodeProps<{
  label: string;
  status?: string;
  attemptCount?: number;
  attemptLimit?: number;
  errorSnippet?: string;
  onRetryNode?: (nodeId: string) => void;
  onOpenErrorTooltip?: (payload: { nodeId: string; snippet: string; anchor: HTMLButtonElement }) => void;
  nodeId: string;
}>) {
  const status = normalizeNodeStatus(data.status);
  const attemptCount = Math.max(0, Number(data.attemptCount ?? 0));
  const attemptLimit = Math.max(1, Number(data.attemptLimit ?? 1));
  const snippet = String(data.errorSnippet ?? '').trim();
  return (
    <div className="workflow-node">
      <Handle type="target" position={Position.Left} />
      <div className="workflow-node-label">{data.label}</div>
      <div className={`workflow-node-status workflow-node-status-${status}`}>
        <span aria-hidden>{statusIcon[status] ?? '○'}</span>
        <span className="mono">{status}</span>
      </div>
      <div className="workflow-node-attempt mono">{`Attempt ${attemptCount}/${attemptLimit}`}</div>
      {status === 'failed' && (
        <div className="workflow-node-actions">
          <button
            type="button"
            className="workflow-node-retry"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              data.onRetryNode?.(data.nodeId);
            }}
          >
            Retry Node
          </button>
          <button
            type="button"
            className="workflow-node-error"
            disabled={!snippet}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!snippet) return;
              data.onOpenErrorTooltip?.({
                nodeId: data.nodeId,
                snippet,
                anchor: event.currentTarget,
              });
            }}
          >
            오류 보기
          </button>
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function convertToFlow(workflow: Workflow): {
  nodes: Node[];
  edges: Edge[];
  fallbackCount: number;
  fallbackSignature: string | null;
  fallbackNodeIds: string[];
} {
  let fallbackCount = 0;
  const fallbackNodeIds: string[] = [];
  const nodes: Node[] = workflow.graph.nodes.map((n, idx) => {
    const rawId = String((n as Partial<{ id: string }>).id ?? '').trim();
    const nodeId = rawId || `fallback-node-${idx}`;
    const rawType = String((n as Partial<{ type: string }>).type ?? '').trim();
    const hasFallback = !rawId || !rawType;
    if (hasFallback) {
      fallbackCount += 1;
      fallbackNodeIds.push(nodeId);
    }
    return {
      id: nodeId,
      type: 'taskNode',
      position: { x: idx * 180, y: 70 + (idx % 2) * 50 },
      data: {
        label: String((n as Partial<{ label: string }>).label ?? nodeId),
        command: n.command ?? '',
        nodeType: rawType || 'task',
      },
      draggable: true,
    };
  });

  const edges: Edge[] = workflow.graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
  const fallbackSignature =
    fallbackNodeIds.length > 0
      ? `${workflow.id}:${fallbackNodeIds.sort((a, b) => a.localeCompare(b)).join(',')}`
      : null;
  return { nodes, edges, fallbackCount, fallbackSignature, fallbackNodeIds };
}

export default function WorkflowBuilder({
  workflow,
  onSave,
  onValidate,
  mobileViewOnly,
  nodeStatuses,
  nodeMeta,
  onRetryNode,
  onNodeFallback,
  focusNodeRequest,
  onFocusNodeHandled,
  onClientValidationError,
}: {
  workflow: Workflow | null;
  onSave: (payload: Omit<Workflow, 'id'>, existingId?: number) => Promise<void>;
  onValidate?: (graph: Workflow['graph']) => Promise<WorkflowGraphValidationResult>;
  mobileViewOnly: boolean;
  nodeStatuses?: Record<string, string>;
  nodeMeta?: Record<string, { attemptCount: number; attemptLimit: number; errorSnippet: string }>;
  onRetryNode?: (nodeId: string) => void;
  onNodeFallback?: (payload: { count: number; signature: string; nodeIds: string[] }) => void;
  focusNodeRequest?: { nodeId: string; requestId: number } | null;
  onFocusNodeHandled?: () => void;
  onClientValidationError?: (message: string) => void;
}) {
  const initial = useMemo(() => {
    if (workflow) return convertToFlow(workflow);
    return {
      nodes: baseNodes.map((node, idx) => ({
        id: node.id,
        type: 'taskNode',
        position: { x: idx * 180, y: 100 },
        data: { label: node.label, command: '', nodeType: node.type },
      })),
      edges: [
        { id: 'e1', source: 'idea', target: 'plan' },
        { id: 'e2', source: 'plan', target: 'code' },
        { id: 'e3', source: 'code', target: 'test' },
        { id: 'e4', source: 'test', target: 'pr' },
      ],
      fallbackCount: 0,
      fallbackSignature: null,
      fallbackNodeIds: [],
    };
  }, [workflow]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [title, setTitle] = useState(workflow?.name ?? 'Level 1 SDLC Pipeline');
  const [description, setDescription] = useState(workflow?.description ?? 'Idea에서 PR까지의 기본 파이프라인');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeSequence, setNodeSequence] = useState(6);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [validationSummary, setValidationSummary] = useState<string>('');
  const [errorTooltip, setErrorTooltip] = useState<{
    nodeId: string;
    snippet: string;
    left: number;
    top: number;
  } | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const nodeTypes = useMemo(() => ({ taskNode: TaskNode }), []);
  const flowNodes = useMemo(
    () =>
      nodes.map((node) => {
        const status = normalizeNodeStatus(nodeStatuses?.[node.id]);
        return {
          ...node,
          className: `status-${status}`,
          data: {
            ...node.data,
            status,
            attemptCount: nodeMeta?.[node.id]?.attemptCount ?? 0,
            attemptLimit: nodeMeta?.[node.id]?.attemptLimit ?? 1,
            errorSnippet: nodeMeta?.[node.id]?.errorSnippet ?? '',
            onRetryNode,
            onOpenErrorTooltip: ({ nodeId, snippet, anchor }: { nodeId: string; snippet: string; anchor: HTMLButtonElement }) => {
              const canvasRect = canvasWrapRef.current?.getBoundingClientRect();
              const anchorRect = anchor.getBoundingClientRect();
              const left = canvasRect ? anchorRect.left - canvasRect.left : 16;
              const top = canvasRect ? anchorRect.bottom - canvasRect.top + 8 : 16;
              setErrorTooltip({ nodeId, snippet, left, top });
            },
            nodeId: node.id,
          },
        };
      }),
    [nodeMeta, nodeStatuses, nodes, onRetryNode],
  );

  useEffect(() => {
    setTitle(workflow?.name ?? 'Level 1 SDLC Pipeline');
    setDescription(workflow?.description ?? 'Idea에서 PR까지의 기본 파이프라인');
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setSelectedNodeId(null);
    setErrorTooltip(null);
    const nextSequence =
      initial.nodes.reduce((maxValue, node) => {
        const extracted = Number.parseInt(node.id.replace(/^node-/, ''), 10);
        if (Number.isNaN(extracted)) return maxValue;
        return Math.max(maxValue, extracted + 1);
      }, 1) || 1;
    setNodeSequence(nextSequence);
    setValidationSummary('');
  }, [workflow, initial, setEdges, setNodes]);

  useEffect(() => {
    if (initial.fallbackCount > 0 && initial.fallbackSignature) {
      onNodeFallback?.({ count: initial.fallbackCount, signature: initial.fallbackSignature, nodeIds: initial.fallbackNodeIds });
    }
  }, [initial.fallbackCount, initial.fallbackNodeIds, initial.fallbackSignature, onNodeFallback]);

  useEffect(() => {
    if (!focusNodeRequest || !flowRef.current) return;
    const target = nodes.find((node) => node.id === focusNodeRequest.nodeId);
    if (!target) {
      onFocusNodeHandled?.();
      return;
    }
    setSelectedNodeId(target.id);
    const x = target.position.x + 90;
    const y = target.position.y + 40;
    flowRef.current.setCenter(x, y, { duration: 420, zoom: 1.15 });
    onFocusNodeHandled?.();
  }, [focusNodeRequest, nodes, onFocusNodeHandled]);

  useEffect(() => {
    const target = canvasWrapRef.current;
    if (!target || !flowRef.current) return;

    const syncViewport = () => {
      if (!flowRef.current) return;
      flowRef.current.fitView({ duration: 240, padding: mobileViewOnly ? 0.16 : 0.2 });
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(syncViewport);
    });
    observer.observe(target);
    syncViewport();
    return () => observer.disconnect();
  }, [mobileViewOnly]);

  const attemptConnection = useCallback(
    (source: string | null | undefined, target: string | null | undefined) => {
      setEdges((eds) => {
        if (!source || !target) return eds;
        if (wouldCreateCycle(source, target, eds)) {
          setValidationSummary('순환 연결은 허용되지 않습니다. 연결 방향을 확인해주세요.');
          return eds;
        }
        setValidationSummary('');
        return addEdge({ source, target, id: `edge-${Date.now()}` }, eds);
      });
    },
    [setEdges],
  );

  const onConnect = useCallback(
    (params: Edge | Connection) => {
      attemptConnection(params.source, params.target);
    },
    [attemptConnection],
  );

  const handleSave = async () => {
    const payload = {
      name: title,
      description,
      graph: {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: String(n.data?.nodeType ?? n.type ?? 'task'),
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
    const validationMessage = validateGraphForSave(payload.graph);
    if (validationMessage) {
      setValidationSummary(validationMessage);
      onClientValidationError?.(validationMessage);
      return;
    }
    setValidationSummary('');
    await onSave(payload, workflow?.id);
  };

  const handleAddNode = useCallback(() => {
    if (mobileViewOnly) return;
    const nextId = `node-${nodeSequence}`;
    setNodeSequence((prev) => prev + 1);
    setNodes((current) => {
      const index = current.length;
      const col = index % 4;
      const row = Math.floor(index / 4);
      return [
        ...current,
        {
          id: nextId,
          position: { x: 120 + col * 190, y: 90 + row * 120 },
          data: { label: `Task ${nodeSequence}`, command: '', nodeType: 'task' },
          type: 'taskNode',
          draggable: true,
        },
      ];
    });
    setValidationSummary('');
  }, [mobileViewOnly, nodeSequence, setNodes]);

  const handleValidate = useCallback(async () => {
    if (!onValidate) return;
    const graph: Workflow['graph'] = {
      nodes: nodes.map((node) => ({
        id: node.id,
        type: String(node.data?.nodeType ?? node.type ?? 'task'),
        label: String(node.data?.label ?? node.id),
        command: String(node.data?.command ?? '').trim() || undefined,
      })),
      edges: edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    };
    setIsDryRunning(true);
    try {
      const result = await onValidate(graph);
      setValidationSummary(`드라이런 성공 (${result.node_count} nodes / ${result.edge_count} edges)`);
    } catch {
      setValidationSummary('드라이런 실패: 그래프 규칙을 확인해주세요.');
    } finally {
      setIsDryRunning(false);
    }
  }, [edges, nodes, onValidate]);

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const isValidationError = validationSummary.includes('실패');

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setErrorTooltip(null);
  }, []);

  return (
    <section className="card builder-card">
      <div className="card-header builder-header">
        <div>
          <h2>Workflow Canvas</h2>
          <p>노드 연결로 SDLC를 정의하고 저장합니다.</p>
        </div>
        <div className="builder-actions">
          <button className="btn btn-ghost" type="button" onClick={handleAddNode} disabled={mobileViewOnly}>
            노드 추가
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => void handleValidate()} disabled={isDryRunning}>
            {isDryRunning ? '드라이런 중...' : '드라이런'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              const source = nodes[1]?.id ?? 'plan';
              const target = nodes[0]?.id ?? 'idea';
              attemptConnection(source, target);
            }}
          >
            순환 연결 테스트
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            저장
          </button>
        </div>
      </div>
      {validationSummary && (
        <p className={`builder-validation ${isValidationError ? 'builder-validation-error' : 'builder-validation-success'}`} aria-live="polite">
          {validationSummary}
        </p>
      )}
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
      <div className="canvas-wrap" ref={canvasWrapRef} data-testid="workflow-builder-canvas">
        {mobileViewOnly && <div className="mobile-blocker">세로 모바일에서는 모니터링을 우선 제공하며 편집은 가로/태블릿 이상에서 권장됩니다.</div>}
        <ReactFlow
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          nodeTypes={nodeTypes}
          nodes={flowNodes}
          edges={edges}
          onNodesChange={mobileViewOnly ? undefined : onNodesChange}
          onEdgesChange={mobileViewOnly ? undefined : onEdgesChange}
          onConnect={mobileViewOnly ? undefined : onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
        >
          <Background gap={20} size={1} color="#27324A" />
          <Controls style={{ zIndex: LAYER_Z_INDEX.canvasOverlay }} />
          {!mobileViewOnly && (
            <MiniMap
              pannable
              zoomable
              style={{ background: '#121A2B', zIndex: LAYER_Z_INDEX.canvasOverlay }}
            />
          )}
        </ReactFlow>
        {errorTooltip && (
          <>
            <div className="workflow-error-sheet-backdrop" onClick={() => setErrorTooltip(null)} aria-hidden="true" />
            <section
              className="workflow-error-tooltip"
              role="dialog"
              aria-modal="false"
              aria-label="노드 오류 툴팁"
              style={{ left: `${errorTooltip.left}px`, top: `${errorTooltip.top}px` }}
            >
              <div className="workflow-error-tooltip-header">
                <strong className="mono">{errorTooltip.nodeId}</strong>
                <button type="button" className="btn btn-ghost" onClick={() => setErrorTooltip(null)}>
                  닫기
                </button>
              </div>
              <pre className="workflow-error-tooltip-body mono">{errorTooltip.snippet}</pre>
            </section>
          </>
        )}
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
              <code className="mono">{String(selectedNode.data?.nodeType ?? selectedNode.type ?? 'task')}</code>
            </p>
          </div>
        ) : (
          <p className="node-detail-empty">캔버스에서 노드를 선택하면 ID와 Type을 확인할 수 있습니다.</p>
        )}
      </section>
    </section>
  );
}
