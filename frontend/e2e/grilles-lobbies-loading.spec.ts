// Guards the /grilles "À plusieurs" loading state — the tab must not flash the empty state while the lobbies fetch is in flight.
import { expect, test, type Page } from '@playwright/test';

// Hold the lobbies fetch open (never resolves) so the tab stays pending race-free; both the anon session-scoped and authed user-scoped endpoints (ADR-0066) are held. MSW-SW seeding handshake mirrors e2e/my-lobbies.spec.ts.
async function holdLobbiesPending(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type MswHandle = {
      worker: { use: (...handlers: unknown[]) => void };
      http: { get: (path: string, resolver: () => unknown) => unknown };
    };
    const w = window as unknown as {
      __msw__?: MswHandle;
      __mswReady__?: Promise<void>;
    };
    let resolveReady: () => void = () => {};
    w.__mswReady__ = new Promise<void>((res) => {
      resolveReady = res;
    });
    const tick = (): void => {
      if (w.__msw__ != null) {
        const { worker, http } = w.__msw__;
        const pending = () => new Promise(() => {});
        worker.use(
          http.get('*/v1/sessions/:sessionId/lobbies', pending),
          http.get('*/v1/users/me/lobbies', pending),
        );
        resolveReady();
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

test('À plusieurs shows a loading state, not the empty state, while lobbies load', async ({ page }) => {
  await holdLobbiesPending(page);
  await page.goto('/grilles/multijoueur');

  // Skeleton appears after the sub-200ms anti-flash gate; auto-retry waits through it.
  await expect(page.getByLabel('Chargement des parties')).toBeVisible();
  // The empty-state flash is the bug under guard — it must never appear while the fetch is pending.
  await expect(page.getByText('Aucune partie à plusieurs')).toBeHidden();
});
