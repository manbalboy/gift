import { act, fireEvent, render, screen } from '@testing-library/react';

import SystemAlertWidget from './SystemAlertWidget';
import type { SystemAlertEntry } from '../types';

const alertsFixture: SystemAlertEntry[] = [
  {
    id: 'a-1',
    created_at: '2026-03-05T00:00:01Z',
    level: 'error',
    code: 'ERR_LOCK',
    message: 'error-one',
    source: 'tester',
    context: { path: '/tmp/alerts', risk_score: 91 },
    risk_score: 91,
  },
  {
    id: 'a-2',
    created_at: '2026-03-05T00:00:02Z',
    level: 'warning',
    code: 'WARN_LOCK',
    message: 'warning-one',
    source: 'tester',
    context: { path: '/tmp/alerts', risk_score: 61 },
    risk_score: 61,
  },
  {
    id: 'a-3',
    created_at: '2026-03-05T00:00:03Z',
    level: 'info',
    code: 'INFO_LOCK',
    message: 'info-one',
    source: 'tester',
    context: { path: '/tmp/alerts' },
    risk_score: null,
  },
];

describe('SystemAlertWidget', () => {
  test('필터 칩 클릭 시 Error/Warning 목록만 보여준다', () => {
    render(<SystemAlertWidget alerts={alertsFixture} />);

    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    expect(screen.getByText('ERR_LOCK')).toBeInTheDocument();
    expect(screen.queryByText('WARN_LOCK')).not.toBeInTheDocument();
    expect(screen.queryByText('INFO_LOCK')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Warning' }));
    expect(screen.getByText('WARN_LOCK')).toBeInTheDocument();
    expect(screen.queryByText('ERR_LOCK')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('ERR_LOCK')).toBeInTheDocument();
    expect(screen.getByText('WARN_LOCK')).toBeInTheDocument();
    expect(screen.getByText('INFO_LOCK')).toBeInTheDocument();
  });

  test('필터 결과가 없으면 빈 상태 문구를 보여준다', () => {
    render(<SystemAlertWidget alerts={[alertsFixture[2]]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    expect(screen.getByText('선택한 필터에 해당하는 시스템 경고가 없습니다.')).toBeInTheDocument();
  });

  test('스크롤 위치에 따라 auto-scroll 상태가 PAUSED/LIVE로 전환된다', () => {
    jest.useFakeTimers();
    const denseAlerts = Array.from({ length: 3 }).flatMap((_, batchIdx) =>
      alertsFixture.map((alert) => ({ ...alert, id: `${alert.id}-${batchIdx}` })),
    );
    const { container } = render(<SystemAlertWidget alerts={denseAlerts} />);
    const list = container.querySelector('.system-alert-list') as HTMLDivElement;

    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 400 });

    fireEvent.scroll(list, { target: { scrollTop: 0 } });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByText('PAUSED')).toBeInTheDocument();

    fireEvent.scroll(list, { target: { scrollTop: 302 } });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    jest.useRealTimers();
  });
});
