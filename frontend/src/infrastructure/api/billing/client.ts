// HTTP adapter (ADR-0078); contract-typed via openapi-fetch against ./types.ts.
import createClient, { type ClientOptions } from 'openapi-fetch';
import { uuidv7 } from 'uuidv7';

import type {
  BillingClient,
  BillingErrorKind,
  SubscriptionView,
} from '@/application/billing';
import { BillingError } from '@/application/billing';
import type { components, paths } from './types';

const ERROR_KIND_BY_STATUS: Readonly<Record<number, BillingErrorKind>> = {
  400: 'invalid-checkout-request',
  401: 'auth-required',
  403: 'forbidden',
  404: 'no-active-subscription',
  409: 'already-subscribed',
  429: 'rate-limited',
  503: 'provider-unavailable',
};

export interface HttpBillingClientOptions {
  readonly baseUrl: string;
  readonly fetch?: ClientOptions['fetch'];
}

function toSubscriptionView(view: components['schemas']['SubscriptionView']): SubscriptionView {
  return { tier: view.tier, status: view.status, periodEnd: view.periodEnd };
}

function billingError(status: number, detail?: string): BillingError {
  return new BillingError(ERROR_KIND_BY_STATUS[status] ?? 'unknown', status, detail);
}

export function createHttpBillingClient(options: HttpBillingClientOptions): BillingClient {
  const client = createClient<paths>({ baseUrl: options.baseUrl, fetch: options.fetch });
  client.use({
    onRequest({ request }) {
      if (!request.headers.has('X-Request-Id')) {
        request.headers.set('X-Request-Id', uuidv7());
      }
      return request;
    },
  });

  return {
    async createCheckoutSession(tier, cadence) {
      const { data, error, response } = await client.POST('/v1/checkout-session', {
        credentials: 'include',
        body: { tier, cadence },
      });
      if (error || !data) throw billingError(response.status, error?.detail ?? error?.title);
      return {
        checkoutUrl: data.checkoutUrl,
        successUrl: data.successUrl,
        cancelUrl: data.cancelUrl,
      };
    },

    async cancelSubscription() {
      const { data, error, response } = await client.POST('/v1/subscription/cancel', {
        credentials: 'include',
      });
      if (error || !data) throw billingError(response.status, error?.detail ?? error?.title);
      return toSubscriptionView(data);
    },

    async getSubscription() {
      const { data, error, response } = await client.GET('/v1/subscription', {
        credentials: 'include',
      });
      if (error || !data) throw billingError(response.status, error?.detail ?? error?.title);
      return toSubscriptionView(data);
    },
  };
}
