import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { BillingError } from '@/application/billing';
import { createHttpBillingClient } from '@/infrastructure';

const BASE = 'https://billing.test';

const ENTITLEMENT = {
  tier: 'supporter',
  status: 'active',
  periodEnd: '2026-07-29T00:00:00Z',
  capabilities: ['daily-archive', 'no-ads'],
};

const CHECKOUT = {
  checkoutUrl: 'https://checkout.test/s/abc',
  successUrl: 'https://ws.test/abonnement/merci',
  cancelUrl: 'https://ws.test/abonnement',
};

function problem(status: number, type: string) {
  return HttpResponse.json(
    { type: `https://bliss.example/errors/${type}`, title: type, status },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

const server = setupServer(
  http.post(`${BASE}/v1/checkout-session`, () => HttpResponse.json(CHECKOUT, { status: 201 })),
  http.post(`${BASE}/v1/subscription/cancel`, () =>
    HttpResponse.json({ ...ENTITLEMENT, status: 'pending_cancellation' }),
  ),
  http.get(`${BASE}/v1/entitlement`, () => HttpResponse.json(ENTITLEMENT)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const makeClient = () => createHttpBillingClient({ baseUrl: BASE });

describe('createHttpBillingClient', () => {
  it('maps the checkout-session response', async () => {
    expect(await makeClient().createCheckoutSession('supporter')).toEqual(CHECKOUT);
  });

  it('maps the entitlement projection', async () => {
    expect(await makeClient().getEntitlement()).toEqual(ENTITLEMENT);
  });

  it('maps the cancel response to the updated entitlement', async () => {
    expect((await makeClient().cancelSubscription()).status).toBe('pending_cancellation');
  });

  const checkout = () => makeClient().createCheckoutSession('supporter');
  const errorCases = [
    ['auth-required', 401, http.get(`${BASE}/v1/entitlement`, () => problem(401, 'auth-required')), () => makeClient().getEntitlement()],
    ['forbidden', 403, http.post(`${BASE}/v1/checkout-session`, () => problem(403, 'forbidden')), checkout],
    ['invalid-checkout-request', 400, http.post(`${BASE}/v1/checkout-session`, () => problem(400, 'invalid-checkout-request')), checkout],
    ['already-subscribed', 409, http.post(`${BASE}/v1/checkout-session`, () => problem(409, 'already-subscribed')), checkout],
    ['rate-limited', 429, http.post(`${BASE}/v1/checkout-session`, () => problem(429, 'rate-limited')), checkout],
    ['no-active-subscription', 404, http.post(`${BASE}/v1/subscription/cancel`, () => problem(404, 'no-active-subscription')), () => makeClient().cancelSubscription()],
    ['provider-unavailable', 503, http.get(`${BASE}/v1/entitlement`, () => problem(503, 'provider-unavailable')), () => makeClient().getEntitlement()],
  ] as const;

  it.each(errorCases)('throws BillingError(%s) on %i', async (kind, status, handler, call) => {
    server.use(handler);
    await expect(call()).rejects.toMatchObject({ kind, status });
  });

  it('error rejections are BillingError instances', async () => {
    server.use(http.get(`${BASE}/v1/entitlement`, () => problem(503, 'provider-unavailable')));
    await expect(makeClient().getEntitlement()).rejects.toBeInstanceOf(BillingError);
  });
});
