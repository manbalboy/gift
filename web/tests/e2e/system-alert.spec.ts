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
      context: { path: '/tmp/devflow-port-locks' },
    }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
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
    };
  });

  expect(layout).not.toBeNull();
  expect(layout?.overflowY).toBe('auto');
  expect(layout?.listWithinWidth).toBeTruthy();
  expect(layout?.itemWithinWidth).toBeTruthy();
  expect((layout?.listHeight ?? 0) > 0).toBeTruthy();
  expect(layout?.listHasVerticalScroll).toBeTruthy();
  expect(layout?.messageWithinWidth).toBeTruthy();
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
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
