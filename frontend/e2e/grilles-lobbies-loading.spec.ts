/**
 * /grilles "À plusieurs" tab — loading state before the lobbies list
 * resolves.
 *
 * Regression guard: the tab used to render `LobbiesEmptyState`
 * ("Aucune partie à plusieurs") immediately while the lobbies fetch was
 * still in flight, so a user with existing parties saw the empty state
 * flash and then get replaced by the list — a jarring "nothing here →
 * actually here it is". The two sibling tabs (Quotidiennes, À finir)
 * already gate their body behind a loading skeleton; this pins the same
 * contract for À plusieurs.
 *
 * The MSW-service-worker seeding handshake mirrors `e2e/my-lobbies.spec.ts`
 * (see that file's header for why `worker.use(...)` and not `page.route`).
 */
import { expect, test, type Page } from '@playwright/test';

/**
 * Install a lobbies handler that never resolves, so the "À plusieurs"
 * tab stays in its loading state for the whole assertion window without
 * any timing race. Mirrors `my-lobbies.spec.ts`'s two-step `__mswReady__`
 * handshake with `main.tsx`'s `enableMocks()`.
 */
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
        // A promise that never settles: the loader hangs, so the tab
        // stays in its loading state and never falls through to the list
        // or the empty state. Both the anon session-scoped (ADR-0066) and
        // the authed user-scoped endpoints are held so the guard holds
        // regardless of which one the tab picks.
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
  await page.goto('/grilles?onglet=plusieurs');

  // The loading skeleton is announced as busy (ADR-0050); it appears
  // after the sub-200ms anti-flash gate, which Playwright's auto-retry
  // waits through.
  await expect(page.getByLabel('Chargement des parties')).toBeVisible();

  // The empty state must never appear while the fetch is pending — that
  // flash is the bug under guard.
  await expect(page.getByText('Aucune partie à plusieurs')).toBeHidden();
});
