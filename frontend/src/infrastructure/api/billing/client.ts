// HTTP adapter for billing-api (ADR-0078); openapi-fetch over ./types.ts (ADR-0003 §3).
import createClient, { type ClientOptions } from 'openapi-fetch';
import { uuidv7 } from 'uuidv7';

import type { BillingClient, BillingErrorKind, Entitlement } from '@/application/billing';
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

function toEntitlement(view: components['schemas']['EntitlementView']): Entitlement {
  return {
    tier: view.tier,
    status: view.status,
    periodEnd: view.periodEnd,
    capabilities: view.capabilities,
  };
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
    async createCheckoutSession(tier) {
      const { data, error, response } = await client.POST('/v1/checkout-session', {
        credentials: 'include',
        body: { tier },
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
      return toEntitlement(data);
    },

    async getEntitlement() {
      const { data, error, response } = await client.GET('/v1/entitlement', {
        credentials: 'include',
      });
      if (error || !data) throw billingError(response.status, error?.detail ?? error?.title);
      return toEntitlement(data);
    },
  };
}

export type { paths };
