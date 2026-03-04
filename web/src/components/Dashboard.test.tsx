import { fireEvent, render, screen } from '@testing-library/react';

import Dashboard from './Dashboard';
import type { WorkflowRun } from '../types';

const runFixture: WorkflowRun = {
  id: 41,
  workflow_id: 7,
  status: 'running',
  started_at: '2026-03-04T10:00:00Z',
  updated_at: '2026-03-04T10:02:30Z',
  node_runs: [
    {
      id: 1,
      node_id: 'idea',
      node_name: 'Idea',
      status: 'done',
      sequence: 0,
      log: 'ok',
      artifact_path: '/tmp/idea.md',
      updated_at: '2026-03-04T10:00:10Z',
    },
    {
      id: 2,
      node_id: 'test',
      node_name: 'Test',
      status: 'failed',
      sequence: 1,
      log: 'broken',
      artifact_path: null,
      updated_at: '2026-03-04T10:02:20Z',
    },
  ],
};

describe('Dashboard', () => {
  test('KPI를 렌더링하고 병목/테스트 통과율을 표시한다', () => {
    render(<Dashboard run={runFixture} />);

    expect(screen.getByText('Run Timeline & KPI')).toBeInTheDocument();
    expect(screen.getByText('2m 30s')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getAllByText('test').length).toBeGreaterThan(0);
    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  test('run이 없으면 빈 상태 문구를 보여준다', () => {
    render(<Dashboard run={null} />);

    expect(screen.getByText('워크플로우 실행을 시작하면 실시간 상태가 표시됩니다.')).toBeInTheDocument();
  });

  test('웹훅 피드백 액션 버튼 클릭 시 콜백을 호출한다', () => {
    const onTriggerMalformedWebhook = jest.fn().mockResolvedValue(undefined);
    const onTriggerInvalidWorkflowWebhook = jest.fn().mockResolvedValue(undefined);

    render(
      <Dashboard
        run={runFixture}
        onTriggerMalformedWebhook={onTriggerMalformedWebhook}
        onTriggerInvalidWorkflowWebhook={onTriggerInvalidWorkflowWebhook}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '파싱 오류 시뮬레이션' }));
    fireEvent.click(screen.getByRole('button', { name: 'workflow_id 오류 시뮬레이션' }));

    expect(onTriggerMalformedWebhook).toHaveBeenCalledTimes(1);
    expect(onTriggerInvalidWorkflowWebhook).toHaveBeenCalledTimes(1);
  });

  test('Webhook 차단 로그를 표시한다', () => {
    render(
      <Dashboard
        run={runFixture}
        blockedEvents={[
          {
            id: 'evt-1',
            created_at: '2026-03-04T10:03:00Z',
            reason: 'invalid_signature',
            client_ip: '203.0.113.11',
            provider: 'github',
            event_type: 'pull_request',
            detail: 'invalid github signature',
          },
        ]}
      />,
    );

    expect(screen.getByText('Webhook 차단 로그')).toBeInTheDocument();
    expect(screen.getByText('invalid_signature')).toBeInTheDocument();
    expect(screen.getByText('invalid github signature')).toBeInTheDocument();
    expect(screen.getByText('github · pull_request · 203.0.113.11')).toBeInTheDocument();
  });
});
