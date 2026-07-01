// Regression: the menu-sheet Back-dismiss sentinel must not undo a forward navigation (cold-client bounce-to-home bug).
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Skip the first-run SoloTour so the menu button is reachable.
  await page.addInitScript(() => {
    window.localStorage.setItem('wordsparrow.tour.seen', 'true');
  });
});

test('menu → Réglages lands on /reglages, not back on home', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Réglages' }).click();
  await expect(page).toHaveURL(/\/reglages$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Réglages' })).toBeVisible();
});

test('menu → Mon compte lands on /compte, not back on home', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link').first().click();
  await expect(page).toHaveURL(/\/compte$/);
});

test('browser Back closes the menu without leaving home', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(menu).toBeHidden();
});
