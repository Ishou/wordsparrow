/**
 * Passwordless email-OTP sign-in (ADR-0091), behind VITE_FEATURE_EMAIL_AUTH
 * (on in `.env.preview`). Uses the `__msw__` worker seam (not
 * `page.route`): the preview build's MSW service worker intercepts the
 * cross-origin identity fetches before Playwright's CDP layer sees them —
 * same handshake as `auth-authed.spec.ts`. Covers the email→code→authed
 * happy path plus an axe pass on both steps.
 */
import { expect, test, type Page } from '@playwright/test';
import { runAxe } from './lib/axeRun';

const AUTHED = { userId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b', displayName: 'Mésange 12' };
const ME = { id: AUTHED.userId, displayName: AUTHED.displayName, createdAt: '2026-05-01T10:00:00.000Z', providers: [] };

interface MswHandle {
  worker: { use: (...handlers: unknown[]) => void };
  http: { get: (path: string, resolver: () => unknown) => unknown; post: (path: string, resolver: () => unknown) => unknown };
  HttpResponse: { json: (body: unknown) => unknown; new (body: BodyInit | null, init?: ResponseInit): Response };
}

async function seedOtpFlow(page: Page): Promise<void> {
  await page.addInitScript(({ authed, me }) => {
    const w = window as unknown as { __msw__?: MswHandle; __mswReady__?: Promise<void> };
    let resolveReady: () => void = () => {};
    w.__mswReady__ = new Promise<void>((res) => { resolveReady = res; });
    const unauthorized = (HttpResponse: MswHandle['HttpResponse']) =>
      new HttpResponse(JSON.stringify({ type: 'about:blank', title: 'unauthenticated', status: 401 }), {
        status: 401, headers: { 'content-type': 'application/problem+json' },
      });
    const tick = (): void => {
      if (w.__msw__ != null) {
        const { worker, http, HttpResponse } = w.__msw__;
        // Anon until the code is verified; the verify handler swaps whoami to authed so refresh() flips the session.
        worker.use(
          http.get('*/v1/auth/whoami', () => unauthorized(HttpResponse)),
          http.get('*/v1/users/me', () => unauthorized(HttpResponse)),
          http.post('*/v1/auth/email/start', () => new HttpResponse(null, { status: 202 })),
          http.post('*/v1/auth/email/verify', () => {
            worker.use(
              http.get('*/v1/auth/whoami', () => HttpResponse.json(authed)),
              http.get('*/v1/users/me', () => HttpResponse.json(me)),
            );
            return HttpResponse.json(authed);
          }),
        );
        resolveReady();
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  }, { authed: AUTHED, me: ME });
}

test('email → code → authed happy path, axe-clean on both steps', async ({ page }) => {
  await seedOtpFlow(page);
  await page.goto('/connexion?returnTo=%2Fcompte');

  // Step 1 — email.
  const email = page.getByLabel('Adresse e-mail');
  await expect(email).toBeVisible();
  await runAxe(page, '/connexion step 1 (email)');

  await email.fill('mesange@exemple.fr');
  await page.getByRole('button', { name: /Recevoir le code/i }).click();

  // Step 2 — code.
  const slots = page.locator('input[data-part="input"]');
  await expect(slots).toHaveCount(6);
  await runAxe(page, '/connexion step 2 (code)');

  for (const [index, digit] of [...'482913'].entries()) {
    await slots.nth(index).fill(digit);
  }

  // Verified → refresh flips to authed → navigate to returnTo (/compte).
  await page.waitForURL('**/compte');
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
});
