import { expect, test } from '@playwright/test';

test('WorkflowBuilder에서 노드 추가와 서버 검증이 동작한다', async ({ page }) => {
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

  await page.getByRole('button', { name: '검증' }).click();
  await expect(page.getByText(/유효성 검사 통과/)).toBeVisible();
});

test('모바일 세로 뷰에서는 편집 안내가 노출되고 minimap이 숨겨진다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(
    page.getByText('세로 모바일에서는 모니터링을 우선 제공하며 편집은 가로/태블릿 이상에서 권장됩니다.'),
  ).toBeVisible();
  await expect(page.locator('.react-flow__minimap')).toHaveCount(0);
});
