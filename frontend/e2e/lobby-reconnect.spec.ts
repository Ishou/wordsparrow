/**
 * Multiplayer resilience (transient outages must never masquerade as
 * permanent failures):
 *
 *  1. A ONE-SHOT getLobby network failure recovers via the silent
 *     instant loader retry — zero visible change, never « introuvable ».
 *  2. A WS outage longer than the old 32-s budget keeps the player in
 *     the game behind one sticky toast, then resyncs and clears it.
 *  3. Cells typed while offline are queued and flushed to the server
 *     after the rejoin replay — nothing is silently dropped.
 *  4. Only a server-confirmed lobby-unknown (404 frame on rejoin) may
 *     claim the game is gone.
 *
 * Drives the MSW mock's e2e seams exposed on `window.__gameWsTest__`
 * (preview-only bundle): setOutage / dropAll / failNextLobbyFetches /
 * injectEntry / deleteLobby / getLobby.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { startMultiplayerGame } from './lib/multiHelpers';

interface GameWsTestApi {
  setOutage(value: boolean): void;
  dropAll(): void;
  failNextLobbyFetches(count: number): void;
  injectEntry(lobbyId: string, row: number, column: number, letter: string): void;
  deleteLobby(lobbyId: string): void;
  getLobby(lobbyId: string):
    | { game: { entries: ReadonlyArray<{ row: number; column: number; letter: string }> } | null }
    | undefined;
}

declare global {
  interface Window {
    __gameWsTest__: GameWsTestApi;
    __forbiddenTextsSeen: string[];
  }
}

function letterInput(page: Page, row: number, col: number): Locator {
  return page.locator(
    `input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`,
  );
}

async function typeAcross(
  page: Page,
  row: number,
  startCol: number,
  letters: readonly string[],
): Promise<void> {
  // Same trusted-focus pattern as word-auto-validate-multiplayer.spec.ts:
  // focus once, then let auto-advance carry focus so cellUpdate frames
  // target the cell actually being typed into.
  await page.evaluate(({ row, col }) => {
    const sel = `input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`;
    document.querySelector<HTMLInputElement>(sel)?.focus();
  }, { row, col: startCol });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  for (const letter of letters) {
    await page.evaluate((l) => {
      const el = document.activeElement as HTMLInputElement | null;
      if (!el || el.getAttribute('data-cell-kind') !== 'letter') return;
      el.value = l;
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: l, bubbles: true }));
    }, letter);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  }
}

function lobbyIdFromUrl(page: Page): string {
  const match = /\/lobby\/([^/?#]+)/.exec(page.url());
  if (!match) throw new Error(`not on a lobby URL: ${page.url()}`);
  return match[1]!;
}

const lostToast = (page: Page) =>
  page.getByTestId('toast').filter({ hasText: 'Connexion perdue' });
const restoredToast = (page: Page) =>
  page.getByTestId('toast').filter({ hasText: 'Connexion rétablie' });

test('a one-shot getLobby network failure recovers silently — zero visible change', async ({ page }) => {
  // Record any forbidden copy that ever hits the DOM, even transiently.
  await page.addInitScript(() => {
    window.localStorage.setItem('wordsparrow.tour.seen', 'true');
    window.__forbiddenTextsSeen = [];
    const forbidden = ['Partie introuvable', 'Réessayer', 'Reconnexion…'];
    const check = () => {
      const text = document.body?.textContent ?? '';
      for (const s of forbidden) {
        if (text.includes(s) && !window.__forbiddenTextsSeen.includes(s)) {
          window.__forbiddenTextsSeen.push(s);
        }
      }
    };
    new MutationObserver(check).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await page.goto('/grilles?onglet=plusieurs');

  // Arm the seam BEFORE the create-flow navigation runs the loader. The
  // seam global appears once the MSW module graph finishes loading.
  await page.waitForFunction(() => window.__gameWsTest__ !== undefined);
  await page.evaluate(() => window.__gameWsTest__.failNextLobbyFetches(1));
  await page.getByRole('button', { name: /Créer une partie/i }).click();
  await page.waitForURL(/\/lobby\/[^/]+$/);

  // The salon renders with no manual action despite the dropped request.
  await expect(page.getByRole('button', { name: 'Jouer' }))
    .toBeEnabled({ timeout: 10_000 });

  const seen = await page.evaluate(() => window.__forbiddenTextsSeen);
  expect(seen).toEqual([]);
});

test('an outage past the old 32s budget: one sticky toast, no navigation, resync, toast cleared', async ({ page }) => {
  test.setTimeout(150_000);
  await startMultiplayerGame(page);
  const lobbyUrl = page.url();
  const lobbyId = lobbyIdFromUrl(page);

  await typeAcross(page, 0, 1, ['D']);
  await expect(letterInput(page, 0, 1)).toHaveValue('D');

  await page.evaluate(() => {
    window.__gameWsTest__.setOutage(true);
    window.__gameWsTest__.dropAll();
  });

  // The sticky lost-toast appears once the silent instant retry has failed.
  await expect(lostToast(page)).toBeVisible({ timeout: 10_000 });

  // A "remote participant" fills a cell while we are offline — only the
  // rejoin replay snapshot can bring it to this client.
  await page.evaluate((id) => window.__gameWsTest__.injectEntry(id, 0, 2, 'E'), lobbyId);

  // Outlast the retired 6-attempt/~32s budget: still in the game, still
  // ONE toast, never « introuvable », no navigation.
  await page.waitForTimeout(33_000);
  await expect(lostToast(page)).toHaveCount(1);
  expect(page.url()).toBe(lobbyUrl);
  await expect(letterInput(page, 0, 1)).toBeVisible();
  await expect(page.getByText('Partie introuvable')).toHaveCount(0);

  await page.evaluate(() => window.__gameWsTest__.setOutage(false));

  // Recovery: brief « rétablie » toast replaces the sticky one; the board
  // resyncs the remote write; local state survived. Delay cap is 10s ±15%.
  await expect(restoredToast(page)).toBeVisible({ timeout: 20_000 });
  await expect(lostToast(page)).toHaveCount(0);
  await expect(letterInput(page, 0, 2)).toHaveValue('E');
  await expect(letterInput(page, 0, 1)).toHaveValue('D');
});

test('two cells typed during an outage reach the server after reconnect and stay on the board', async ({ page }) => {
  test.setTimeout(90_000);
  await startMultiplayerGame(page);
  const lobbyId = lobbyIdFromUrl(page);

  await page.evaluate(() => {
    window.__gameWsTest__.setOutage(true);
    window.__gameWsTest__.dropAll();
  });
  await expect(lostToast(page)).toBeVisible({ timeout: 10_000 });

  // The grid stays interactive while offline.
  await typeAcross(page, 0, 1, ['D', 'E']);
  await expect(letterInput(page, 0, 1)).toHaveValue('D');
  await expect(letterInput(page, 0, 2)).toHaveValue('E');

  await page.evaluate(() => window.__gameWsTest__.setOutage(false));
  await expect(restoredToast(page)).toBeVisible({ timeout: 20_000 });

  // The queued writes were flushed after the replay snapshot: the mock
  // server's persisted session now carries both letters.
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const entries = window.__gameWsTest__.getLobby(id)?.game?.entries ?? [];
          return entries.filter(
            (e) =>
              (e.row === 0 && e.column === 1 && e.letter === 'D') ||
              (e.row === 0 && e.column === 2 && e.letter === 'E'),
          ).length;
        }, lobbyId),
      { timeout: 10_000 },
    )
    .toBe(2);

  // And nothing was lost locally.
  await expect(letterInput(page, 0, 1)).toHaveValue('D');
  await expect(letterInput(page, 0, 2)).toHaveValue('E');
});

test('a lobby deleted mid-game surfaces the honest « Partie introuvable » screen', async ({ page }) => {
  await startMultiplayerGame(page);
  const lobbyUrl = page.url();
  const lobbyId = lobbyIdFromUrl(page);

  // Server restart wiped the lobby; the live socket drops. The rejoin
  // meets the server's 404 protocol frame — the only path allowed to
  // claim the game no longer exists.
  await page.evaluate((id) => {
    window.__gameWsTest__.deleteLobby(id);
    window.__gameWsTest__.dropAll();
  }, lobbyId);

  await expect(page.getByText('Partie introuvable')).toBeVisible({ timeout: 10_000 });
  // Honest 404 replaces the surface in place — no bounce to Accueil.
  expect(page.url()).toBe(lobbyUrl);
});
