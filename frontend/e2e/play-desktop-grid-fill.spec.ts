// The desktop /play grid must tuck right under the app bar (no empty band) and keep the clue rail fully in view.
import { expect, test, devices } from '@playwright/test';

test.use({ ...devices['Desktop Chrome'] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('wordsparrow.tour.seen', 'true');
  });
});

test('desktop grid tucks under the app bar and keeps the clue rail in view', async ({ page }) => {
  await page.goto('/play');
  await page.waitForSelector('[data-cell-kind="letter"]', { state: 'visible' });
  await expect(page.getByRole('group', { name: 'Indice actif' })).toBeVisible();

  const m = await page.evaluate(() => {
    // The board container is the direct child of #main-content that wraps the cells.
    let board = document.querySelector('[data-cell-kind="letter"]');
    while (board && board.parentElement && board.parentElement.id !== 'main-content') board = board.parentElement;
    const nav = document.querySelector('nav[aria-label="Navigation principale"]');
    const appbar = nav?.closest('header');
    const rail = document.querySelector('[role="group"][aria-label="Indice actif"]');
    if (!board || board.parentElement?.id !== 'main-content' || !appbar || !rail) {
      throw new Error('board container, app bar, or clue rail not found');
    }
    return {
      appbarBottom: appbar.getBoundingClientRect().bottom,
      boardTop: board.getBoundingClientRect().top,
      railBottom: rail.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
      docScrollHeight: document.documentElement.scrollHeight,
    };
  });

  // Board starts flush under the app bar — no doubled 72px offset band (regression: boardTop was ~144, appbarBottom ~72).
  expect(m.boardTop - m.appbarBottom).toBeGreaterThanOrEqual(0);
  expect(m.boardTop - m.appbarBottom).toBeLessThanOrEqual(8);
  // Clue rail sits fully within the viewport, not pushed off the bottom edge.
  expect(m.railBottom).toBeLessThanOrEqual(m.viewportHeight + 1);
  // No vertical page overflow — page is exactly the viewport.
  expect(m.docScrollHeight).toBeLessThanOrEqual(m.viewportHeight + 1);
});
