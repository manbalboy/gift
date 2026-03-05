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
  await page.route('**/api/runs/101/human-gate-audits', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        approved
          ? [
              {
                id: 1,
                run_id: 101,
                node_id: 'review',
                decision: 'approved',
                decided_by: 'reviewer@main',
                decided_at: '2026-03-05T00:00:10Z',
                payload: { workspace_id: 'main' },
              },
            ]
          : [],
      ),
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

test('Human Gate 반려 시 run이 failed로 전이된다', async ({ page }) => {
  const waitingRun = {
    id: 202,
    workflow_id: 1,
    status: 'waiting',
    started_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:05Z',
    node_runs: [
      { id: 1, node_id: 'idea', node_name: 'Idea', status: 'done', sequence: 0, log: 'ok', artifact_path: '/tmp/idea.md', updated_at: '2026-03-05T00:00:02Z' },
      { id: 2, node_id: 'review', node_name: 'Review', status: 'approval_pending', sequence: 1, log: '승인 대기 중', artifact_path: null, updated_at: '2026-03-05T00:00:03Z' },
      { id: 3, node_id: 'pr', node_name: 'PR', status: 'queued', sequence: 2, log: '대기 중', artifact_path: null, updated_at: '2026-03-05T00:00:03Z' },
    ],
  };
  const failedRun = {
    ...waitingRun,
    status: 'failed',
    updated_at: '2026-03-05T00:00:10Z',
    node_runs: [
      waitingRun.node_runs[0],
      { ...waitingRun.node_runs[1], status: 'failed', log: '[human_gate] rejected\n승인 대기 중', updated_at: '2026-03-05T00:00:09Z' },
      waitingRun.node_runs[2],
    ],
  };

  let rejected = false;

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
          description: 'reject flow',
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(waitingRun) });
  });

  await page.route('**/api/workflows/1/runs/stream**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: run_status\ndata: {"workflow_id":1,"runs":[]}\n\n',
    });
  });

  await page.route('**/api/runs/202/constellation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: 202,
        status: rejected ? 'failed' : 'waiting',
        nodes: [
          { id: 'idea', label: 'Idea', status: 'done', sequence: 0 },
          { id: 'review', label: 'Review', status: rejected ? 'failed' : 'approval_pending', sequence: 1 },
          { id: 'pr', label: 'PR', status: 'queued', sequence: 2 },
        ],
        links: [
          { source: 'idea', target: 'review' },
          { source: 'review', target: 'pr' },
        ],
      }),
    });
  });

  await page.route('**/api/runs/202/reject**', async (route) => {
    rejected = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(failedRun) });
  });

  await page.route('**/api/runs/202', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rejected ? failedRun : waitingRun),
    });
  });
  await page.route('**/api/runs/202/human-gate-audits', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        rejected
          ? [
              {
                id: 2,
                run_id: 202,
                node_id: 'review',
                decision: 'rejected',
                decided_by: 'reviewer@main',
                decided_at: '2026-03-05T00:00:09Z',
                payload: { workspace_id: 'main' },
              },
            ]
          : [],
      ),
    });
  });

  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');

  await page.getByRole('button', { name: 'Run 시작' }).click();
  await expect(page.getByRole('button', { name: 'Human Gate 반려' })).toBeEnabled();
  await page.getByRole('button', { name: 'Human Gate 반려' }).click();
  await expect(page.locator('.status-failed').first()).toBeVisible();
});

test('Human Gate 권한이 없으면 403 안내 모달이 표시된다', async ({ page }) => {
  const waitingRun = {
    id: 303,
    workflow_id: 1,
    status: 'waiting',
    started_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:05Z',
    node_runs: [
      { id: 1, node_id: 'review', node_name: 'Review', status: 'approval_pending', sequence: 0, log: '승인 대기 중', artifact_path: null, updated_at: '2026-03-05T00:00:03Z' },
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
          name: 'Human Gate Flow',
          description: 'forbidden flow',
          graph: {
            nodes: [{ id: 'review', type: 'human_gate', label: 'Review' }],
            edges: [],
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(waitingRun) });
  });
  await page.route('**/api/workflows/1/runs/stream**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'event: run_status\ndata: {"workflow_id":1,"runs":[]}\n\n',
    });
  });
  await page.route('**/api/runs/303/constellation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: 303,
        status: 'waiting',
        nodes: [{ id: 'review', label: 'Review', status: 'approval_pending', sequence: 0 }],
        links: [],
      }),
    });
  });
  await page.route('**/api/runs/303/approve**', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'insufficient approver role' }),
    });
  });
  await page.route('**/api/runs/303', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(waitingRun),
    });
  });
  await page.route('**/api/runs/303/human-gate-audits', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Run 시작' }).click();
  await page.getByRole('button', { name: 'Human Gate 승인' }).click();
  await expect(page.getByRole('dialog', { name: '권한 안내' })).toBeVisible();
});
