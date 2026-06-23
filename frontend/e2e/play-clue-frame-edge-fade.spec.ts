import { expect, test, type Page } from '@playwright/test';

// The /play solo screen auto-frames the focused clue (PanZoom zoom + pan), and
// PanZoom's edge fade dissolves the grid's edge into the surrounding jade FIELD.
// It must therefore only show where there is field beside that edge — never
// where the grid bleeds to a screen edge, behind the header, or down to the
// bottom bar (the grid bleeds behind those; there is no field to dissolve into).
//
// The maintainer's case: tabbing the clue rail to "Unite informatique" frames a
// clue whose grid fills the whole play area — it bleeds to the left/right screen
// edges, behind the header (top) and down to the bottom bar (bottom). So NO edge
// has field beside it and NO fade should be active. A viewport-pinned fade
// instead dims interior cells; a fade keyed off the viewport bottom (not the
// bar) wrongly shows a bottom fade. Both make this fail.

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
  test('framing "Unite informatique" shows no edge fade (grid fills the play area)', async ({ page }) => {
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
      return edges;
    });

    expect(active, `the grid fills the play area here, so no edge fade should be active; got: ${active.join(', ')}`).toEqual([]);
  });
});
