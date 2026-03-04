import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import App from './App';
import { LAYER_Z_INDEX } from './constants/layers';
import { api } from './services/api';
import type { Workflow } from './types';

jest.mock('./components/Dashboard', () => ({
  __esModule: true,
  default: () => <section data-testid="dashboard" />,
}));

jest.mock('./components/LiveRunConstellation', () => ({
  __esModule: true,
  default: () => <section data-testid="constellation" />,
}));

jest.mock('./components/StatusBadge', () => ({
  __esModule: true,
  default: ({ status }: { status: string }) => <span>{status}</span>,
}));

jest.mock('./components/WorkflowBuilder', () => ({
  __esModule: true,
  default: ({
    onNodeFallback,
  }: {
    onNodeFallback?: (payload: { count: number; signature: string; nodeIds: string[] }) => void;
  }) => (
    <section>
      <button
        type="button"
        onClick={() => onNodeFallback?.({ count: 1, signature: 'wf-1:fallback-node-a', nodeIds: ['fallback-node-a'] })}
      >
        fallback-a
      </button>
      <button
        type="button"
        onClick={() => onNodeFallback?.({ count: 2, signature: 'wf-1:fallback-node-b', nodeIds: ['fallback-node-b'] })}
      >
        fallback-b
      </button>
      <button
        type="button"
        onClick={() => onNodeFallback?.({ count: 3, signature: 'wf-1:fallback-node-c', nodeIds: ['fallback-node-c'] })}
      >
        fallback-c
      </button>
      <button
        type="button"
        onClick={() => onNodeFallback?.({ count: 4, signature: 'wf-1:fallback-node-d', nodeIds: ['fallback-node-d'] })}
      >
        fallback-d
      </button>
      <button
        type="button"
        onClick={() => onNodeFallback?.({ count: 1, signature: 'wf-1:fallback-node-a', nodeIds: ['fallback-node-a'] })}
      >
        fallback-a-repeat
      </button>
    </section>
  ),
}));

jest.mock('./services/api', () => {
  class ApiError extends Error {
    readonly status: number;

    readonly detail: string;

    constructor(status: number, detail: string) {
      super(`API Error: ${status} ${detail}`);
      this.status = status;
      this.detail = detail;
    }
  }
  return {
    __esModule: true,
    ApiError,
    api: {
      listWorkflows: jest.fn(),
      createWorkflow: jest.fn(),
      updateWorkflow: jest.fn(),
      startRun: jest.fn(),
      getRun: jest.fn(),
      getConstellation: jest.fn(),
      sendDevIntegrationWebhook: jest.fn(),
      sendMalformedDevIntegrationWebhook: jest.fn(),
      subscribeWorkflowRuns: jest.fn(),
    },
  };
});

const workflowsFixture: Workflow[] = [
  {
    id: 1,
    name: 'Default Flow',
    description: '기본 워크플로우',
    graph: {
      nodes: [{ id: 'idea', type: 'task', label: 'Idea' }],
      edges: [],
    },
  },
];

const mobileMediaQuery = '(max-width: 767px) and (orientation: portrait)';
let mobilePortrait = false;

describe('App', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query === mobileMediaQuery ? mobilePortrait : false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  beforeEach(() => {
    jest.useRealTimers();
    mobilePortrait = false;
    jest.clearAllMocks();
    (api.listWorkflows as jest.Mock).mockResolvedValue(workflowsFixture);
    (api.subscribeWorkflowRuns as jest.Mock).mockReturnValue(() => undefined);
  });

  test('동일 fallback 시그니처 알림은 한 번만 노출된다', async () => {
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-a-repeat' }));

    expect(screen.getAllByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toHaveLength(1);
  });

  test('Toast는 최대 3개만 유지하고 밀려난 dedupeKey는 재사용 가능하다', async () => {
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-c' }));
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'fallback-d' }));
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(3);
    expect(screen.queryByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a-repeat' }));
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(3);
    expect(screen.getByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toBeInTheDocument();
    expect(screen.queryByText('속성 누락 노드 2개가 task 타입으로 폴백되었습니다.')).not.toBeInTheDocument();
  });

  test('X 버튼으로 수동 닫기 후 동일 dedupeKey 알림을 다시 노출할 수 있다', async () => {
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));
    expect(screen.getByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a-repeat' }));
    expect(screen.getByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toBeInTheDocument();
  });

  test('타이머 만료와 큐 정리가 겹쳐도 dedupeKey는 해제되어 동일 알림을 다시 노출할 수 있다', async () => {
    jest.useFakeTimers();
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-c' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-d' }));
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(3);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '알림 닫기' })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a-repeat' }));
    expect(screen.getByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toBeInTheDocument();

    jest.useRealTimers();
  });

  test('수동 닫기와 신규 알림 수신이 연속 발생해도 dedupeKey는 즉시 재사용된다', async () => {
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));
    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-a-repeat' }));

    expect(screen.getByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(1);
  });

  test('fallback 알림은 데스크톱에서 문제 노드 이동 액션 버튼을 표시한다', async () => {
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));

    expect(screen.getByRole('button', { name: '해당 노드로 이동' })).toBeInTheDocument();
  });

  test('모바일 세로에서는 문제 노드 이동 액션 버튼을 숨긴다', async () => {
    mobilePortrait = true;
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));

    expect(screen.queryByRole('button', { name: '해당 노드로 이동' })).not.toBeInTheDocument();
  });

  test('Toast 레이어는 캔버스 위젯보다 높은 z-index를 사용한다', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    const toastStack = container.querySelector('.toast-stack');
    expect(toastStack).toBeInTheDocument();
    expect(toastStack).toHaveStyle({ zIndex: `${LAYER_Z_INDEX.toast}` });
    expect(LAYER_Z_INDEX.toast).toBeGreaterThan(LAYER_Z_INDEX.canvasOverlay);
  });
});
