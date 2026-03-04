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
