import { render, screen } from '@testing-library/react';
import LoopMonitorWidget from './LoopMonitorWidget';
import type { LoopEngineStatus, WorkflowRun } from '../types';

function makeStatus(overrides?: Partial<LoopEngineStatus>): LoopEngineStatus {
  return {
    mode: 'running',
    current_stage: 'analyzer',
    cycle_count: 12,
    emitted_alert_count: 1,
    pending_instruction_count: 0,
    quality_score: 82,
    started_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:01Z',
    ...overrides,
  };
}

function makeRun(overrides?: Partial<WorkflowRun>): WorkflowRun {
  return {
    id: 1,
    workflow_id: 1,
    status: 'running',
    started_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:01Z',
    node_runs: [
      {
        id: 11,
        node_id: 'plan',
        node_name: 'Planner',
        status: 'running',
        sequence: 1,
        log: '',
        artifact_path: null,
        updated_at: '2026-03-05T00:00:01Z',
      },
    ],
    ...overrides,
  };
}

describe('LoopMonitorWidget', () => {
  test('status/run이 없어도 기본 값으로 렌더링된다', () => {
    render(<LoopMonitorWidget status={null} run={null} />);

    expect(screen.getByLabelText('loop-monitor-widget')).toBeInTheDocument();
    expect(screen.getByText('Quality Score')).toBeInTheDocument();
    expect(screen.getByText('Remaining Loops')).toBeInTheDocument();
    expect(screen.getByText('Current Task')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('대기 중')).toBeInTheDocument();
  });

  test.each([
    { score: 90, className: 'loop-monitor-score-good' },
    { score: 60, className: 'loop-monitor-score-warn' },
    { score: 30, className: 'loop-monitor-score-bad' },
    { score: null, className: 'loop-monitor-score-unknown' },
  ])('qualityTone 규칙에 따라 점수 색상 클래스가 적용된다: $score', ({ score, className }) => {
    render(<LoopMonitorWidget status={makeStatus({ quality_score: score })} run={makeRun()} />);
    const scoreNode = screen.getByText(score === null ? '-' : String(score));
    expect(scoreNode).toHaveClass('loop-monitor-score', className);
  });

  test('루프 제한을 초과하면 overrun 값을 경고 색상으로 노출한다', () => {
    render(<LoopMonitorWidget status={makeStatus({ cycle_count: 130, quality_score: 45 })} run={makeRun()} maxLoopCount={120} />);
    expect(screen.getByText('+10')).toHaveClass('loop-monitor-value-overrun');
    expect(screen.getByText('max_loop_count=120 · cycle=130 · overrun=+10')).toHaveClass('loop-monitor-meta-overrun');
  });
});
