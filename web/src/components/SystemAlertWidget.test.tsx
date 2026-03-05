import { act, fireEvent, render, screen } from '@testing-library/react';

import SystemAlertWidget, { filterSystemAlerts } from './SystemAlertWidget';
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
  test('악성 스크립트 문자열을 텍스트로 안전하게 렌더링하고 토큰을 마스킹한다', () => {
    render(
      <SystemAlertWidget
        alerts={[
          {
            ...alertsFixture[0],
            id: 'xss-1',
            message: '<img src=x onerror=alert(1)> Bearer top-secret-token',
            source: 'token=abc123',
          },
        ]}
      />,
    );

    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.classList.contains('system-alert-message') ?? false)).toHaveTextContent(
      'Bearer ***[MASKED]***',
    );
  });

  test('http/https 링크와 티켓 패턴을 안전한 외부 링크로 렌더링한다', () => {
    render(
      <SystemAlertWidget
        alerts={[
          {
            ...alertsFixture[0],
            id: 'link-1',
            message: '가이드 https://docs.example.com/runbook?x=1, 티켓 AGENT-321 확인',
            source: 'tester',
          },
        ]}
      />,
    );

    const urlAnchor = screen.getByRole('link', { name: 'https://docs.example.com/runbook?x=1' });
    expect(urlAnchor).toHaveAttribute('target', '_blank');
    expect(urlAnchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(urlAnchor).toHaveAttribute('href', 'https://docs.example.com/runbook?x=1');

    const ticketAnchor = screen.getByRole('link', { name: 'AGENT-321' });
    expect(ticketAnchor).toHaveAttribute('target', '_blank');
    expect(ticketAnchor).toHaveAttribute('rel', 'noopener noreferrer');
    expect(ticketAnchor).toHaveAttribute('href', 'https://github.com/search?type=issues&q=AGENT-321');
  });

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

  test('필터 변경 시 스크롤 위치를 최상단으로 초기화한다', () => {
    const denseAlerts = Array.from({ length: 10 }).flatMap((_, batchIdx) =>
      alertsFixture.map((alert) => ({ ...alert, id: `${alert.id}-${batchIdx}` })),
    );
    const { container } = render(<SystemAlertWidget alerts={denseAlerts} />);
    const list = container.querySelector('.system-alert-list') as HTMLDivElement;

    list.scrollTop = 180;
    fireEvent.click(screen.getByRole('button', { name: 'Error' }));
    expect(list.scrollTop).toBe(0);
  });

  test('백그라운드 탭 복귀 시 스크롤 상태를 동기화한다', () => {
    jest.useFakeTimers();
    const originalVisibility = document.visibilityState;
    const denseAlerts = Array.from({ length: 5 }).flatMap((_, batchIdx) =>
      alertsFixture.map((alert) => ({ ...alert, id: `${alert.id}-${batchIdx}` })),
    );
    const { container } = render(<SystemAlertWidget alerts={denseAlerts} />);
    const list = container.querySelector('.system-alert-list') as HTMLDivElement;

    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 400 });
    list.scrollTop = 0;
    fireEvent.scroll(list, { target: { scrollTop: 0 } });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByText('PAUSED')).toBeInTheDocument();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    act(() => {
      jest.advanceTimersByTime(16);
    });
    expect(screen.getByText('PAUSED')).toBeInTheDocument();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: originalVisibility });
    jest.useRealTimers();
  });

  test('대용량 데이터에서도 필터링 연산이 제한 시간 내 완료된다', () => {
    const largeAlerts = Array.from({ length: 12_000 }).map((_, idx) => ({
      id: `perf-${idx}`,
      created_at: '2026-03-05T00:00:00Z',
      level: idx % 2 === 0 ? 'error' : 'warning',
      code: `PERF_${idx}`,
      message: `message-${idx}`,
      source: 'perf',
      context: {},
      risk_score: idx % 100,
    })) as SystemAlertEntry[];

    const start = performance.now();
    for (let i = 0; i < 40; i += 1) {
      filterSystemAlerts(largeAlerts, i % 2 === 0 ? 'error' : 'warning');
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1200);
  });

  test('가상화 적용 시 대량 경고에서도 DOM 렌더 수를 제한한다', () => {
    const largeAlerts = Array.from({ length: 10_000 }).map((_, idx) => ({
      id: `virtual-${idx}`,
      created_at: '2026-03-05T00:00:00Z',
      level: idx % 2 === 0 ? 'error' : 'warning',
      code: `CODE_${idx}`,
      message: `message-${idx}`,
      source: 'source',
      context: {},
      risk_score: null,
    })) as SystemAlertEntry[];

    const { container } = render(<SystemAlertWidget alerts={largeAlerts} />);
    const list = container.querySelector('.system-alert-list') as HTMLDivElement;
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 320 });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1160000 });
    fireEvent.scroll(list, { target: { scrollTop: 0 } });

    const renderedItems = container.querySelectorAll('[data-testid=\"system-alert-item\"]');
    expect(renderedItems.length).toBeLessThan(80);
    expect(screen.queryByText('CODE_9000')).not.toBeInTheDocument();
  });
});
