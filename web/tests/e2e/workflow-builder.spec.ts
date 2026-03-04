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
