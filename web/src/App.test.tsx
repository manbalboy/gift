import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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
  default: ({ onNodeFallback }: { onNodeFallback?: (payload: { count: number; signature: string }) => void }) => (
    <section>
      <button
        type="button"
        onClick={() => onNodeFallback?.({ count: 1, signature: 'wf-1:fallback-node-1' })}
      >
        fallback-toast
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

describe('App', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        addListener: jest.fn(),
        removeListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (api.listWorkflows as jest.Mock).mockResolvedValue(workflowsFixture);
    (api.subscribeWorkflowRuns as jest.Mock).mockReturnValue(() => undefined);
  });

  test('동일 fallback 시그니처 알림은 한 번만 노출된다', async () => {
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'fallback-toast' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-toast' }));

    expect(screen.getAllByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toHaveLength(1);
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
