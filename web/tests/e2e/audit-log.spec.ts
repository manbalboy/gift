import { expect, test } from '@playwright/test';

test('Audit Log 필터와 아티팩트 Sanitization이 함께 동작한다', async ({ page }) => {
  const waitingRun = {
    id: 303,
    workflow_id: 1,
    status: 'waiting',
    started_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:05Z',
    node_runs: [
      {
        id: 1,
        node_id: 'idea',
        node_name: 'Idea',
        status: 'done',
        sequence: 0,
        log: 'ok',
        artifact_path: '/tmp/idea.md',
        updated_at: '2026-03-05T00:00:02Z',
      },
      {
        id: 2,
        node_id: 'review',
        node_name: 'Review',
        status: 'approval_pending',
        sequence: 1,
        log: '승인 대기 중',
        artifact_path: '/tmp/status.md',
        updated_at: '2026-03-05T00:00:03Z',
      },
    ],
  };

  let lastStatusAuditsQuery = '';

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
          name: 'Audit Flow',
          description: 'audit test',
          graph: {
            nodes: [
              { id: 'idea', type: 'task', label: 'Idea' },
              { id: 'review', type: 'human_gate', label: 'Review' },
            ],
            edges: [{ id: 'e1', source: 'idea', target: 'review' }],
          },
        },
      ]),
    });
  });

  await page.route('**/api/workflows/1/runs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(waitingRun),
    });
  });

  await page.route('**/api/workflows/1/runs/stream**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: run_status\ndata: {"workflow_id":1,"runs":[{"id":303,"status":"waiting","updated_at":"2026-03-05T00:00:06Z"}]}\n\n',
    });
  });

  await page.route('**/api/runs/303', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(waitingRun),
    });
  });

  await page.route('**/api/runs/303/constellation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: 303,
        status: 'waiting',
        nodes: [
          { id: 'idea', label: 'Idea', status: 'done', sequence: 0 },
          { id: 'review', label: 'Review', status: 'approval_pending', sequence: 1 },
        ],
        links: [{ source: 'idea', target: 'review' }],
      }),
    });
  });

  await page.route('**/api/runs/303/artifacts/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: 303,
        node_id: 'idea',
        offset: 0,
        next_offset: 0,
        limit: 16384,
        has_more: false,
        content: '악성 페이로드 테스트: <img src=x onerror=alert(1)>',
      }),
    });
  });

  await page.route('**/api/runs/303/status-audits**', async (route) => {
    const url = new URL(route.request().url());
    lastStatusAuditsQuery = url.search;
    const status = url.searchParams.get('status');
    const dateRange = url.searchParams.get('date_range');
    const items =
      status === 'approved' && dateRange === 'today'
        ? [
            {
              run_id: 303,
              node_id: 'review',
              decision: 'approved',
              decided_by: 'reviewer@main',
              decided_at: '2026-03-05T09:10:00Z',
              payload: { workspace_id: 'main' },
            },
          ]
        : [
            {
              run_id: 303,
              node_id: 'review',
              decision: 'rejected',
              decided_by: 'reviewer@main',
              decided_at: '2026-03-04T09:10:00Z',
              payload: { workspace_id: 'main' },
            },
          ];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        total_count: items.length,
        limit: 10,
        offset: 0,
      }),
    });
  });

  await page.route('**/api/runs/human-gate-alerts/scan**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Run 시작' }).click();
  await expect(page.locator('.artifact-pane')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.artifact-pane img')).toHaveCount(0);

  await page.getByRole('button', { name: '이력 보기' }).click();
  await page.getByLabel('상태 필터').selectOption('approved');
  await page.getByLabel('기간 필터').selectOption('today');

  await expect(page.locator('.audit-log-list')).toContainText('approved');
  await expect(page.locator('.audit-log-list')).not.toContainText('rejected');
  expect(lastStatusAuditsQuery).toContain('status=approved');
  expect(lastStatusAuditsQuery).toContain('date_range=today');
  expect(lastStatusAuditsQuery).toContain('tz_offset_minutes=');
});
