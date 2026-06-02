// /contribuer smoke test — MSW service worker controls the page; page.route cannot intercept it.

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
    // The session counters surface after the first rating.
    await expect(page.getByTestId('stat-rated')).toHaveText('1');
    await expect(page.getByTestId('stat-streak')).toHaveText('1');
  });

  test('renders the sign-in banner for anon visitors and hides the meta band', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('wordsparrow.tour.seen', 'true');
      // Seed the __mswReady__ gate main.tsx awaits; resolves once MSW is live and whoami returns 401.
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
