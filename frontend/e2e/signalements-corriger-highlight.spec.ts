// Needs a real engine to see the cross-fade lag; jsdom can't render transitions.
import { expect, test, type Page } from '@playwright/test';

const USER = { userId: 'u-1', displayName: 'Maintainer 1', role: 'maintainer', capabilities: ['admin:signalements', 'contribuer'] };
const ME = { id: 'u-1', displayName: 'Maintainer 1', createdAt: '2026-05-01T10:00:00.000Z', providers: [{ provider: 'google', linkedAt: '2026-05-01T10:00:00.000Z' }] };
const REPORT = {
  reportId: '0190e3a4-7a2c-7c9e-8f1a-000000000001',
  wordText: 'CHAT',
  clueText: 'Animal qui miaule',
  reason: 'erreur_sens',
  surface: 'daily',
  puzzleId: '0190e3a4-7a2c-7c9e-8f1a-0000000000ab',
  count: 2,
  latestNote: 'contre-sens',
  latestAt: '2026-07-11T10:00:00.000Z',
  mine: false,
};

const SAKURA_BLUSH = 'rgb(247, 222, 231)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

async function seed(page: Page): Promise<void> {
  await page.addInitScript(
    ({ user, me, report }) => {
      const w = window as unknown as { __msw__?: { worker: { use: (...h: unknown[]) => void }; http: Record<string, (p: string, r: () => unknown) => unknown>; HttpResponse: { json: (b: unknown) => unknown } }; __mswReady__?: Promise<void> };
      let resolveReady: () => void = () => {};
      w.__mswReady__ = new Promise<void>((res) => { resolveReady = res; });
      const tick = (): void => {
        if (w.__msw__ != null) {
          const { worker, http, HttpResponse } = w.__msw__;
          worker.use(
            http.get('*/v1/auth/whoami', () => HttpResponse.json(user)),
            http.get('*/v1/users/me', () => HttpResponse.json(me)),
            http.get('*/v1/signalements', () => HttpResponse.json({ items: [report] })),
            http.get('*/v1/signalements/historique', () => HttpResponse.json({ items: [] })),
            http.get('*/v1/corrections/preview', () => HttpResponse.json({ affectedDailies: 2, affectedSolo: 1 })),
            http.get('*/v1/words/:word/clues', () => HttpResponse.json({ clues: [{ text: 'Matou' }, { text: 'Félin domestique' }] })),
          );
          resolveReady();
        } else {
          setTimeout(tick, 10);
        }
      };
      tick();
    },
    { user: USER, me: ME, report: REPORT },
  );
}

// Computed background of the <label> wrapping the radio with the given accessible name.
async function rowBg(page: Page, name: RegExp): Promise<string> {
  return page.getByRole('radio', { name }).evaluate((input) => getComputedStyle(input.closest('label') as HTMLElement).backgroundColor);
}

test('Corriger selection highlight snaps to the selected row with no cross-fade', async ({ page }) => {
  await seed(page);
  await page.goto('/signalements');

  await page.getByTestId('correction-trigger').click();
  await expect(page.getByTestId('correction-sheet')).toBeVisible();

  const remplacer = page.getByRole('radio', { name: /Remplacer/ });
  const interdire = page.getByRole('radio', { name: /Interdire/ });

  // Default: Remplacer selected + highlighted.
  await expect(remplacer).toBeChecked();
  expect(await rowBg(page, /Remplacer/)).toBe(SAKURA_BLUSH);
  expect(await rowBg(page, /Interdire/)).toBe(TRANSPARENT);

  // Switch to Interdire — the highlight must move immediately (no 120ms lag),
  // so the read right after the click already shows the final colors.
  await interdire.click();
  await expect(interdire).toBeChecked();
  expect(await rowBg(page, /Interdire/)).toBe(SAKURA_BLUSH);
  expect(await rowBg(page, /Remplacer/)).toBe(TRANSPARENT);
});
