import { expect, type Page } from '@playwright/test';

export interface StartMultiplayerOptions {
  /** Stop after the salon is hydrated; do not click "Jouer". */
  readonly stopBeforeStart?: boolean;
}

// Drive the grilles → create-lobby → salon → game flow against the MSW WebSocket mock (v2 surface).
export async function startMultiplayerGame(
  page: Page,
  options: StartMultiplayerOptions = {},
): Promise<void> {
  // Pre-seed the tour-seen flag so the solo tour backdrop never blocks pointer events.
  await page.addInitScript(() => {
    window.localStorage.setItem('wordsparrow.tour.seen', 'true');
  });
  await page.goto('/grilles?onglet=plusieurs');
  await page.getByRole('button', { name: /Créer une partie/i }).click();
  await page.waitForURL(/\/lobby\/[^/]+$/);

  const startBtn = page.getByRole('button', { name: 'Jouer' });
  await expect(startBtn).toBeEnabled({ timeout: 10_000 });

  if (options.stopBeforeStart) return;

  await startBtn.click();
  await page.waitForSelector('input[data-cell-kind="letter"]', { state: 'visible', timeout: 10_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}
