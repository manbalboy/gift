import { expect, test } from '@playwright/test';

test('Human Gate 대기 후 승인하면 워크플로우가 재개되어 완료된다', async ({ page }) => {
  const waitingRun = {
    id: 101,
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
        artifact_path: null,
        updated_at: '2026-03-05T00:00:03Z',
      },
      {
        id: 3,
        node_id: 'pr',
        node_name: 'PR',
        status: 'queued',
        sequence: 2,
        log: '대기 중',
        artifact_path: null,
        updated_at: '2026-03-05T00:00:03Z',
      },
    ],
  };
  const doneRun = {
    ...waitingRun,
    status: 'done',
    updated_at: '2026-03-05T00:00:15Z',
    node_runs: [
      waitingRun.node_runs[0],
      {
        ...waitingRun.node_runs[1],
        status: 'done',
        log: '[human_gate] approved\n승인 대기 중',
        artifact_path: '/tmp/review.md',
        updated_at: '2026-03-05T00:00:10Z',
      },
      {
        ...waitingRun.node_runs[2],
        status: 'done',
        log: 'ok',
        artifact_path: '/tmp/pr.md',
        updated_at: '2026-03-05T00:00:14Z',
      },
    ],
  };

  let approved = false;

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
          name: 'Human Gate Flow',
          description: 'approve flow',
          graph: {
            nodes: [
              { id: 'idea', type: 'task', label: 'Idea' },
              { id: 'review', type: 'human_gate', label: 'Review' },
              { id: 'pr', type: 'task', label: 'PR' },
            ],
            edges: [
              { id: 'e1', source: 'idea', target: 'review' },
              { id: 'e2', source: 'review', target: 'pr' },
            ],
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
      body: 'event: run_status\ndata: {"workflow_id":1,"runs":[]}\n\n',
    });
  });

  await page.route('**/api/runs/101/constellation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: 101,
        status: approved ? 'done' : 'waiting',
        nodes: [
          { id: 'idea', label: 'Idea', status: 'done', sequence: 0 },
          { id: 'review', label: 'Review', status: approved ? 'done' : 'approval_pending', sequence: 1 },
          { id: 'pr', label: 'PR', status: approved ? 'done' : 'queued', sequence: 2 },
        ],
        links: [
          { source: 'idea', target: 'review' },
          { source: 'review', target: 'pr' },
        ],
      }),
    });
  });

  await page.route('**/api/runs/101/approve**', async (route) => {
    approved = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(doneRun),
    });
  });

  await page.route('**/api/runs/101', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(approved ? doneRun : waitingRun),
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
  await expect(page.getByRole('button', { name: 'Human Gate 승인' })).toBeEnabled();
  await expect(page.locator('.status-approval_pending').first()).toBeVisible();

  await page.getByRole('button', { name: 'Human Gate 승인' }).click();

  await expect(page.locator('.status-done').first()).toBeVisible();
  await page.getByText('실행 로그').click();
  await expect(page.locator('.log-pane').first()).toContainText('[human_gate] approved');
});
