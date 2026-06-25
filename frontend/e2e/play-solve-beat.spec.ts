// Fixture: NUMERO across row 1 (1,0)–(1,5); DOM down col 5 (0,5)–(2,5), crossing at (1,5)=O.
import { expect, test, type Page } from '@playwright/test';

function activeClue(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const m = (document.querySelector('[aria-live="polite"]')?.textContent ?? '').match(/«\s*(.+?)\s*»/);
    return m ? m[1] : null;
  });
}

function direction(page: Page): Promise<string | undefined> {
  return page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .flatMap((e) => [...e.childNodes])
      .find((n) => n.nodeType === 3 && /HORIZONTAL|VERTICAL/.test(n.textContent ?? ''))
      ?.textContent?.trim(),
  );
}

function glow(page: Page, row: number, col: number): Promise<string | null> {
  return page.evaluate(({ row, col }) => {
    const w = document.querySelector(`div[data-row="${row}"][data-col="${col}"]`);
    return w ? getComputedStyle(w).animationName : null;
  }, { row, col });
}

async function gotoPlay(page: Page): Promise<void> {
  await page.setViewportSize({ width: 440, height: 850 });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/play');
  await page.waitForSelector('input[data-cell-kind="letter"]', { state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}

// Focus cell and toggle direction to `want` if the crossing cell defaulted otherwise.
async function focusInDirection(page: Page, row: number, col: number, want: 'HORIZONTAL' | 'VERTICAL'): Promise<void> {
  await page.evaluate(({ row, col }) => {
    document.querySelector<HTMLInputElement>(`input[data-cell-kind="letter"][data-row="${row}"][data-col="${col}"]`)?.focus();
  }, { row, col });
  await page.waitForTimeout(40);
  if ((await direction(page)) !== want) {
    await page.locator(`div[data-row="${row}"][data-col="${col}"]`).click();
    await page.waitForTimeout(40);
  }
  expect(await direction(page)).toBe(want);
}

async function typeLetters(page: Page, letters: readonly string[]): Promise<void> {
  for (const ch of letters) {
    await page.evaluate((c) => {
      const el = document.activeElement as HTMLInputElement | null;
      if (!el || el.getAttribute('data-cell-kind') !== 'letter') return;
      el.value = c;
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: c, bubbles: true }));
    }, ch);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  }
}

test('a correct word holds with a sakura halo on the whole word, then advances', async ({ page }) => {
  await gotoPlay(page);
  await focusInDirection(page, 1, 0, 'HORIZONTAL');
  const solvedClue = await activeClue(page);

  await typeLetters(page, ['N', 'U', 'M', 'E', 'R', 'O']);
  await expect(page.locator('input[data-row="1"][data-col="0"]')).toHaveAttribute('readonly', '');

  // Beat active: halo on all word cells, view still shows the just-solved clue.
  await expect.poll(() => glow(page, 1, 0)).toBe('wsSolveGlow');
  await expect.poll(() => glow(page, 1, 5)).toBe('wsSolveGlow');
  expect(await activeClue(page), 'view must hold on the solved clue during the beat').toBe(solvedClue);

  // After the beat: halo cleared and the clue advanced.
  await page.waitForTimeout(950);
  expect(await glow(page, 1, 2)).toBe('none');
  expect(await activeClue(page), 'view should advance after the beat').not.toBe(solvedClue);
});

test('the halo covers a cell a crossing word already validated', async ({ page }) => {
  await gotoPlay(page);
  // Lock DOM down col 5 first → (1,5) is pre-validated before NUMERO is solved.
  await focusInDirection(page, 0, 5, 'VERTICAL');
  await typeLetters(page, ['D', 'O', 'M']);
  await expect(page.locator('input[data-row="1"][data-col="5"]')).toHaveAttribute('readonly', '');
  await page.waitForTimeout(950); // DOM's own beat settles

  // Complete NUMERO (its last cell already locked) → the whole word celebrates.
  await focusInDirection(page, 1, 0, 'HORIZONTAL');
  await typeLetters(page, ['N', 'U', 'M', 'E', 'R']);
  await expect(page.locator('input[data-row="1"][data-col="0"]')).toHaveAttribute('readonly', '');
  await expect
    .poll(() => glow(page, 1, 5), { message: 'the pre-validated crossing cell must glow with the rest of the word' })
    .toBe('wsSolveGlow');
});

test('a hint that fills a word’s last cell validates the whole word', async ({ page }) => {
  await gotoPlay(page);
  // "Point cardinal" = ENE across (1,7)..(1,9). Type E, N; hint reveals (1,9).
  await focusInDirection(page, 1, 7, 'HORIZONTAL');
  await typeLetters(page, ['E', 'N']);
  await page.getByRole('button', { name: /Indice — \d+ restants/ }).click();
  // The whole word locks — not just the hinted cell.
  await expect(page.locator('input[data-row="1"][data-col="7"]')).toHaveAttribute('readonly', '');
  await expect(page.locator('input[data-row="1"][data-col="8"]')).toHaveAttribute('readonly', '');
  await expect(page.locator('input[data-row="1"][data-col="9"]')).toHaveAttribute('readonly', '');
});

test('solving a clue lights its definition cell (done surface + dark text)', async ({ page }) => {
  await gotoPlay(page);
  // "Point cardinal" = ENE across (1,7)..(1,9); its definition cell holds that text.
  await focusInDirection(page, 1, 7, 'HORIZONTAL');
  await typeLetters(page, ['E', 'N', 'E']);
  await expect(page.locator('input[data-row="1"][data-col="9"]')).toHaveAttribute('readonly', '');

  const defBg = () => page.evaluate(() => {
    const d = [...document.querySelectorAll('[data-defcell]')].find((x) => (x.textContent ?? '').includes('Point cardinal'));
    return d ? getComputedStyle(d).backgroundColor : null;
  });
  await expect.poll(defBg, { message: 'solved clue should take the done surface' }).toBe('rgb(159, 188, 168)'); // ws.clueSurfaceDone
  const text = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[data-defcell]')].find((x) => (x.textContent ?? '').includes('Point cardinal'));
    const span = d?.querySelector('span');
    return span ? getComputedStyle(span).color : null;
  });
  expect(text, 'done clue text flips to dark jade-ink for contrast').toBe('rgb(33, 75, 64)'); // ws.jadeInk
});

test('a wrong completion wobbles the word and leaves it editable', async ({ page }) => {
  await gotoPlay(page);
  await focusInDirection(page, 1, 0, 'HORIZONTAL'); // NUMERO across
  await typeLetters(page, ['N', 'U', 'M', 'E', 'R', 'X']); // wrong on the last letter
  // The word's cells wobble (validation POST is async → poll for the animation).
  await expect.poll(() => glow(page, 1, 2), { message: 'a wrong word must wobble' }).toBe('wsShake');
  // …and stay editable so it can be fixed.
  await expect(page.locator('input[data-row="1"][data-col="0"]')).toBeEditable();
  await expect(page.locator('input[data-row="1"][data-col="5"]')).toBeEditable();
});

test('a wrong completion stays in the word — no celebration, no jump', async ({ page }) => {
  await gotoPlay(page);
  // Lock DOM so NUMERO's last cell (1,5) is validated (the boundary the cursor lands on).
  await focusInDirection(page, 0, 5, 'VERTICAL');
  await typeLetters(page, ['D', 'O', 'M']);
  await expect(page.locator('input[data-row="1"][data-col="5"]')).toHaveAttribute('readonly', '');
  await page.waitForTimeout(950);

  await focusInDirection(page, 1, 0, 'HORIZONTAL');
  const clueBefore = await activeClue(page);
  // NUMEX into cols 0..4 (col 5 = locked O) → NUMEXO, wrong → not validated.
  await typeLetters(page, ['N', 'U', 'M', 'E', 'X']);
  await page.waitForTimeout(200);

  // Wrong word wobbles but never shows the sakura halo and never advances the clue.
  expect(await glow(page, 1, 2), 'a wrong word must not play the celebration halo').not.toBe('wsSolveGlow');
  expect(await activeClue(page), 'a wrong word must not jump to the next clue').toBe(clueBefore);
  // Focus stayed inside NUMERO (did not skip across to another word).
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  expect(focused, 'focus should stay in the wrong word so it can be fixed').toMatch(/Ligne 2, colonne [1-6]/);
});
