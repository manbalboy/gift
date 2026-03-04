import { fireEvent, render, screen } from '@testing-library/react';
import WorkflowBuilder from './WorkflowBuilder';
import type { Workflow } from '../types';

jest.mock('reactflow', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ nodes, edges, onConnect, children }: any) => (
      <div>
        <div data-testid="node-count">{nodes.length}</div>
        <div data-testid="edge-count">{edges.length}</div>
        <button
          type="button"
          onClick={() => onConnect?.({ source: nodes[0]?.id ?? 'idea', target: nodes[1]?.id ?? 'plan' })}
        >
          connect
        </button>
        {children}
      </div>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => <div data-testid="minimap" />,
    addEdge: (params: any, edges: any[]) => [
      ...edges,
      {
        id: params.id ?? `edge-${edges.length + 1}`,
        source: params.source,
        target: params.target,
      },
    ],
    useNodesState: (initial: any[]) => {
      const [nodes, setNodes] = React.useState(initial);
      return [nodes, setNodes, jest.fn()];
    },
    useEdgesState: (initial: any[]) => {
      const [edges, setEdges] = React.useState(initial);
      return [edges, setEdges, jest.fn()];
    },
  };
});

const sampleWorkflow: Workflow = {
  id: 10,
  name: 'Sample Flow',
  description: '테스트용 플로우',
  graph: {
    nodes: [
      { id: 'idea', type: 'task', label: 'Idea' },
      { id: 'plan', type: 'task', label: 'Plan' },
    ],
    edges: [{ id: 'e1', source: 'idea', target: 'plan' }],
  },
};

describe('WorkflowBuilder', () => {
  test('워크플로우를 렌더링하고 모바일 세로에서는 mini-map을 숨긴다', () => {
    render(<WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} mobileViewOnly />);

    expect(screen.getByRole('heading', { name: 'Workflow Canvas' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sample Flow')).toBeInTheDocument();
    expect(screen.getByDisplayValue('테스트용 플로우')).toBeInTheDocument();
    expect(screen.queryByTestId('minimap')).not.toBeInTheDocument();
  });

  test('엣지 연결 후 저장하면 변경된 그래프가 onSave로 전달된다', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<WorkflowBuilder workflow={sampleWorkflow} onSave={onSave} mobileViewOnly={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'connect' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.graph.nodes).toHaveLength(2);
    expect(payload.graph.edges).toHaveLength(2);
    expect(onSave.mock.calls[0][1]).toBe(10);
  });

  test('노드 상태가 status badge로 매핑되어 렌더링된다', () => {
    render(
      <WorkflowBuilder
        workflow={sampleWorkflow}
        onSave={jest.fn()}
        mobileViewOnly={false}
        nodeStatuses={{ idea: 'running', plan: 'failed' }}
      />,
    );

    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
  });
});
