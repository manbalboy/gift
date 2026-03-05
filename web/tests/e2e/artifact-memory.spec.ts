import { expect, test } from '@playwright/test';

const FIFTY_MB_TEXT = `HEADER\n${'line-data-0123456789abcdef\n'.repeat(2_000_000)}`;

test('50MB 아티팩트를 가상화로 렌더링하고 검색 이동 시 OOM 없이 동작한다', async ({ page }) => {
  test.setTimeout(60_000);

  const run = {
    id: 901,
    workflow_id: 1,
    status: 'running',
    started_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:05Z',
    node_runs: [
      {
        id: 1,
        node_id: 'code',
        node_name: 'Code',
        status: 'running',
        sequence: 0,
        log: 'running',
        artifact_path: '/tmp/code.md',
        updated_at: '2026-03-05T00:00:05Z',
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
          name: 'Large Artifact Flow',
          description: '50MB artifact',
          graph: { nodes: [{ id: 'code', type: 'task', label: 'Code' }], edges: [] },
        },
      ]),
    });
  });
  await page.route('**/api/workflows/1/runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(run) });
  });
  await page.route('**/api/workflows/1/runs/stream**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: run_status\ndata: {"workflow_id":1,"runs":[]}\n\n',
    });
  });
  await page.route('**/api/runs/901/constellation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: 901,
        status: 'running',
        nodes: [{ id: 'code', label: 'Code', status: 'running', sequence: 0 }],
        links: [],
      }),
    });
  });
  await page.route('**/api/runs/901', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(run) });
  });
  await page.route('**/api/runs/901/artifacts/code**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        node_id: 'code',
        offset: 0,
        next_offset: FIFTY_MB_TEXT.length,
        has_more: false,
        content: FIFTY_MB_TEXT,
      }),
    });
  });
  await page.route('**/api/runs/901/status-audits**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total_count: 0, limit: 10, offset: 0 }),
    });
  });
  await page.route('**/api/runs/human-gate-alerts/scan**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Run 시작' }).click();
  await expect(page.getByText('대용량 아티팩트 감지')).toBeVisible({ timeout: 30_000 });
  const heapBefore = await page.evaluate(() => {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return perf.memory?.usedJSHeapSize ?? -1;
  });

  await page.getByRole('textbox', { name: '뷰어 내 검색' }).fill('line-data');
  await page.getByRole('button', { name: '다음 결과' }).click({ force: true });
  await page.getByRole('button', { name: '다음 결과' }).click({ force: true });
  await expect(page.locator('.artifact-highlight-active').first()).toBeVisible();

  const heapAfter = await page.evaluate(() => {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return perf.memory?.usedJSHeapSize ?? -1;
  });
  if (heapBefore >= 0 && heapAfter >= 0) {
    expect(heapAfter - heapBefore).toBeLessThan(300 * 1024 * 1024);
  }
});
