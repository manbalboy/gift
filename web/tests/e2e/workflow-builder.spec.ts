import { expect, test } from '@playwright/test';

test('WorkflowBuilder에서 노드 추가와 드라이런 검증이 동작한다', async ({ page }) => {
  await page.route('**/api/workflows/validate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        valid: true,
        node_count: 6,
        edge_count: 4,
      }),
    });
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Workflow Canvas' })).toBeVisible();
  await expect(page.locator('[data-testid="workflow-builder-canvas"] .react-flow')).toBeVisible();

  const statusList = page.locator('.builder-status-list .builder-status-item');
  const initialCount = await statusList.count();

  await page.getByRole('button', { name: '노드 추가' }).click();
  await expect(statusList).toHaveCount(initialCount + 1);

  await page.getByRole('button', { name: '드라이런' }).click();
  await expect(page.getByText(/드라이런 성공/)).toBeVisible();
});

test('모바일 세로 뷰에서는 편집 안내가 노출되고 minimap이 숨겨진다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(
    page.getByText('세로 모바일에서는 모니터링을 우선 제공하며 편집은 가로/태블릿 이상에서 권장됩니다.'),
  ).toBeVisible();
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
});

test('캔버스에서 노드를 드래그하면 위치가 변경된다', async ({ page }) => {
  await page.goto('/');
  const firstNode = page.locator('.react-flow__node').first();
  await expect(firstNode).toBeVisible();

  const before = await firstNode.boundingBox();
  expect(before).not.toBeNull();
  if (!before) return;

  await firstNode.hover();
  await page.mouse.down();
  await page.mouse.move(before.x + 120, before.y + 80, { steps: 10 });
  await page.mouse.up();

  const after = await firstNode.boundingBox();
  expect(after).not.toBeNull();
  if (!after) return;

  expect(Math.abs(after.x - before.x)).toBeGreaterThan(30);
  expect(Math.abs(after.y - before.y)).toBeGreaterThan(20);
});

test('순환 연결 시도를 하면 경고 문구가 표시된다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '순환 연결 테스트' }).click();
  await expect(page.getByText('순환 연결은 허용되지 않습니다. 연결 방향을 확인해주세요.')).toBeVisible();
});

test('단절된 노드 그래프 드라이런 실패 시 에러 문구를 노출한다', async ({ page }) => {
  await page.route('**/api/workflows/validate', async (route) => {
    const request = route.request();
    const payload = request.postDataJSON() as {
      nodes?: Array<{ id: string }>;
      edges?: Array<{ id: string; source: string; target: string }>;
    };
    const nodeCount = payload.nodes?.length ?? 0;
    const edgeCount = payload.edges?.length ?? 0;
    if (nodeCount > edgeCount + 1) {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'workflow graph contains disconnected node(s)' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ valid: true, node_count: nodeCount, edge_count: edgeCount }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '노드 추가' }).click();
  await page.getByRole('button', { name: '드라이런' }).click();
  await expect(page.getByText('드라이런 실패: 그래프 규칙을 확인해주세요.')).toBeVisible();
});

test('다중 Entry 검증 실패 응답 시 에러 문구를 노출한다', async ({ page }) => {
  await page.route('**/api/workflows/validate', async (route) => {
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'workflow graph must include exactly one entry node' }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '드라이런' }).click();
  await expect(page.getByText('드라이런 실패: 그래프 규칙을 확인해주세요.')).toBeVisible();
});

test('Pause 상태에서 Run 재개 버튼이 resume API를 호출한다', async ({ page }) => {
  const runId = 901;
  let runStatus: 'paused' | 'running' = 'paused';
  let resumeCalled = false;

  const pausedRun = {
    id: runId,
    workflow_id: 1,
    status: 'paused',
    started_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:05Z',
    node_runs: [
      {
        id: 11,
        node_id: 'test',
        node_name: 'Test',
        status: 'paused',
        sequence: 0,
        log: '[pause] node timeout exceeded',
        artifact_path: null,
        updated_at: '2026-03-05T00:00:05Z',
      },
    ],
  };
  const runningRun = {
    ...pausedRun,
    status: 'running',
    node_runs: [{ ...pausedRun.node_runs[0], status: 'running', log: '[resume] node resumed by user' }],
    updated_at: '2026-03-05T00:00:06Z',
  };

  await page.route('**/api/workflows', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            name: 'Paused Flow',
            description: 'resume scenario',
            graph: { nodes: [{ id: 'test', type: 'task', label: 'Test' }], edges: [] },
          },
        ]),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/workflows/1/runs', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pausedRun),
    });
  });

  await page.route('**/api/runs/901', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(runStatus === 'paused' ? pausedRun : runningRun),
    });
  });

  await page.route('**/api/runs/901/constellation', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: runId,
        status: runStatus,
        nodes: [{ id: 'test', label: 'Test', status: runStatus, sequence: 0 }],
        links: [],
      }),
    });
  });

  await page.route('**/api/runs/901/resume', async (route) => {
    resumeCalled = true;
    runStatus = 'running';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(runningRun),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Run 시작' }).click();
  await expect(page.getByText('실행 일시정지 감지')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run 재개' }).first()).toBeEnabled();

  await page.getByRole('button', { name: 'Run 재개' }).first().click();

  await expect
    .poll(() => resumeCalled, { message: 'resume endpoint should be called' })
    .toBeTruthy();
});

test('단절/다중 Entry 그래프는 저장 전에 클라이언트에서 차단되고 에러 UI를 노출한다', async ({ page }) => {
  let saveCallCount = 0;
  await page.route('**/api/workflows', async (route) => {
    const method = route.request().method().toUpperCase();
    if (method === 'GET') {
      await route.continue();
      return;
    }
    saveCallCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 999,
        name: 'Blocked Save',
        description: '',
        graph: { nodes: [], edges: [] },
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '노드 추가' }).click();
  await page.getByRole('button', { name: '저장' }).click();

  const message = '저장 실패: 다중 Entry 또는 단절된 노드가 있습니다. 그래프는 정확히 1개의 Entry 노드여야 합니다.';
  await expect(page.locator('.builder-validation')).toHaveText(message);
  await expect(page.getByTestId('toast-stack').getByText(message)).toBeVisible();
  expect(saveCallCount).toBe(0);
});

test('실패 상태 수신 시 캔버스 노드가 Failed(red) 스타일로 렌더링된다', async ({ page }) => {
  const runId = 990;
  const workflow = {
    id: 1,
    name: 'Failure Render Flow',
    description: 'failed node rendering',
    graph: {
      nodes: [
        { id: 'idea', type: 'task', label: 'Idea' },
        { id: 'test', type: 'task', label: 'Test' },
      ],
      edges: [{ id: 'e1', source: 'idea', target: 'test' }],
    },
  };
  const failedRun = {
    id: runId,
    workflow_id: 1,
    status: 'failed',
    started_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:09Z',
    node_runs: [
      {
        id: 100,
        node_id: 'idea',
        node_name: 'Idea',
        status: 'done',
        sequence: 0,
        log: 'ok',
        artifact_path: '/tmp/idea.md',
        updated_at: '2026-03-05T00:00:05Z',
      },
      {
        id: 101,
        node_id: 'test',
        node_name: 'Test',
        status: 'failed',
        sequence: 1,
        log: '[resume_failed] workspace missing',
        artifact_path: null,
        updated_at: '2026-03-05T00:00:09Z',
      },
    ],
  };

  await page.route('**/api/workflows', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([workflow]) });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/workflows/1/runs', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(failedRun) });
  });
  await page.route(`**/api/runs/${runId}`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(failedRun) });
  });
  await page.route(`**/api/runs/${runId}/constellation`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run_id: runId,
        status: 'failed',
        nodes: [
          { id: 'idea', label: 'Idea', status: 'done', sequence: 0 },
          { id: 'test', label: 'Test', status: 'failed', sequence: 1 },
        ],
        links: [{ source: 'idea', target: 'test' }],
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Run 시작' }).click();

  const failedNode = page.locator('.react-flow__node.status-failed').first();
  await expect(failedNode).toBeVisible();
  await expect(failedNode.getByText('failed')).toBeVisible();
});
