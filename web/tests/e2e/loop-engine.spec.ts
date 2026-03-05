import { expect, test } from '@playwright/test';

test('localhost:3100 대상 Loop Engine 제어 파이프라인(Start→Inject→Pause→Resume→Stop)이 동작한다', async ({ page }) => {
  let currentInstructionSeq = 0;
  let pendingInstructions = 0;
  const instructionState = new Map<string, { id: string; instruction: string; status: 'queued' | 'applied' | 'dropped'; queued_at: string; updated_at: string; applied_at: string | null; dropped_reason: string | null }>();

  const loopStatus = {
    mode: 'idle',
    current_stage: null as string | null,
    cycle_count: 0,
    emitted_alert_count: 0,
    pending_instruction_count: 0,
    quality_score: null as number | null,
    started_at: null as string | null,
    updated_at: '2026-03-05T00:00:00Z',
  };

  await page.route('**/api/workflows', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          name: 'Loop Test Workflow',
          description: 'loop-engine e2e',
          graph: { nodes: [{ id: 'idea', type: 'task', label: 'Idea' }], edges: [] },
        },
      ]),
    });
  });

  await page.route('**/api/logs/system-alerts**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null }) });
  });

  await page.route('**/api/webhooks/blocked-events**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/api/loop/status', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(loopStatus) });
  });

  await page.route('**/api/loop/start', async (route) => {
    loopStatus.mode = 'running';
    loopStatus.current_stage = 'analyzer';
    loopStatus.cycle_count += 1;
    loopStatus.quality_score = 66;
    loopStatus.started_at = '2026-03-05T00:00:05Z';
    loopStatus.updated_at = '2026-03-05T00:00:05Z';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(loopStatus) });
  });

  await page.route('**/api/loop/inject', async (route) => {
    const payload = route.request().postDataJSON() as { instruction: string };
    currentInstructionSeq += 1;
    const instructionId = `instr-e2e-${currentInstructionSeq}`;
    pendingInstructions += 1;
    loopStatus.pending_instruction_count = pendingInstructions;
    loopStatus.updated_at = '2026-03-05T00:00:06Z';
    instructionState.set(instructionId, {
      id: instructionId,
      instruction: payload.instruction,
      status: 'queued',
      queued_at: '2026-03-05T00:00:06Z',
      updated_at: '2026-03-05T00:00:06Z',
      applied_at: null,
      dropped_reason: null,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ instruction_id: instructionId, status: loopStatus }),
    });
  });

  await page.route('**/api/loop/pause', async (route) => {
    loopStatus.mode = 'paused';
    loopStatus.current_stage = 'evaluator';
    loopStatus.updated_at = '2026-03-05T00:00:07Z';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(loopStatus) });
  });

  await page.route('**/api/loop/resume', async (route) => {
    loopStatus.mode = 'running';
    loopStatus.current_stage = 'planner';
    loopStatus.updated_at = '2026-03-05T00:00:08Z';
    if (pendingInstructions > 0) {
      pendingInstructions = 0;
      loopStatus.pending_instruction_count = 0;
      for (const item of instructionState.values()) {
        item.status = 'applied';
        item.updated_at = '2026-03-05T00:00:08Z';
        item.applied_at = '2026-03-05T00:00:08Z';
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(loopStatus) });
  });

  await page.route('**/api/loop/stop', async (route) => {
    loopStatus.mode = 'idle';
    loopStatus.current_stage = null;
    loopStatus.pending_instruction_count = 0;
    loopStatus.updated_at = '2026-03-05T00:00:09Z';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(loopStatus) });
  });

  await page.route('**/api/loop/instruction/**', async (route) => {
    const id = route.request().url().split('/').pop() ?? '';
    const found = instructionState.get(id);
    if (!found) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'instruction not found' }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(found) });
  });

  await page.goto('/');

  const loopCard = page.locator('[aria-label="loop-engine-control"]');
  await expect(loopCard).toBeVisible();
  await expect(loopCard.getByText('상태: 대기')).toBeVisible();

  await loopCard.getByRole('button', { name: '시작' }).click();
  await expect(loopCard.getByText('상태: 실행 중')).toBeVisible();

  await loopCard.locator('#loop-instruction-input').fill('품질 점수 70 미만이면 보수적으로 재시도');
  await loopCard.getByRole('button', { name: '등록' }).click();
  await expect(loopCard.getByText('Queued: 1')).toBeVisible();

  await loopCard.getByRole('button', { name: '일시정지' }).click();
  await expect(loopCard.getByText('상태: 일시정지')).toBeVisible();

  await loopCard.getByRole('button', { name: '재개' }).click();
  await expect(loopCard.getByText('상태: 실행 중')).toBeVisible();
  await expect(loopCard.getByText('Queued: 0')).toBeVisible();

  await loopCard.getByRole('button', { name: '중지' }).click();
  await expect(loopCard.getByText('상태: 대기')).toBeVisible();
});
