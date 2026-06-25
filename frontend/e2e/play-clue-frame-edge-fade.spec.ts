import { expect, test, type Page } from '@playwright/test';

// PanZoom.scrollLeft must stay 0; a browser-scroll triggered by cell focus must not shift the edge-fade overlay.

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

test.describe('/play clue auto-frame', () => {
  test('framing "Unite informatique" leaves the viewport unscrolled and the edge fade aligned', async ({ page }) => {
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

    const m = await page.evaluate(() => {
      const input = document.querySelector('input[data-cell-kind="letter"]') as HTMLElement;
      const stage = input.closest('div')!.parentElement!.parentElement!; // boardGrid → stage
      const vp = stage.parentElement!; // PanZoom viewport
      const fade = stage.nextElementSibling as HTMLElement | null;
      const vr = vp.getBoundingClientRect();
      const fr = fade!.getBoundingClientRect();
      return {
        scrollLeft: vp.scrollLeft,
        scrollTop: vp.scrollTop,
        fadeOffsetLeft: Number((fr.left - vr.left).toFixed(2)),
        fadeOffsetRight: Number((fr.right - vr.right).toFixed(2)),
      };
    });

    // The transform owns positioning — a non-zero scroll is the bug.
    expect(m.scrollLeft, 'viewport scrolled horizontally (grid is positioned by transform, not scroll)').toBe(0);
    expect(m.scrollTop, 'viewport scrolled vertically').toBe(0);
    // …and with no scroll, the fade overlay sits exactly on the viewport.
    expect(Math.abs(m.fadeOffsetLeft), `edge-fade overlay offset from viewport left by ${m.fadeOffsetLeft}px`).toBeLessThan(1);
    expect(Math.abs(m.fadeOffsetRight), `edge-fade overlay offset from viewport right by ${m.fadeOffsetRight}px`).toBeLessThan(1);
  });
});
