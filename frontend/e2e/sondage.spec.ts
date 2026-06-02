// /contribuer smoke test. The survey-api surface is served by the MSW
// preview deck (handlers/survey.ts) — page.route cannot intercept it
// because MSW's service worker controls the page. Anon overrides go
// through the `__mswReady__` seam that main.tsx awaits before its first
// loader fetch (see enableMocks), so the override lands pre-render.

import { expect, test } from '@playwright/test';

test.describe('/contribuer', () => {
  test('loads the authed rating card, submits a verdict, and advances', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('wordsparrow.tour.seen', 'true');
    });

    await page.goto('/contribuer');
    await page.waitForSelector('[data-testid="rating-card"]', { state: 'visible' });
    await expect(page.locator('h2', { hasText: 'AUTOMNE' })).toBeVisible();
    // Authed contributors get the enrichable metadata band.
    await expect(page.getByTestId('metadata-band')).toBeVisible();

    await page.locator('[data-verdict="GOOD"]').click();

    await expect(page.locator('h2', { hasText: 'SOURIS' })).toBeVisible();
  });

  test('renders the sign-in banner for anon visitors and hides the meta band', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('wordsparrow.tour.seen', 'true');
      // Seed a deferred gate main.tsx awaits; resolve it once the MSW seam
      // is live and the whoami handler is overridden to 401 (anonymous).
      const w = window as unknown as {
        __msw__?: { worker: { use: (...h: unknown[]) => void }; http: any; HttpResponse: any };
        __mswReady__?: Promise<void>;
      };
      w.__mswReady__ = new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (!w.__msw__) return;
          clearInterval(timer);
          w.__msw__.worker.use(
            w.__msw__.http.get('*/v1/auth/whoami', () => new w.__msw__!.HttpResponse(null, { status: 401 })),
          );
          resolve();
        }, 5);
      });
    });

    await page.goto('/contribuer');
    await page.waitForSelector('[data-testid="rating-card"]', { state: 'visible' });

    await expect(page.getByRole('note', { name: /Invitation à se connecter/i })).toBeVisible();
    await expect(page.getByTestId('metadata-band')).toHaveCount(0);
  });
});
