import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { BillingError } from '@/application/billing';
import { createHttpBillingClient } from '@/infrastructure';

const BASE_URL = 'https://billing.wordsparrow.example';

const subscription = { tier: 'supporter', status: 'active', periodEnd: '2026-07-29T00:00:00Z' };

const checkout = {
  checkoutUrl: 'https://checkout.provider.example/s/abc',
  successUrl: 'https://wordsparrow.io/merci',
  cancelUrl: 'https://wordsparrow.io/abonnement',
};

const problem = (status: number, type: string) =>
  HttpResponse.json(
    { type: `https://bliss.example/errors/${type}`, title: type, status },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const makeClient = () => createHttpBillingClient({ baseUrl: BASE_URL });

describe('HttpBillingClient.createCheckoutSession', () => {
  it('returns the hosted-checkout URLs on 201', async () => {
    server.use(
      http.post(`${BASE_URL}/v1/checkout-session`, () =>
        HttpResponse.json(checkout, { status: 201 }),
      ),
    );

    const session = await makeClient().createCheckoutSession('supporter');

    expect(session).toEqual(checkout);
  });

  it('maps 409 to a typed already-subscribed BillingError', async () => {
    server.use(http.post(`${BASE_URL}/v1/checkout-session`, () => problem(409, 'already-subscribed')));

    await expect(makeClient().createCheckoutSession('supporter')).rejects.toMatchObject({
      name: 'BillingError',
      kind: 'already-subscribed',
      status: 409,
    });
  });

  it('maps 403 to a typed forbidden BillingError', async () => {
    server.use(http.post(`${BASE_URL}/v1/checkout-session`, () => problem(403, 'forbidden')));

    await expect(makeClient().createCheckoutSession('supporter')).rejects.toMatchObject({
      kind: 'forbidden',
      status: 403,
    });
  });
});

describe('HttpBillingClient.cancelSubscription', () => {
  it('returns the updated subscription on 200', async () => {
    server.use(
      http.post(`${BASE_URL}/v1/subscription/cancel`, () =>
        HttpResponse.json({ ...subscription, status: 'pending_cancellation' }),
      ),
    );

    const view = await makeClient().cancelSubscription();

    expect(view).toEqual({ ...subscription, status: 'pending_cancellation' });
  });

  it('maps 404 to a typed no-active-subscription BillingError', async () => {
    server.use(http.post(`${BASE_URL}/v1/subscription/cancel`, () => problem(404, 'no-active-subscription')));

    await expect(makeClient().cancelSubscription()).rejects.toMatchObject({
      kind: 'no-active-subscription',
      status: 404,
    });
  });
});

describe('HttpBillingClient.getSubscription', () => {
  it('returns the caller subscription on 200', async () => {
    server.use(http.get(`${BASE_URL}/v1/subscription`, () => HttpResponse.json(subscription)));

    const view = await makeClient().getSubscription();

    expect(view).toEqual(subscription);
  });

  it('maps 401 to a typed auth-required BillingError', async () => {
    server.use(http.get(`${BASE_URL}/v1/subscription`, () => problem(401, 'auth-required')));

    const err = await makeClient().getSubscription().catch((cause: unknown) => cause);

    expect(err).toBeInstanceOf(BillingError);
    expect((err as BillingError).kind).toBe('auth-required');
  });
});
