import { expect, test } from '@playwright/test';

test('3100 환경에서 대용량 system alerts 스트리밍 시 렌더링이 안정적이다', async ({ page }) => {
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
          name: 'Stress Flow',
          description: 'system alert stress',
          graph: { nodes: [{ id: 'idea', type: 'task', label: 'Idea' }], edges: [] },
        },
      ]),
    });
  });

  await page.route('**/api/loop/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'running',
        current_stage: 'executor',
        cycle_count: 42,
        emitted_alert_count: 10_000,
        quality_score: 84,
        started_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:00Z',
      }),
    });
  });

  let pollCount = 0;
  await page.route('**/api/logs/system-alerts**', async (route) => {
    pollCount += 1;
    const alerts = Array.from({ length: 5000 }).map((_, idx) => ({
      id: `stress-${pollCount}-${idx}`,
      created_at: `2026-03-05T00:${String(Math.floor(idx / 60) % 60).padStart(2, '0')}:${String(idx % 60).padStart(2, '0')}Z`,
      level: idx % 7 === 0 ? 'error' : idx % 3 === 0 ? 'warning' : 'info',
      code: `STRESS_${pollCount}_${idx}`,
      message: `stress-message-${pollCount}-${idx}`,
      source: 'stress-tester',
      context: { risk_score: idx % 100 },
      risk_score: idx % 100,
    }));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: alerts, next_cursor: null }),
    });
  });

  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'System Alerts' })).toBeVisible();
  await expect(page.locator('.system-alert-item').first()).toBeVisible();

  await page.waitForTimeout(3600);
  expect(pollCount).toBeGreaterThanOrEqual(2);

  const metrics = await page.evaluate(() => {
    const list = document.querySelector('.system-alert-list') as HTMLDivElement | null;
    const items = document.querySelectorAll('.system-alert-item');
    if (!list) return null;

    const start = performance.now();
    for (let i = 0; i < 40; i += 1) {
      list.scrollTop = Math.max(0, list.scrollHeight - list.clientHeight - i * 24);
    }
    const elapsed = performance.now() - start;

    return {
      renderedCount: items.length,
      hasVerticalOverflow: list.scrollHeight > list.clientHeight,
      scrollLoopElapsedMs: elapsed,
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics?.renderedCount ?? 0).toBeLessThan(140);
  expect(metrics?.hasVerticalOverflow).toBeTruthy();
  expect((metrics?.scrollLoopElapsedMs ?? Number.POSITIVE_INFINITY) < 650).toBeTruthy();
});
