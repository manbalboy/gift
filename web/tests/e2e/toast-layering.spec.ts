import { expect, test } from '@playwright/test';

test('Toast가 캔버스 오버레이보다 위 레이어에서 렌더링된다', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByLabel('시스템 알림')).toBeVisible();
  await expect(page.locator('.react-flow__controls')).toBeVisible();
  await page.getByRole('button', { name: '파싱 오류 시뮬레이션' }).click();
  await expect(page.locator('.toast-content').first()).toBeVisible();

  const zIndex = await page.evaluate(() => {
    const toastStack = document.querySelector('.toast-stack');
    const toastContent = document.querySelector('.toast-content');
    const controls = document.querySelector('.react-flow__controls');
    const miniMap = document.querySelector('.react-flow__minimap');
    if (!toastStack || !toastContent || !controls || !miniMap) {
      return null;
    }

    const toastZ = Number(window.getComputedStyle(toastStack).zIndex || '0');
    const controlZ = Number(window.getComputedStyle(controls).zIndex || '0');
    const miniMapZ = Number(window.getComputedStyle(miniMap).zIndex || '0');
    return { toastZ, controlZ, miniMapZ };
  });

  expect(zIndex).not.toBeNull();
  expect(zIndex?.toastZ ?? 0).toBeGreaterThan(zIndex?.controlZ ?? 0);
  expect(zIndex?.toastZ ?? 0).toBeGreaterThan(zIndex?.miniMapZ ?? 0);
});

test('모바일 뷰포트에서도 Toast가 최상단에 유지되고 레이아웃을 이탈하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByLabel('시스템 알림')).toBeVisible();
  await page.getByRole('button', { name: '파싱 오류 시뮬레이션' }).click();
  await expect(page.locator('.toast').first()).toBeVisible();

  const layeringAndBounds = await page.evaluate(() => {
    const toastStack = document.querySelector('.toast-stack');
    const toast = document.querySelector('.toast');
    const controls = document.querySelector('.react-flow__controls');
    if (!toastStack || !toast || !controls) {
      return null;
    }

    const toastZ = Number(window.getComputedStyle(toastStack).zIndex || '0');
    const controlZ = Number(window.getComputedStyle(controls).zIndex || '0');
    const rect = toast.getBoundingClientRect();
    return {
      toastZ,
      controlZ,
      left: rect.left,
      right: rect.right,
      viewportWidth: window.innerWidth,
    };
  });

  expect(layeringAndBounds).not.toBeNull();
  expect(layeringAndBounds?.toastZ ?? 0).toBeGreaterThan(layeringAndBounds?.controlZ ?? 0);
  expect(layeringAndBounds?.left ?? -1).toBeGreaterThanOrEqual(0);
  expect(layeringAndBounds?.right ?? Number.MAX_SAFE_INTEGER).toBeLessThanOrEqual(
    (layeringAndBounds?.viewportWidth ?? 0) + 0.5,
  );
});

test('모바일 긴 메시지 Toast는 탭으로 확장되고 리사이즈 이후에도 화면 경계를 유지한다', async ({ page }) => {
  await page.route('**/api/webhooks/dev-integration', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        accepted: true,
        provider: 'jenkins',
        category: 'ci',
        event_type: 'ci.completed',
        workflow_id: null,
        warning_code: 'workflow_id_ignored',
        warning_message:
          'this warning is intentionally long for mobile expansion transition verification with viewport resize boundary checks.',
        triggered: false,
        triggered_run_id: null,
      }),
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: 'workflow_id 경고 시뮬레이션' }).click();
  const toast = page.locator('.toast', { hasText: 'intentionally long for mobile expansion transition verification' });
  await expect(toast).toBeVisible();
  await expect(toast).toHaveAttribute('aria-expanded', 'false');

  const collapsedHeight = await toast.evaluate((node) => node.getBoundingClientRect().height);
  await toast.click();
  await expect(toast).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(280);
  const expandedHeight = await toast.evaluate((node) => node.getBoundingClientRect().height);

  expect(expandedHeight).toBeGreaterThan(collapsedHeight);

  await page.setViewportSize({ width: 700, height: 844 });
  await page.waitForTimeout(180);
  const withinViewport = await toast.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth + 0.5;
  });

  expect(withinViewport).toBeTruthy();
});
