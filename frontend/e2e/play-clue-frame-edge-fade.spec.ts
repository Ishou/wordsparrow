import { expect, test, type Page } from '@playwright/test';

// PanZoom's edge fade softens the LEFT/RIGHT screen-edge cutoff when the
// zoomed-in grid bleeds past those edges. It is NOT applied to the top/bottom
// edges — those are bounded by the header and the bottom keyboard bar (the grid
// bleeds behind them), so a fade there would sit over / above a bar.
//
// The maintainer's case: tabbing the clue rail to "Unite informatique" frames a
// clue zoomed in enough that the grid bleeds past BOTH side screen edges, while
// its bottom edge sits at the bottom bar (not bled past the viewport). So the
// left and right edges must fade, and the top and bottom must not.

async function gotoPlay(page: Page): Promise<void> {
  await page.setViewportSize({ width: 440, height: 850 });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/play');
  await page.waitForSelector('input[data-cell-kind="letter"]', { state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}

function activeClue(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const live = document.querySelector('[aria-live="polite"]')?.textContent ?? '';
    const m = live.match(/«\s*(.+?)\s*»/);
    return m ? m[1] : null;
  });
}

test.describe('/play clue auto-frame edge fade', () => {
  test('framing "Unite informatique" fades only the bled side edges, not top/bottom', async ({ page }) => {
    await gotoPlay(page);

    // Tab the clue rail forward until the active clue is "Unite informatique".
    const next = page.getByRole('button', { name: 'Indice suivant' });
    let reached = false;
    for (let i = 0; i < 60; i++) {
      if ((await activeClue(page)) === 'Unite informatique') { reached = true; break; }
      await next.click();
      await page.waitForTimeout(140); // focus + render + frame tween
    }
    expect(reached, 'never reached the "Unite informatique" clue by tabbing').toBe(true);
    await page.waitForTimeout(350); // let the frame tween fully settle

    // Which edge fades are active on the PanZoom fade overlay.
    const active = await page.evaluate(() => {
      const input = document.querySelector('input[data-cell-kind="letter"]') as HTMLElement;
      const stage = input.closest('div')!.parentElement!.parentElement!; // boardGrid → stage
      const fade = stage.nextElementSibling as HTMLElement | null;
      const css = fade ? `${fade.style.background} ${fade.style.boxShadow}` : '';
      const edges: string[] = [];
      if (css.includes('to right') || css.includes('inset 38px')) edges.push('left');
      if (css.includes('to left') || css.includes('inset -38px')) edges.push('right');
      if (css.includes('to bottom') || /inset 0(px)? 38px/.test(css)) edges.push('top');
      if (css.includes('to top') || /inset 0(px)? -38px/.test(css)) edges.push('bottom');
      return edges.sort();
    });

    expect(active, `expected the two bled side edges to fade and top/bottom not; got: ${active.join(', ') || '(none)'}`).toEqual(['left', 'right']);
  });
});
