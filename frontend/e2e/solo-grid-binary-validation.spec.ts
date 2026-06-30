import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

// Solo validation (ADR-0076 §§7–9): no per-word verdict — one whole-grid binary check, only once every cell is filled.

const NOT_SOLVED = "Pas encore — ta grille n'est pas tout à fait juste";
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

function tapKey(page: Page, letter: string): Promise<void> {
  return page.getByRole('button', { name: letter, exact: true }).click();
}

async function typeWord(page: Page, letters: readonly string[]): Promise<void> {
  for (const ch of letters) await tapKey(page, ch);
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

const lockedCount = (page: Page) => page.locator('input[aria-readonly="true"]').count();

test('typing a full word in solo never validates or locks it', async ({ page }) => {
  await gotoPlay(page);
  await clickCell(page, WORD[0].row, WORD[0].col);
  await typeWord(page, WORD.map((c) => c.letter));

  // No per-word verdict: nothing locks, no pulse, no pill, no win.
  await page.waitForTimeout(250);
  expect(await lockedCount(page)).toBe(0);
  await expect(page.locator('[data-validating="true"]')).toHaveCount(0);
  await expect(page.getByText(NOT_SOLVED)).toBeHidden();
  await expect(page.getByRole('heading', { name: WIN_HEADING })).toBeHidden();
});

test('the whole-grid check fires only on completion and a solved verdict wins', async ({ page }) => {
  await gotoPlay(page);
  const rest = ANSWERS.filter((a) => !(a.row === 11 && a.col >= 8));
  await fillCells(page, rest);

  await clickCell(page, WORD[0].row, WORD[0].col);
  // Type all but the last letter: the grid is still one cell short, so no verdict yet.
  await typeWord(page, WORD.slice(0, -1).map((c) => c.letter));
  await page.waitForTimeout(250);
  expect(await lockedCount(page)).toBe(0);
  await expect(page.getByRole('heading', { name: WIN_HEADING })).toBeHidden();

  // The final letter completes the grid → the one binary check runs → solved.
  await tapKey(page, WORD[WORD.length - 1].letter);
  await expect(page.getByRole('heading', { name: WIN_HEADING })).toBeVisible();
  await expect(page.locator(`input[data-row="${WORD[0].row}"][data-col="${WORD[0].col}"]`))
    .toHaveAttribute('aria-readonly', 'true');
});

test('a wrong full grid shows the not-yet pill, marks no cell, and re-checks on edit', async ({ page }) => {
  await gotoPlay(page);
  const rest = ANSWERS.filter((a) => !(a.row === 11 && a.col >= 8));
  await fillCells(page, rest);

  await clickCell(page, WORD[0].row, WORD[0].col);
  const wrong = WORD.map((c) => c.letter);
  wrong[wrong.length - 1] = wrong[wrong.length - 1] === 'X' ? 'W' : 'X';
  await typeWord(page, wrong);

  // Binary negative verdict: a transient status pill, no cell-specific marking.
  await expect(page.getByText(NOT_SOLVED)).toBeVisible();
  expect(await lockedCount(page)).toBe(0);
  await expect(page.getByRole('heading', { name: WIN_HEADING })).toBeHidden();

  // Fixing the wrong cell re-runs the whole-grid check → solved.
  await tapKey(page, WORD[WORD.length - 1].letter);
  await expect(page.getByRole('heading', { name: WIN_HEADING })).toBeVisible();
});
