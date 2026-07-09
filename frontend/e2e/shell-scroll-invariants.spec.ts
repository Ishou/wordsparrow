import { test, expect } from '@playwright/test';

// The document itself must never scroll — a second scrollbar is the mobile-PWA bug.
const ROUTES = ['/', '/grilles', '/play'];

for (const route of ROUTES) {
  test(`document does not scroll on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    const overflows = await page.evaluate(() => {
      const el = document.scrollingElement as HTMLElement;
      return el.scrollHeight - el.clientHeight;
    });
    // Allow 1px sub-pixel rounding; anything more is a phantom document scroll.
    expect(overflows).toBeLessThanOrEqual(1);
  });
}
