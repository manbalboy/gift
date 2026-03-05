import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import App from './App';
import { LAYER_Z_INDEX } from './constants/layers';
import { ApiError, api } from './services/api';
import type { Workflow } from './types';

jest.mock('./components/Dashboard', () => ({
  __esModule: true,
  default: ({
    onApproveHumanGate,
    onRejectHumanGate,
  }: {
    onApproveHumanGate?: (nodeId: string) => Promise<void>;
    onRejectHumanGate?: (nodeId: string) => Promise<void>;
  }) => (
    <section data-testid="dashboard">
      <button
        type="button"
        onClick={() => {
          void onApproveHumanGate?.('review');
        }}
      >
        dashboard-approve
      </button>
      <button
        type="button"
        onClick={() => {
          void onRejectHumanGate?.('review');
        }}
      >
        dashboard-reject
      </button>
    </section>
  ),
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
      validateWorkflowGraph: jest.fn(),
      startRun: jest.fn(),
      getRun: jest.fn(),
      getConstellation: jest.fn(),
      approveRunNode: jest.fn(),
      rejectRunNode: jest.fn(),
      cancelRun: jest.fn(),
      resumeRun: jest.fn(),
      getArtifactChunk: jest.fn(),
      sendDevIntegrationWebhook: jest.fn(),
      sendMalformedDevIntegrationWebhook: jest.fn(),
      subscribeWorkflowRuns: jest.fn(),
      listWebhookBlockedEvents: jest.fn(),
      listSystemAlerts: jest.fn(),
      clearSystemAlerts: jest.fn(),
      getLoopEngineStatus: jest.fn(),
      startLoopEngine: jest.fn(),
      pauseLoopEngine: jest.fn(),
      resumeLoopEngine: jest.fn(),
      stopLoopEngine: jest.fn(),
      injectLoopInstruction: jest.fn(),
      getLoopInstructionStatus: jest.fn(),
      getStatusArtifactAudits: jest.fn(),
      scanStaleHumanGateAlerts: jest.fn(),
      cancelApproval: jest.fn(),
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

let viewportWidth = 1024;
let portraitOrientation = true;

describe('App', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches:
          query === '(max-width: 767px)'
            ? viewportWidth <= 767
            : query === '(orientation: portrait)'
              ? portraitOrientation
              : query === '(orientation: landscape)'
                ? !portraitOrientation
                : false,
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
    viewportWidth = 1024;
    portraitOrientation = true;
    jest.clearAllMocks();
    (api.listWorkflows as jest.Mock).mockResolvedValue(workflowsFixture);
    (api.subscribeWorkflowRuns as jest.Mock).mockReturnValue(() => undefined);
    (api.listWebhookBlockedEvents as jest.Mock).mockResolvedValue([]);
    (api.listSystemAlerts as jest.Mock).mockImplementation(
      () =>
        new Promise(() => {
          // 테스트 기본 경로에서는 장기 폴링 응답을 보류해 act 경고를 방지합니다.
        }),
    );
    (api.clearSystemAlerts as jest.Mock).mockResolvedValue({ cleared_count: 0 });
    (api.getLoopEngineStatus as jest.Mock).mockResolvedValue({
      mode: 'idle',
      current_stage: null,
      cycle_count: 0,
      emitted_alert_count: 0,
      pending_instruction_count: 0,
      quality_score: null,
      started_at: null,
      updated_at: '2026-03-05T00:00:00Z',
    });
    (api.startLoopEngine as jest.Mock).mockResolvedValue({
      mode: 'running',
      current_stage: 'analyzer',
      cycle_count: 0,
      emitted_alert_count: 1,
      pending_instruction_count: 0,
      quality_score: 64,
      started_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:00Z',
    });
    (api.pauseLoopEngine as jest.Mock).mockResolvedValue({
      mode: 'paused',
      current_stage: 'evaluator',
      cycle_count: 1,
      emitted_alert_count: 4,
      pending_instruction_count: 0,
      quality_score: 70,
      started_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:03Z',
    });
    (api.resumeLoopEngine as jest.Mock).mockResolvedValue({
      mode: 'running',
      current_stage: 'planner',
      cycle_count: 1,
      emitted_alert_count: 5,
      pending_instruction_count: 0,
      quality_score: 70,
      started_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:03Z',
    });
    (api.stopLoopEngine as jest.Mock).mockResolvedValue({
      mode: 'idle',
      current_stage: null,
      cycle_count: 1,
      emitted_alert_count: 5,
      pending_instruction_count: 0,
      quality_score: 70,
      started_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:05Z',
    });
    (api.injectLoopInstruction as jest.Mock).mockResolvedValue({
      instruction_id: 'instr-001',
      status: {
        mode: 'running',
        current_stage: 'planner',
        cycle_count: 1,
        emitted_alert_count: 6,
        pending_instruction_count: 1,
        quality_score: 72,
        started_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:06Z',
      },
    });
    (api.getLoopInstructionStatus as jest.Mock).mockResolvedValue({
      id: 'instr-001',
      instruction: '테스트',
      status: 'queued',
      queued_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:01Z',
      applied_at: null,
      dropped_reason: null,
    });
    (api.getStatusArtifactAudits as jest.Mock).mockResolvedValue({
      items: [],
      total_count: 0,
      limit: 10,
      offset: 0,
    });
    (api.scanStaleHumanGateAlerts as jest.Mock).mockResolvedValue([]);
  });

  test('동일 fallback 시그니처 알림은 한 번만 노출된다', async () => {
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-a-repeat' }));

    expect(screen.getAllByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toHaveLength(1);
  });

  test('Toast는 최대 3개만 표시하고 초과 알림은 큐에서 순차 노출된다', async () => {
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-c' }));
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'fallback-d' }));
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(3);
    expect(screen.getByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toBeInTheDocument();
    expect(screen.queryByText('속성 누락 노드 4개가 task 타입으로 폴백되었습니다.')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '알림 닫기' })[0]);
    expect(screen.getByText('속성 누락 노드 4개가 task 타입으로 폴백되었습니다.')).toBeInTheDocument();
  });

  test('큐에 대기 중인 dedupeKey도 중복 등록을 차단한다', async () => {
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-c' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-a-repeat' }));
    expect(screen.getByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(3);
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
      jest.advanceTimersByTime(6100);
    });
    await waitFor(() => {
      expect(screen.queryByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).not.toBeInTheDocument();
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
    viewportWidth = 390;
    portraitOrientation = true;
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

  test('Clear All 버튼으로 누적된 알림을 일괄 제거한다', async () => {
    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-b' }));
    fireEvent.click(screen.getByRole('button', { name: 'fallback-c' }));
    expect(screen.getAllByRole('button', { name: '알림 닫기' })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: '모든 알림 닫기' }));
    expect(screen.queryByRole('button', { name: '알림 닫기' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'fallback-a-repeat' }));
    expect(screen.getByText('속성 누락 노드 1개가 task 타입으로 폴백되었습니다.')).toBeInTheDocument();
  });

  test('동시성 웹훅 이벤트가 빠르게 유입되면 상태 동기화 요청을 쓰로틀링한다', async () => {
    jest.useFakeTimers();
    const streamHandlers: { onRunStatus: (payload: { workflow_id: number; runs: Array<{ id: number; status: string; updated_at: string }> }) => void }[] = [];
    (api.subscribeWorkflowRuns as jest.Mock).mockImplementation(
      (
        _workflowId: number,
        handlers: { onRunStatus: (payload: { workflow_id: number; runs: Array<{ id: number; status: string; updated_at: string }> }) => void },
      ) => {
        streamHandlers.push(handlers);
        return () => undefined;
      },
    );
    (api.getRun as jest.Mock).mockResolvedValue({
      id: 101,
      workflow_id: 1,
      status: 'running',
      started_at: '2026-03-04T12:00:00Z',
      updated_at: '2026-03-04T12:00:01Z',
      node_runs: [],
    });
    (api.getConstellation as jest.Mock).mockResolvedValue({
      run_id: 101,
      status: 'running',
      nodes: [],
      links: [],
    });

    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(streamHandlers).toHaveLength(1));

    act(() => {
      for (let i = 0; i < 6; i += 1) {
        streamHandlers[0]?.onRunStatus({
          workflow_id: 1,
          runs: [{ id: 101, status: 'running', updated_at: `2026-03-04T12:00:0${i}Z` }],
        });
      }
    });

    act(() => {
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(api.getRun).toHaveBeenCalledTimes(1);
      expect(api.getConstellation).toHaveBeenCalledTimes(1);
    });

    jest.useRealTimers();
  });

  test('queue_overflow dropped 상태 수신 시 경고 토스트와 상세 모달을 노출한다', async () => {
    jest.useFakeTimers();
    (api.getLoopInstructionStatus as jest.Mock).mockResolvedValue({
      id: 'instr-001',
      instruction: '테스트',
      status: 'dropped',
      queued_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:01Z',
      applied_at: null,
      dropped_reason: 'queue_overflow',
    });

    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Inject Instruction'), { target: { value: '부하 제어 지시' } });
    fireEvent.click(screen.getByRole('button', { name: '등록' }));
    await waitFor(() => expect(api.injectLoopInstruction).toHaveBeenCalledTimes(1));

    act(() => {
      jest.advanceTimersByTime(1300);
    });

    await waitFor(() => {
      expect(screen.getByText('큐 포화로 이전 지시사항 일부가 drop 처리되었습니다. 처리량을 낮추거나 재주입하세요.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '상세 보기' }));
    expect(screen.getByRole('dialog', { name: '큐 오버플로우 상세' })).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('instruction_id: instr-001'))).toBeInTheDocument();

    jest.useRealTimers();
  });

  test('Human Gate 403 응답 시 권한 안내 모달을 노출한다', async () => {
    (api.startRun as jest.Mock).mockResolvedValue({
      id: 301,
      workflow_id: 1,
      status: 'waiting',
      started_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:05Z',
      node_runs: [
        {
          id: 1,
          node_id: 'review',
          node_name: 'Review',
          status: 'approval_pending',
          sequence: 0,
          log: '승인 대기 중',
          artifact_path: null,
          updated_at: '2026-03-05T00:00:05Z',
        },
      ],
    });
    (api.getConstellation as jest.Mock).mockResolvedValue({
      run_id: 301,
      status: 'waiting',
      nodes: [{ id: 'review', label: 'Review', status: 'approval_pending', sequence: 0 }],
      links: [],
    });
    (api.approveRunNode as jest.Mock).mockRejectedValue(
      new ApiError(403, 'insufficient approver role'),
    );

    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Run 시작' }));
    await waitFor(() => expect(api.startRun).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'dashboard-approve' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: '권한 안내' })).toBeInTheDocument();
      expect(screen.getByText('권한이 필요합니다')).toBeInTheDocument();
    });
  });

  test('Human Gate 반려 사유 프리셋을 연속 클릭해도 줄바꿈 포맷이 유지된다', async () => {
    (api.startRun as jest.Mock).mockResolvedValue({
      id: 303,
      workflow_id: 1,
      status: 'waiting',
      started_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:05Z',
      node_runs: [
        {
          id: 1,
          node_id: 'review',
          node_name: 'Review',
          status: 'approval_pending',
          sequence: 0,
          log: '승인 대기 중',
          artifact_path: null,
          updated_at: '2026-03-05T00:00:05Z',
        },
      ],
    });
    (api.getConstellation as jest.Mock).mockResolvedValue({
      run_id: 303,
      status: 'waiting',
      nodes: [{ id: 'review', label: 'Review', status: 'approval_pending', sequence: 0 }],
      links: [],
    });

    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Run 시작' }));
    await waitFor(() => expect(api.startRun).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'dashboard-reject' }));
    const textarea = await screen.findByRole('textbox', { name: '반려 사유' });
    fireEvent.click(screen.getByRole('button', { name: '프리셋 1' }));
    fireEvent.click(screen.getByRole('button', { name: '프리셋 2' }));
    fireEvent.click(screen.getByRole('button', { name: '프리셋 1' }));

    expect(textarea).toHaveValue(
      '요구사항 대비 테스트 커버리지가 부족합니다.\n\n핵심 오류가 재현되어 수정 후 재검토가 필요합니다.',
    );
  });

  test('반려 사유가 개행으로 끝날 때 프리셋 병합은 단일 개행을 유지한다', async () => {
    (api.startRun as jest.Mock).mockResolvedValue({
      id: 304,
      workflow_id: 1,
      status: 'waiting',
      started_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:05Z',
      node_runs: [
        {
          id: 1,
          node_id: 'review',
          node_name: 'Review',
          status: 'approval_pending',
          sequence: 0,
          log: '승인 대기 중',
          artifact_path: null,
          updated_at: '2026-03-05T00:00:05Z',
        },
      ],
    });
    (api.getConstellation as jest.Mock).mockResolvedValue({
      run_id: 304,
      status: 'waiting',
      nodes: [{ id: 'review', label: 'Review', status: 'approval_pending', sequence: 0 }],
      links: [],
    });

    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Run 시작' }));
    await waitFor(() => expect(api.startRun).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'dashboard-reject' }));
    const textarea = await screen.findByRole('textbox', { name: '반려 사유' });
    fireEvent.change(textarea, { target: { value: '선행 검토 의견\n' } });
    fireEvent.click(screen.getByRole('button', { name: '프리셋 2' }));

    expect(textarea).toHaveValue('선행 검토 의견\n핵심 오류가 재현되어 수정 후 재검토가 필요합니다.');
  });

  test.each([
    {
      title: 'Windows 개행이 포함된 본문은 정규화 후 프리셋을 결합한다',
      initial: '기존 의견\r\n',
      expected: '기존 의견\n보안/권한 검증 근거가 부족하여 반려합니다.',
    },
    {
      title: '특수문자 본문도 불필요한 공백 없이 프리셋을 결합한다',
      initial: '재현 로그: [ERR-42] @@',
      expected: '재현 로그: [ERR-42] @@\n\n보안/권한 검증 근거가 부족하여 반려합니다.',
    },
    {
      title: '이미 같은 프리셋이 있는 경우 중복 추가하지 않는다',
      initial: '보안/권한 검증 근거가 부족하여 반려합니다.\n',
      expected: '보안/권한 검증 근거가 부족하여 반려합니다.',
    },
  ])('$title', async ({ initial, expected }) => {
    (api.startRun as jest.Mock).mockResolvedValue({
      id: 305,
      workflow_id: 1,
      status: 'waiting',
      started_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:05Z',
      node_runs: [
        {
          id: 1,
          node_id: 'review',
          node_name: 'Review',
          status: 'approval_pending',
          sequence: 0,
          log: '승인 대기 중',
          artifact_path: null,
          updated_at: '2026-03-05T00:00:05Z',
        },
      ],
    });
    (api.getConstellation as jest.Mock).mockResolvedValue({
      run_id: 305,
      status: 'waiting',
      nodes: [{ id: 'review', label: 'Review', status: 'approval_pending', sequence: 0 }],
      links: [],
    });

    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Run 시작' }));
    await waitFor(() => expect(api.startRun).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'dashboard-reject' }));
    const textarea = await screen.findByRole('textbox', { name: '반려 사유' });
    fireEvent.change(textarea, { target: { value: initial } });
    fireEvent.click(screen.getByRole('button', { name: '프리셋 3' }));

    expect(textarea).toHaveValue(expected);
  });

  test('감사 로그 이력 보기 모달을 열어 Human Gate 이력을 확인한다', async () => {
    (api.startRun as jest.Mock).mockResolvedValue({
      id: 302,
      workflow_id: 1,
      status: 'done',
      started_at: '2026-03-05T00:00:00Z',
      updated_at: '2026-03-05T00:00:12Z',
      node_runs: [
        {
          id: 1,
          node_id: 'review',
          node_name: 'Review',
          status: 'done',
          sequence: 0,
          log: '[human_gate] approved',
          artifact_path: null,
          updated_at: '2026-03-05T00:00:10Z',
        },
      ],
    });
    (api.getConstellation as jest.Mock).mockResolvedValue({
      run_id: 302,
      status: 'done',
      nodes: [{ id: 'review', label: 'Review', status: 'done', sequence: 0 }],
      links: [],
    });
    (api.getStatusArtifactAudits as jest.Mock).mockResolvedValue({
      items: [
        {
          run_id: 302,
          node_id: 'review',
          decision: 'approved',
          decided_by: 'reviewer@main',
          decided_at: '2026-03-05T00:00:10Z',
          payload: { workspace_id: 'main' },
        },
      ],
      total_count: 1,
      limit: 10,
      offset: 0,
    });

    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Run 시작' }));
    await waitFor(() => expect(api.startRun).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(api.getStatusArtifactAudits).toHaveBeenCalledWith(
        302,
        expect.objectContaining({ limit: 10, offset: 0, status: 'all', dateRange: 'all' }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: '이력 보기' }));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Human Gate 감사 로그' })).toBeInTheDocument();
      expect(screen.getByText('approved')).toBeInTheDocument();
      expect(screen.getByText('node: review · by: reviewer@main')).toBeInTheDocument();
    });
  });

  test('SSE 재연결 상태가 되면 상단 네트워크 배너를 노출한다', async () => {
    let capturedHandlers:
      | {
          onRunStatus: (payload: { workflow_id: number; runs: Array<{ id: number; status: string; updated_at: string }> }) => void;
          onStateChange?: (state: 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'failed') => void;
          onReconnectSchedule?: (payload: { attempt: number; delayMs: number }) => void;
        }
      | undefined;

    (api.subscribeWorkflowRuns as jest.Mock).mockImplementation(
      (
        _workflowId: number,
        handlers: {
          onRunStatus: (payload: { workflow_id: number; runs: Array<{ id: number; status: string; updated_at: string }> }) => void;
          onStateChange?: (state: 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'failed') => void;
          onReconnectSchedule?: (payload: { attempt: number; delayMs: number }) => void;
        },
      ) => {
        capturedHandlers = handlers;
        return () => undefined;
      },
    );

    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(capturedHandlers).toBeDefined());

    act(() => {
      capturedHandlers?.onStateChange?.('reconnecting');
      capturedHandlers?.onReconnectSchedule?.({ attempt: 2, delayMs: 1500 });
    });

    expect(screen.getByText('네트워크 복구 중')).toBeInTheDocument();
    expect(screen.getByText('1.50s 후 2회차 재연결 시도')).toBeInTheDocument();
  });

  test('API 연결 실패 시 Graceful 네트워크 폴백 배너를 노출한다', async () => {
    (api.listWorkflows as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('서버 상태가 불안정합니다').length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  test('SSE 재시도 한도 초과 시 서버 통신 실패 배너를 노출한다', async () => {
    let capturedHandlers:
      | {
          onRunStatus: (payload: { workflow_id: number; runs: Array<{ id: number; status: string; updated_at: string }> }) => void;
          onStateChange?: (state: 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'failed') => void;
          onReconnectSchedule?: (payload: { attempt: number; delayMs: number }) => void;
        }
      | undefined;

    (api.subscribeWorkflowRuns as jest.Mock).mockImplementation(
      (
        _workflowId: number,
        handlers: {
          onRunStatus: (payload: { workflow_id: number; runs: Array<{ id: number; status: string; updated_at: string }> }) => void;
          onStateChange?: (state: 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'failed') => void;
          onReconnectSchedule?: (payload: { attempt: number; delayMs: number }) => void;
        },
      ) => {
        capturedHandlers = handlers;
        return () => undefined;
      },
    );

    render(<App />);
    await waitFor(() => expect(api.listWorkflows).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(capturedHandlers).toBeDefined());

    act(() => {
      capturedHandlers?.onStateChange?.('failed');
    });

    expect(screen.getByText('서버 통신 실패')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수동 재시도' })).toBeInTheDocument();
  });
});
