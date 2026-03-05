import { expect, test } from '@playwright/test';

test('단절/다중 Entry 그래프 저장 시도는 클라이언트에서 차단된다', async ({ page }) => {
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
      body: JSON.stringify({ id: 999, name: 'Blocked Save', description: '', graph: { nodes: [], edges: [] } }),
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
