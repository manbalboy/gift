import { expect, test } from '@playwright/test';

test('Toast가 캔버스 오버레이보다 위 레이어에서 렌더링된다', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.react-flow__controls')).toBeVisible();
  await page.getByRole('button', { name: '파싱 오류 시뮬레이션' }).click();
  await expect(page.locator('.toast-stack .toast').first()).toBeVisible();
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

test('모바일에서 스와이프 임계값을 넘기면 Toast가 닫힌다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: '파싱 오류 시뮬레이션' }).click();
  const toast = page.locator('.toast').first();
  await expect(toast).toBeVisible();

  const swiped = await toast.evaluate((node) => {
    const dispatch = (type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number) => {
      const target = node as HTMLElement;
      const baseInit = { bubbles: true, cancelable: true, composed: true };
      const event = (() => {
        if (typeof Touch === 'function' && typeof TouchEvent === 'function') {
          const touch = new Touch({
            identifier: 1,
            target,
            clientX: x,
            clientY: y,
            pageX: x,
            pageY: y,
            screenX: x,
            screenY: y,
            radiusX: 2,
            radiusY: 2,
            rotationAngle: 0,
            force: 1,
          });
          const touches = type === 'touchend' ? [] : [touch];
          return new TouchEvent(type, { ...baseInit, touches, targetTouches: touches, changedTouches: [touch] });
        }
        const fallback = new Event(type, baseInit);
        const touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
        Object.defineProperty(fallback, 'touches', { configurable: true, value: touches });
        Object.defineProperty(fallback, 'targetTouches', { configurable: true, value: touches });
        Object.defineProperty(fallback, 'changedTouches', { configurable: true, value: touches });
        return fallback;
      })();
      target.dispatchEvent(event);
    };

    dispatch('touchstart', 180, 240);
    dispatch('touchmove', 300, 242);
    dispatch('touchend', 300, 242);
    return true;
  });

  expect(swiped).toBeTruthy();
  await expect(toast).toHaveCount(0);
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
  const expandButton = toast.getByRole('button', { name: '펼치기' });
  await expect(expandButton).toBeVisible();
  await expect(expandButton).toHaveAttribute('aria-expanded', 'false');

  const collapsedHeight = await toast.evaluate((node) => node.getBoundingClientRect().height);
  await expandButton.click();
  await expect(toast).toHaveAttribute('aria-expanded', 'true');
  await expect(toast.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true');
  await page.waitForTimeout(280);
  const expandedHeight = await toast.evaluate((node) => node.getBoundingClientRect().height);

  expect(expandedHeight).toBeGreaterThan(collapsedHeight);

  const resizeTargets = [700, 420, 760, 390, 820];
  for (const width of resizeTargets) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(110);
  }
  const withinViewport = await toast.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth + 0.5;
  });

  expect(withinViewport).toBeTruthy();
  await expect(toast).toBeVisible();
});

test('4개 이상 알림 발생 후 일괄 닫기로 큐를 비울 수 있다', async ({ page }) => {
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
        warning_message: `clear-all-test-${Date.now()}`,
        triggered: false,
        triggered_run_id: null,
      }),
    });
  });

  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'workflow_id 경고 시뮬레이션' });
  for (let i = 0; i < 4; i += 1) {
    await trigger.click();
  }

  await expect(page.locator('.toast')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '모든 알림 닫기' })).toBeVisible();
  await page.getByRole('button', { name: '모든 알림 닫기' }).click();

  await expect(page.locator('.toast')).toHaveCount(0);
});

test('Toast는 레벨에 맞는 ARIA role과 aria-live 속성을 유지한다', async ({ page }) => {
  await page.route('**/api/webhooks/dev-integration', async (route) => {
    const raw = route.request().postData() ?? '';
    const isMalformedPayload = raw.includes('"provider":"jenkins"') && !raw.endsWith('}');
    if (isMalformedPayload) {
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Malformed JSON payload' }),
      });
      return;
    }
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
        warning_message: `aria-warning-${Date.now()}`,
        triggered: false,
        triggered_run_id: null,
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'workflow_id 경고 시뮬레이션' }).click();
  await page.getByRole('button', { name: '파싱 오류 시뮬레이션' }).click();

  const warningToast = page.locator('.toast[role="status"]').first();
  const errorToast = page.locator('.toast[role="alert"]').first();

  await expect(warningToast).toBeVisible();
  await expect(errorToast).toBeVisible();
  await expect(warningToast).toHaveAttribute('aria-live', 'polite');
  await expect(errorToast).toHaveAttribute('aria-live', 'polite');
});

test('브라우저 Hover/Focus 상호작용 중에는 자동 닫힘이 일시 정지되고 해제 시 재개된다', async ({ page }) => {
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
        warning_message: `pause-resume-${Date.now()}`,
        triggered: false,
        triggered_run_id: null,
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'workflow_id 경고 시뮬레이션' }).click();

  const firstToast = page.locator('.toast[role="status"]').first();
  await expect(firstToast).toBeVisible();
  await page.waitForTimeout(1200);
  await firstToast.hover();
  await page.waitForTimeout(2600);
  await expect(firstToast).toBeVisible();

  await page.mouse.move(0, 0);
  await page.waitForTimeout(900);
  await expect(firstToast).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(firstToast).toHaveCount(0);

  await page.getByRole('button', { name: 'workflow_id 경고 시뮬레이션' }).click();
  const secondToast = page.locator('.toast[role="status"]').first();
  await expect(secondToast).toBeVisible();
  await page.waitForTimeout(1000);

  const closeButton = secondToast.getByRole('button', { name: '알림 닫기' });
  await closeButton.focus();
  await page.waitForTimeout(2400);
  await expect(secondToast).toBeVisible();

  await page.getByRole('button', { name: 'workflow_id 경고 시뮬레이션' }).focus();
  await page.waitForTimeout(1100);
  await expect(secondToast).toHaveCount(0);
});

test('모바일 긴 메시지 Toast에서 Tab 키로 펼치기/닫기 버튼에 접근하고 조작할 수 있다', async ({ page }) => {
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
          'keyboard tab accessibility verification message for mobile toast expansion and close actions in sequence.',
        triggered: false,
        triggered_run_id: null,
      }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'workflow_id 경고 시뮬레이션' }).click();

  const toast = page.locator('.toast', { hasText: 'keyboard tab accessibility verification message' });
  const expandButton = toast.getByRole('button', { name: '펼치기' });
  const closeButton = toast.getByRole('button', { name: '알림 닫기' });

  await expect(toast).toBeVisible();
  await expect(expandButton).toBeVisible();
  await expect(toast).toHaveAttribute('aria-expanded', 'false');

  await toast.evaluate((node) => {
    const target = node as HTMLElement;
    target.setAttribute('tabindex', '-1');
    target.focus();
  });
  await expect(toast).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(expandButton).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(toast).toHaveAttribute('aria-expanded', 'true');
  await expect(toast.getByRole('button', { name: '접기' })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(toast).toHaveCount(0);
});
