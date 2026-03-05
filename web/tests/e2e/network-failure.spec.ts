import { expect, test } from '@playwright/test';

test('3108 프록시 단절이 지속되면 SSE 재연결을 중단하고 실패 배너를 표시한다', async ({ page }) => {
  test.setTimeout(45_000);

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
          name: 'Network Fault Flow',
          description: 'SSE fallback 검증',
          graph: { nodes: [{ id: 'idea', type: 'task', label: 'Idea' }], edges: [] },
        },
      ]),
    });
  });

  await page.route('**/api/workflows/1/runs/stream**', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'upstream 3108 unavailable' }),
    });
  });

  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await expect(page.getByText('네트워크 복구 중')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('서버 통신 실패')).toBeVisible({ timeout: 35_000 });
  await expect(page.getByRole('button', { name: '수동 재시도' })).toBeVisible();
});

test('지연 응답 이후 3108 프록시가 복구되면 SSE 연결이 자동으로 connected 상태로 복귀한다', async ({ page }) => {
  test.setTimeout(45_000);

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
          name: 'Network Recovery Flow',
          description: 'SSE delayed recovery',
          graph: { nodes: [{ id: 'idea', type: 'task', label: 'Idea' }], edges: [] },
        },
      ]),
    });
  });

  let streamAttempt = 0;
  await page.route('**/api/workflows/1/runs/stream**', async (route) => {
    streamAttempt += 1;
    if (streamAttempt <= 2) {
      await page.waitForTimeout(1200);
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'upstream 3108 delayed timeout' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: run_status\ndata: {"workflow_id":1,"runs":[{"id":11,"status":"running","updated_at":"2026-03-05T00:00:05Z"}]}\n\n',
    });
  });

  await page.route('**/api/runs/11', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 11,
        workflow_id: 1,
        status: 'running',
        started_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:05Z',
        node_runs: [],
      }),
    });
  });
  await page.route('**/api/runs/11/constellation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ run_id: 11, status: 'running', nodes: [], links: [] }),
    });
  });
  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/runs/human-gate-alerts/scan**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/runs/11/status-audits**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total_count: 0, limit: 10, offset: 0 }),
    });
  });

  await page.goto('/');
  await expect(page.getByText('네트워크 복구 중')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('서버 통신 실패')).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('실시간 연결 상태 failed')).toHaveCount(0);
});

test('반쪽 연결(half-open) 끊김 이후에도 SSE가 자동 재연결된다', async ({ page }) => {
  test.setTimeout(35_000);

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
          name: 'Half Open Recovery Flow',
          description: 'SSE half-open test',
          graph: { nodes: [{ id: 'idea', type: 'task', label: 'Idea' }], edges: [] },
        },
      ]),
    });
  });

  let streamAttempt = 0;
  await page.route('**/api/workflows/1/runs/stream**', async (route) => {
    streamAttempt += 1;
    if (streamAttempt === 1) {
      await route.abort('connectionaborted');
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: run_status\ndata: {"workflow_id":1,"runs":[{"id":12,"status":"running","updated_at":"2026-03-05T00:00:05Z"}]}\n\n',
    });
  });

  await page.route('**/api/runs/12', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 12,
        workflow_id: 1,
        status: 'running',
        started_at: '2026-03-05T00:00:00Z',
        updated_at: '2026-03-05T00:00:05Z',
        node_runs: [],
      }),
    });
  });
  await page.route('**/api/runs/12/constellation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ run_id: 12, status: 'running', nodes: [], links: [] }),
    });
  });
  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/runs/human-gate-alerts/scan**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/runs/12/status-audits**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total_count: 0, limit: 10, offset: 0 }),
    });
  });

  await page.goto('/');
  await expect(page.getByText('네트워크 복구 중')).toBeVisible({ timeout: 12_000 });
  await expect(page.getByText('서버 통신 실패')).not.toBeVisible({ timeout: 12_000 });
  await expect(page.getByLabel('실시간 연결 상태 failed')).toHaveCount(0);
});
