import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// Solo whole-word hint (ADR-0076 §§7–9): a hint reveals + locks the entire focused word, spending one budget unit.

const WIN_HEADING = 'Grille terminée !';

interface FixtureCell {
  readonly kind: string;
  readonly position: { readonly row: number; readonly column: number };
  readonly letter?: string;
}
interface Answer {
  readonly row: number;
  readonly col: number;
  readonly letter: string;
}

const FIXTURE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'src', 'infrastructure', 'mocks', 'fixtures', 'puzzle.json',
);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as { cells: FixtureCell[] };

const normalize = (raw: string): string =>
  raw.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ANSWERS: readonly Answer[] = FIXTURE.cells
  .filter((c) => c.kind === 'letter' && c.letter)
  .map((c) => ({ row: c.position.row, col: c.position.column, letter: normalize(c.letter!) }));

// Vertically-isolated across word (row 11, cols 8–14): its start cell has no down clue, so one click selects 'across'.
const WORD: readonly Answer[] = ANSWERS.filter((a) => a.row === 11 && a.col >= 8).slice().sort((x, y) => x.col - y.col);

async function gotoPlay(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear());
  await page.setViewportSize({ width: 420, height: 880 });
  await page.goto('/play');
  await page.waitForSelector('input[data-cell-kind="letter"]', { state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
}

function clickCell(page: Page, row: number, col: number): Promise<void> {
  return page.locator(`div[data-row="${row}"][data-col="${col}"]`).click();
}

function hintButton(page: Page, remaining: number) {
  return page.getByRole('button', { name: new RegExp(`Indice — ${remaining} restants`) });
}

async function lockedCells(page: Page): Promise<Array<{ row: number; col: number; value: string }>> {
  return page.locator('input[aria-readonly="true"]').evaluateAll((els) =>
    els
      .map((e) => ({
        row: Number((e as HTMLElement).dataset.row),
        col: Number((e as HTMLElement).dataset.col),
        value: (e as HTMLInputElement).value,
      }))
      .sort((a, b) => a.row - b.row || a.col - b.col),
  );
}

async function fillCells(page: Page, cells: readonly Answer[]): Promise<void> {
  await page.evaluate((cs) => {
    for (const { row, col, letter } of cs) {
      const el = document.querySelector<HTMLInputElement>(
        `input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`,
      );
      if (el) el.value = letter;
    }
  }, cells as Answer[]);
}

test('a hint reveals the whole focused word, locks it, and spends one budget unit', async ({ page }) => {
  await gotoPlay(page);
  await clickCell(page, WORD[0].row, WORD[0].col);

  await expect(hintButton(page, 3)).toBeVisible();
  await hintButton(page, 3).click();

  // The whole word — not a single cell — is revealed and locked.
  await expect(hintButton(page, 2)).toBeVisible();
  const locked = await lockedCells(page);
  expect(locked).toEqual(WORD.map((c) => ({ row: c.row, col: c.col, value: c.letter })));

  // A cell outside the word stays editable (no whole-grid lock).
  await expect(page.locator('input[data-row="0"][data-col="1"]')).not.toHaveAttribute('aria-readonly', 'true');
});

test('a hint that fills the final cells triggers the whole-grid binary check', async ({ page }) => {
  await gotoPlay(page);
  // Fill everything except the focused word; the hint supplies the last cells.
  const rest = ANSWERS.filter((a) => !(a.row === 11 && a.col >= 8));
  await fillCells(page, rest);

  await clickCell(page, WORD[0].row, WORD[0].col);
  await hintButton(page, 3).click();

  await expect(page.getByRole('heading', { name: WIN_HEADING })).toBeVisible();
});
