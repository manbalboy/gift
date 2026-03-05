import { fireEvent, render, screen } from '@testing-library/react';
import { LAYER_Z_INDEX } from '../constants/layers';
import WorkflowBuilder from './WorkflowBuilder';
import type { Workflow } from '../types';

jest.mock('reactflow', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ nodes, edges, onConnect, onNodeClick, onPaneClick, onInit, children }: any) => {
      React.useEffect(() => {
        onInit?.({
          fitView: jest.fn(),
          setCenter: jest.fn(),
        });
      }, [onInit]);
      return (
        <div>
          <div data-testid="node-count">{nodes.length}</div>
          <div data-testid="edge-count">{edges.length}</div>
          <button
            type="button"
            onClick={() => onConnect?.({ source: nodes[0]?.id ?? 'idea', target: nodes[1]?.id ?? 'plan' })}
          >
            connect
          </button>
          <button
            type="button"
            onClick={() => onConnect?.({ source: nodes[1]?.id ?? 'plan', target: nodes[0]?.id ?? 'idea' })}
          >
            connect-cycle
          </button>
          <button type="button" onClick={() => onNodeClick?.({}, nodes[0])}>
            select-first
          </button>
          <button type="button" onClick={() => onPaneClick?.({})}>
            pane-click
          </button>
          {children}
        </div>
      );
    },
    Background: () => null,
    Controls: ({ style }: any) => <div data-testid="controls" style={style} />,
    MiniMap: ({ style }: any) => <div data-testid="minimap" style={style} />,
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

const incompleteWorkflow = {
  id: 11,
  name: 'Incomplete Flow',
  description: '불완전 노드 테스트',
  graph: {
    nodes: [{ id: 'broken-node', label: 'Broken' }],
    edges: [],
  },
} as unknown as Workflow;

const multiEntryWorkflow: Workflow = {
  id: 12,
  name: 'Multi Entry Flow',
  description: '다중 진입점 테스트',
  graph: {
    nodes: [
      { id: 'idea', type: 'task', label: 'Idea' },
      { id: 'plan', type: 'task', label: 'Plan' },
      { id: 'docs', type: 'task', label: 'Docs' },
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

  test('순환 연결은 차단되고 경고 메시지를 표시한다', () => {
    render(<WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} mobileViewOnly={false} />);
    expect(screen.getByTestId('edge-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'connect-cycle' }));
    expect(screen.getByTestId('edge-count')).toHaveTextContent('1');
    expect(screen.getByText('순환 연결은 허용되지 않습니다. 연결 방향을 확인해주세요.')).toBeInTheDocument();
  });

  test('노드 추가 버튼으로 캔버스 노드를 동적으로 추가할 수 있다', () => {
    render(<WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} mobileViewOnly={false} />);

    expect(screen.getByTestId('node-count')).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: '노드 추가' }));
    expect(screen.getByTestId('node-count')).toHaveTextContent('3');
  });

  test('검증 버튼 클릭 시 서버 검증 결과를 표시한다', async () => {
    const onValidate = jest.fn().mockResolvedValue({ valid: true, node_count: 2, edge_count: 1 });
    render(
      <WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} onValidate={onValidate} mobileViewOnly={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '드라이런' }));
    expect(await screen.findByText('드라이런 성공 (2 nodes / 1 edges)')).toBeInTheDocument();
    expect(onValidate).toHaveBeenCalledTimes(1);
  });

  test('단절 그래프 검증 실패 시 드라이런 실패 메시지를 표시한다', async () => {
    const onValidate = jest.fn().mockRejectedValue(new Error('workflow graph cannot include disconnected nodes'));
    render(
      <WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} onValidate={onValidate} mobileViewOnly={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '드라이런' }));
    expect(await screen.findByText('드라이런 실패: 그래프 규칙을 확인해주세요.')).toBeInTheDocument();
    expect(onValidate).toHaveBeenCalledTimes(1);
  });

  test('저장 시 단절 그래프를 클라이언트에서 차단한다', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClientValidationError = jest.fn();
    render(
      <WorkflowBuilder
        workflow={sampleWorkflow}
        onSave={onSave}
        mobileViewOnly={false}
        onClientValidationError={onClientValidationError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '노드 추가' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClientValidationError).toHaveBeenCalledWith(
      '저장 실패: 다중 Entry 또는 단절된 노드가 있습니다. 그래프는 정확히 1개의 Entry 노드여야 합니다.',
    );
    expect(
      await screen.findByText('저장 실패: 다중 Entry 또는 단절된 노드가 있습니다. 그래프는 정확히 1개의 Entry 노드여야 합니다.'),
    ).toBeInTheDocument();
  });

  test('저장 시 다중 Entry 그래프를 클라이언트에서 차단한다', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClientValidationError = jest.fn();
    render(
      <WorkflowBuilder
        workflow={multiEntryWorkflow}
        onSave={onSave}
        mobileViewOnly={false}
        onClientValidationError={onClientValidationError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onClientValidationError).toHaveBeenCalledWith(
      '저장 실패: 다중 Entry 또는 단절된 노드가 있습니다. 그래프는 정확히 1개의 Entry 노드여야 합니다.',
    );
    expect(
      await screen.findByText('저장 실패: 다중 Entry 또는 단절된 노드가 있습니다. 그래프는 정확히 1개의 Entry 노드여야 합니다.'),
    ).toBeInTheDocument();
  });

  test('다중 entry 검증 실패 시 드라이런 실패 메시지를 표시한다', async () => {
    const onValidate = jest.fn().mockRejectedValue(new Error('workflow graph must include exactly one entry node'));
    render(
      <WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} onValidate={onValidate} mobileViewOnly={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '드라이런' }));
    expect(await screen.findByText('드라이런 실패: 그래프 규칙을 확인해주세요.')).toBeInTheDocument();
    expect(onValidate).toHaveBeenCalledTimes(1);
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

  test('모바일 세로 전환 시 편집이 비활성화되고 안내가 표시된다', () => {
    const { rerender } = render(<WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} mobileViewOnly={false} />);

    expect(screen.getByTestId('minimap')).toBeInTheDocument();
    expect(screen.getByTestId('edge-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'connect' }));
    expect(screen.getByTestId('edge-count')).toHaveTextContent('2');

    rerender(<WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} mobileViewOnly />);

    expect(screen.queryByTestId('minimap')).not.toBeInTheDocument();
    expect(
      screen.getByText('세로 모바일에서는 모니터링을 우선 제공하며 편집은 가로/태블릿 이상에서 권장됩니다.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('edge-count')).toHaveTextContent('2');

    fireEvent.click(screen.getByRole('button', { name: 'connect' }));
    expect(screen.getByTestId('edge-count')).toHaveTextContent('2');
  });

  test('노드를 선택하면 읽기 전용 상세 패널에 ID/Type이 표시된다', () => {
    render(<WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} mobileViewOnly={false} />);

    expect(screen.getByText('캔버스에서 노드를 선택하면 ID와 Type을 확인할 수 있습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'select-first' }));

    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('idea')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('task')).toBeInTheDocument();
  });

  test('캔버스 바탕 클릭 시 노드 선택이 해제된다', () => {
    render(<WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} mobileViewOnly={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'select-first' }));
    expect(screen.getByText('idea')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'pane-click' }));
    expect(screen.getByText('캔버스에서 노드를 선택하면 ID와 Type을 확인할 수 있습니다.')).toBeInTheDocument();
  });

  test('불완전 노드 데이터가 들어와도 task 타입으로 fallback 렌더링된다', () => {
    const onNodeFallback = jest.fn();
    render(
      <WorkflowBuilder
        workflow={incompleteWorkflow}
        onSave={jest.fn()}
        mobileViewOnly={false}
        onNodeFallback={onNodeFallback}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'select-first' }));
    expect(screen.getByText('broken-node')).toBeInTheDocument();
    expect(screen.getByText('task')).toBeInTheDocument();
    expect(onNodeFallback).toHaveBeenCalledWith({ count: 1, signature: '11:broken-node', nodeIds: ['broken-node'] });
  });

  test('ReactFlow 오버레이 위젯은 지정된 레이어 z-index로 렌더링된다', () => {
    render(<WorkflowBuilder workflow={sampleWorkflow} onSave={jest.fn()} mobileViewOnly={false} />);

    expect(screen.getByTestId('controls')).toHaveStyle({ zIndex: `${LAYER_Z_INDEX.canvasOverlay}` });
    expect(screen.getByTestId('minimap')).toHaveStyle({ zIndex: `${LAYER_Z_INDEX.canvasOverlay}` });
  });
});
