import { expect, test } from '@playwright/test';

const longToken = 'LOCK_CONTENTION_'.repeat(120);

test('데스크톱에서 SystemAlertWidget이 긴 텍스트에도 가로 오버플로우 없이 렌더링된다', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });

  await page.route('**/api/workflows', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          name: 'Alert Flow',
          description: 'alert layout test',
          graph: { nodes: [{ id: 'idea', type: 'task', label: 'Idea' }], edges: [] },
        },
      ]),
    });
  });

  await page.route('**/api/logs/system-alerts**', async (route) => {
    const payload = Array.from({ length: 14 }).map((_, idx) => ({
      id: `alert-${idx}`,
      created_at: `2026-03-05T00:00:${String(idx).padStart(2, '0')}Z`,
      level: idx % 2 === 0 ? 'error' : 'warning',
      code: `PORT_RACE_${idx}`,
      message: `${longToken}${idx}`,
      source: 'port-checker',
      context: { path: '/tmp/devflow-port-locks', risk_score: 82 },
      risk_score: 82,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: payload, next_cursor: null }),
    });
  });

  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'System Alerts' })).toBeVisible();
  await expect(page.locator('.system-alert-item').first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const list = document.querySelector('.system-alert-list') as HTMLElement | null;
    const items = Array.from(document.querySelectorAll('.system-alert-item')) as HTMLElement[];
    if (!list || items.length === 0) return null;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const listRect = list.getBoundingClientRect();
    const firstItemRect = items[0].getBoundingClientRect();
    const firstMessage = items[0].querySelector('.system-alert-message') as HTMLElement | null;

    return {
      overflowY: window.getComputedStyle(list).overflowY,
      listWithinWidth: listRect.left >= 0 && listRect.right <= viewportWidth + 0.5,
      itemWithinWidth: firstItemRect.left >= 0 && firstItemRect.right <= viewportWidth + 0.5,
      listHeight: listRect.height,
      listHasVerticalScroll: list.scrollHeight > list.clientHeight,
      messageWithinWidth: firstMessage ? firstMessage.scrollWidth <= firstMessage.clientWidth + 0.5 : false,
      riskBadgeVisible: !!items[0].querySelector('.system-alert-risk-high'),
    };
  });

  expect(layout).not.toBeNull();
  expect(layout?.overflowY).toBe('auto');
  expect(layout?.listWithinWidth).toBeTruthy();
  expect(layout?.itemWithinWidth).toBeTruthy();
  expect((layout?.listHeight ?? 0) > 0).toBeTruthy();
  expect(layout?.listHasVerticalScroll).toBeTruthy();
  expect(layout?.messageWithinWidth).toBeTruthy();
  expect(layout?.riskBadgeVisible).toBeTruthy();
});

test('모바일(320px)에서 SystemAlertWidget이 긴 텍스트에도 레이아웃 붕괴 없이 렌더링된다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });

  await page.route('**/api/workflows', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          name: 'Alert Flow Mobile',
          description: 'alert mobile layout test',
          graph: { nodes: [{ id: 'idea', type: 'task', label: 'Idea' }], edges: [] },
        },
      ]),
    });
  });

  await page.route('**/api/logs/system-alerts**', async (route) => {
    const payload = Array.from({ length: 10 }).map((_, idx) => ({
      id: `mobile-alert-${idx}`,
      created_at: `2026-03-05T00:01:${String(idx).padStart(2, '0')}Z`,
      level: idx % 2 === 0 ? 'error' : 'warning',
      code: `MOBILE_PORT_RACE_${idx}`,
      message: `${longToken}${'X'.repeat(320)}${idx}`,
      source: 'port-checker',
      context: { path: '/tmp/devflow-port-locks', risk_score: 88 },
      risk_score: 88,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: payload, next_cursor: null }),
    });
  });

  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'System Alerts' })).toBeVisible();
  await expect(page.locator('.system-alert-item').first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const widget = document.querySelector('.system-alert-widget') as HTMLElement | null;
    const list = document.querySelector('.system-alert-list') as HTMLElement | null;
    const message = document.querySelector('.system-alert-message') as HTMLElement | null;
    if (!widget || !list || !message) return null;

    const widgetRect = widget.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const messageRect = message.getBoundingClientRect();

    return {
      widgetWithinWidth: widgetRect.left >= 0 && widgetRect.right <= viewportWidth + 0.5,
      listWithinWidth: listRect.left >= 0 && listRect.right <= viewportWidth + 0.5,
      messageWithinWidth: messageRect.left >= 0 && messageRect.right <= viewportWidth + 0.5,
      messageHasHorizontalOverflow: message.scrollWidth > message.clientWidth + 0.5,
      bodyHasHorizontalOverflow: document.documentElement.scrollWidth > viewportWidth + 0.5,
    };
  });

  expect(layout).not.toBeNull();
  expect(layout?.widgetWithinWidth).toBeTruthy();
  expect(layout?.listWithinWidth).toBeTruthy();
  expect(layout?.messageWithinWidth).toBeTruthy();
  expect(layout?.messageHasHorizontalOverflow).toBeFalsy();
  expect(layout?.bodyHasHorizontalOverflow).toBeFalsy();
});

test('모바일(320px)에서 필터 칩과 액션 버튼이 함께 동작하고 레이아웃이 유지된다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });

  await page.route('**/api/workflows', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          name: 'Alert Filter Mobile',
          description: 'alert filter mobile test',
          graph: { nodes: [{ id: 'idea', type: 'task', label: 'Idea' }], edges: [] },
        },
      ]),
    });
  });

  await page.route('**/api/logs/system-alerts**', async (route) => {
    const payload = Array.from({ length: 12 }).map((_, idx) => ({
      id: `filter-mobile-${idx}`,
      created_at: `2026-03-05T00:10:${String(idx).padStart(2, '0')}Z`,
      level: idx % 3 === 0 ? 'error' : idx % 3 === 1 ? 'warning' : 'info',
      code: `FILTER_${idx}`,
      message: `filter-message-${idx}-${longToken}`,
      source: 'filter-tester',
      context: { path: '/tmp/devflow-port-locks', risk_score: idx % 3 === 0 ? 90 : 65 },
      risk_score: idx % 3 === 0 ? 90 : 65,
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: payload, next_cursor: null }),
    });
  });

  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'System Alerts' })).toBeVisible();
  await expect(page.locator('.system-alert-item').first()).toBeVisible();

  await page.getByRole('button', { name: 'Error' }).click();
  await expect(page.locator('.system-alert-item')).toHaveCount(4);
  await expect(page.locator('.system-alert-error')).toHaveCount(4);

  await page.getByRole('button', { name: 'Warning' }).click();
  await expect(page.locator('.system-alert-item')).toHaveCount(4);
  await expect(page.locator('.system-alert-warning')).toHaveCount(4);

  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.system-alert-item')).toHaveCount(12);

  const layout = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const toolbar = document.querySelector('.system-alert-toolbar') as HTMLElement | null;
    const chips = document.querySelector('.system-alert-filter-row') as HTMLElement | null;
    const actions = document.querySelector('.system-alert-toolbar-actions') as HTMLElement | null;
    if (!toolbar || !chips || !actions) return null;

    const toolbarRect = toolbar.getBoundingClientRect();
    const chipsRect = chips.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();

    return {
      toolbarWithinWidth: toolbarRect.left >= 0 && toolbarRect.right <= viewportWidth + 0.5,
      chipsWithinWidth: chipsRect.left >= 0 && chipsRect.right <= viewportWidth + 0.5,
      actionsWithinWidth: actionsRect.left >= 0 && actionsRect.right <= viewportWidth + 0.5,
      bodyHasHorizontalOverflow: document.documentElement.scrollWidth > viewportWidth + 0.5,
    };
  });

  expect(layout).not.toBeNull();
  expect(layout?.toolbarWithinWidth).toBeTruthy();
  expect(layout?.chipsWithinWidth).toBeTruthy();
  expect(layout?.actionsWithinWidth).toBeTruthy();
  expect(layout?.bodyHasHorizontalOverflow).toBeFalsy();
});

test('스크롤을 위로 올리면 auto-scroll이 멈추고 최하단 복귀 시 재개된다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.route('**/api/workflows', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          name: 'Alert Scroll',
          description: 'scroll pause resume test',
          graph: { nodes: [{ id: 'idea', type: 'task', label: 'Idea' }], edges: [] },
        },
      ]),
    });
  });

  await page.route('**/api/logs/system-alerts**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const cursor = requestUrl.searchParams.get('cursor');
    const createItems = (start: number, size: number) =>
      Array.from({ length: size }).map((_, idx) => {
        const id = start + idx;
        return {
          id: `scroll-${id}`,
          created_at: `2026-03-05T00:${String(Math.floor(id / 60)).padStart(2, '0')}:${String(id % 60).padStart(2, '0')}Z`,
          level: id % 2 === 0 ? 'error' : 'warning',
          code: `SCROLL_${id}`,
          message: `${longToken}scroll-message-${id}`,
          source: 'scroll-tester',
          context: { path: '/tmp/devflow-port-locks', risk_score: 81 },
          risk_score: 81,
        };
      });

    if (!cursor) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: createItems(0, 45), next_cursor: 'page-2' }),
      });
      return;
    }
    if (cursor === 'page-2') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: createItems(45, 20), next_cursor: 'page-3' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: createItems(65, 10), next_cursor: null }),
    });
  });

  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await expect(page.locator('.system-alert-item').first()).toBeVisible();

  await page.evaluate(() => {
    const list = document.querySelector('.system-alert-list') as HTMLElement | null;
    if (!list) return;
    list.scrollTop = 0;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });

  await expect(page.locator('.system-alert-scroll-state.paused')).toHaveText('PAUSED');
  const beforeLoadMore = await page.evaluate(() => (document.querySelector('.system-alert-list') as HTMLElement).scrollTop);

  await page.locator('.system-alert-footer .btn').click();
  await expect(page.locator('.system-alert-item')).toHaveCount(65);

  const pausedState = await page.evaluate(() => {
    const list = document.querySelector('.system-alert-list') as HTMLElement | null;
    if (!list) return null;
    return {
      scrollTop: list.scrollTop,
      distanceFromBottom: list.scrollHeight - list.scrollTop - list.clientHeight,
    };
  });

  expect(pausedState).not.toBeNull();
  expect(Math.abs((pausedState?.scrollTop ?? 0) - beforeLoadMore)).toBeLessThan(2);
  expect((pausedState?.distanceFromBottom ?? 0) > 16).toBeTruthy();

  await page.evaluate(() => {
    const list = document.querySelector('.system-alert-list') as HTMLElement | null;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });

  await expect(page.locator('.system-alert-scroll-state.live')).toHaveText('LIVE');
  await page.locator('.system-alert-footer .btn').click();
  await expect(page.locator('.system-alert-item')).toHaveCount(75);

  const resumedState = await page.evaluate(() => {
    const list = document.querySelector('.system-alert-list') as HTMLElement | null;
    if (!list) return null;
    return list.scrollHeight - list.scrollTop - list.clientHeight;
  });
  expect(resumedState).not.toBeNull();
  expect((resumedState ?? 999) <= 4).toBeTruthy();
});

test('모바일에서 오류 툴팁이 긴 로그에도 뷰포트 밖으로 이탈하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const failedRun = {
    id: 777,
    workflow_id: 1,
    status: 'failed',
    started_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:10Z',
    node_runs: [
      {
        id: 10,
        node_id: 'idea',
        node_name: 'Idea',
        status: 'failed',
        sequence: 0,
        log: longToken,
        artifact_path: null,
        attempt_count: 3,
        attempt_limit: 3,
        error_snippet: longToken,
        updated_at: '2026-03-05T00:00:10Z',
      },
    ],
  };

  await page.route('**/api/workflows', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          name: 'Tooltip Flow',
          description: 'tooltip layout test',
          graph: { nodes: [{ id: 'idea', type: 'task', label: 'Idea' }], edges: [] },
        },
      ]),
    });
  });

  await page.route('**/api/workflows/1/runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(failedRun) });
  });

  await page.route('**/api/workflows/1/runs/stream**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: run_status\ndata: {"workflow_id":1,"runs":[]}\n\n',
    });
  });

  await page.route('**/api/runs/777', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(failedRun) });
  });

  await page.route('**/api/runs/777/constellation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: 777,
        status: 'failed',
        nodes: [{ id: 'idea', label: 'Idea', status: 'failed', sequence: 0 }],
        links: [],
      }),
    });
  });

  await page.route('**/api/runs/777/status-audits**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total_count: 0, limit: 10, offset: 0 }),
    });
  });

  await page.route('**/api/runs/human-gate-alerts/scan**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/api/logs/system-alerts**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"items":[],"next_cursor":null}' });
  });

  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  const runStartButton = page.getByRole('button', { name: 'Run 시작' });
  await expect(runStartButton).toBeEnabled();
  await runStartButton.click();
  await expect(page.locator('.status-failed').first()).toBeVisible();

  const errorButton = page.locator('.workflow-node-error').first();
  await expect(errorButton).toHaveCount(1);
  await errorButton.evaluate((node) => {
    (node as HTMLButtonElement).click();
  });

  const tooltip = page.locator('.workflow-error-tooltip');
  const tooltipBody = page.locator('.workflow-error-tooltip-body');
  await expect(tooltip).toBeVisible();
  await expect(tooltipBody).toBeVisible();

  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.workflow-error-tooltip') as HTMLElement | null;
    const body = document.querySelector('.workflow-error-tooltip-body') as HTMLElement | null;
    if (!panel || !body) return null;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelRect = panel.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();

    return {
      panelWithinViewport:
        panelRect.left >= 0 && panelRect.right <= viewportWidth + 0.5 && panelRect.bottom <= viewportHeight + 0.5,
      bodyWithinViewport: bodyRect.left >= 0 && bodyRect.right <= viewportWidth + 0.5,
      bodyHasHorizontalOverflow: body.scrollWidth > body.clientWidth + 0.5,
      bodyOverflowY: window.getComputedStyle(body).overflowY,
    };
  });

  expect(layout).not.toBeNull();
  expect(layout?.panelWithinViewport).toBeTruthy();
  expect(layout?.bodyWithinViewport).toBeTruthy();
  expect(layout?.bodyHasHorizontalOverflow).toBeFalsy();
  expect(layout?.bodyOverflowY).toBe('auto');
});
