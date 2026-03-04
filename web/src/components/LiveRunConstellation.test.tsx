import { render, screen } from '@testing-library/react';

import LiveRunConstellation from './LiveRunConstellation';
import type { ConstellationData } from '../types';

const fixture: ConstellationData = {
  run_id: 12,
  status: 'running',
  nodes: [
    { id: 'idea', label: 'Idea', status: 'done', sequence: 0 },
    { id: 'plan', label: 'Plan', status: 'running', sequence: 1 },
    { id: 'test', label: 'Test', status: 'queued', sequence: 2 },
  ],
  links: [
    { source: 'idea', target: 'plan' },
    { source: 'plan', target: 'test' },
  ],
};

describe('LiveRunConstellation', () => {
  test('미니맵 SVG와 노드 라벨을 렌더링한다', () => {
    render(<LiveRunConstellation data={fixture} />);

    expect(screen.getByRole('img', { name: '실행 상태 미니맵' })).toBeInTheDocument();
    expect(screen.getByText('Idea')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  test('데이터가 없어도 기본 섹션을 렌더링한다', () => {
    render(<LiveRunConstellation data={null} />);

    expect(screen.getByText('Live Run Constellation')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '실행 상태 미니맵' })).toBeInTheDocument();
  });
});
