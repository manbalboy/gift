import { render, screen } from '@testing-library/react';

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
});
