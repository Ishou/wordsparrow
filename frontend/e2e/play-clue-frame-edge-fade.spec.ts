import { expect, test, type Page } from '@playwright/test';

// The /play solo screen auto-frames the focused clue (PanZoom zoom + pan), and
// PanZoom's edge fade dissolves cells at the VIEWPORT edges where the board
// bleeds. This pins the maintainer's reported case: tabbing the clue rail to
// "Unite informatique" frames a clue whose board bleeds deeply, so the fade
// fires on an edge while the board's REAL edge is far off-screen — i.e. it
// dims cells deep inside the grid instead of the board's edge. That is the
// "edge fade misalignment": the fade (fixed to the viewport) and the grid
// (panned out from under it) no longer line up.
//
// A fade edge is only legitimate when the board's edge for that side is on the
// screen (within the viewport): then it dissolves the grid's real edge into the
// surrounding field. If the grid has bled PAST that viewport edge, the fade —
// pinned to the viewport — sits over interior cells while the grid's actual
// edge is off-screen. That's the misalignment. Allow 1px of sub-pixel slack.
const BLEED_TOLERANCE = 1;

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
  test('framing "Unite informatique" keeps the edge fade aligned to the board edges', async ({ page }) => {
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

    // Read the board transform, the viewport, and which fade edges are active.
    const state = await page.evaluate(() => {
      const input = document.querySelector('input[data-cell-kind="letter"]') as HTMLElement;
      const boardGrid = input.closest('div')!.parentElement!;
      const stage = boardGrid.parentElement!; // transformed stage
      const vp = stage.parentElement!; // PanZoom viewport
      const fade = stage.nextElementSibling as HTMLElement | null;
      const m = (stage.style.transform || '').match(/translate\(([-0-9.]+)px,\s*([-0-9.]+)px\)\s*scale\(([0-9.]+)\)/);
      const tx = Number(m?.[1]);
      const ty = Number(m?.[2]);
      const s = Number(m?.[3]);
      const cw = parseFloat(stage.style.width) * s;
      const ch = parseFloat(stage.style.height) * s;
      const fadeCss = fade ? `${fade.style.background} ${fade.style.boxShadow}` : '';
      return {
        tx, ty, cw, ch, vw: vp.clientWidth, vh: vp.clientHeight,
        fade: {
          left: fadeCss.includes('to right') || fadeCss.includes('inset 38px'),
          right: fadeCss.includes('to left') || fadeCss.includes('inset -38px'),
          top: fadeCss.includes('to bottom') || /inset 0(px)? 38px/.test(fadeCss),
          bottom: fadeCss.includes('to top') || /inset 0(px)? -38px/.test(fadeCss),
        },
      };
    });

    // Off-screen distance of each board edge from the matching viewport edge.
    const offLeft = -state.tx;
    const offRight = state.tx + state.cw - state.vw;
    const offTop = -state.ty;
    const offBottom = state.ty + state.ch - state.vh;

    const misaligned: string[] = [];
    if (state.fade.left && offLeft > BLEED_TOLERANCE) misaligned.push(`left: grid edge ${offLeft.toFixed(0)}px past the viewport edge`);
    if (state.fade.right && offRight > BLEED_TOLERANCE) misaligned.push(`right: grid edge ${offRight.toFixed(0)}px past the viewport edge`);
    if (state.fade.top && offTop > BLEED_TOLERANCE) misaligned.push(`top: grid edge ${offTop.toFixed(0)}px past the viewport edge`);
    if (state.fade.bottom && offBottom > BLEED_TOLERANCE) misaligned.push(`bottom: grid edge ${offBottom.toFixed(0)}px past the viewport edge`);

    expect(misaligned, `edge fade fires where the grid has bled past the viewport (fade pinned to viewport, grid edge off-screen → dims interior cells): ${misaligned.join('; ')}`).toEqual([]);
  });
});
