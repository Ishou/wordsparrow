// Application-layer port (ADR-0078); subscription status only, capabilities on identity.

// Open strings, not enums: tier/status are config-driven and deliberately deferred (ADR-0078).
export type BillingTier = string;
export type SubscriptionStatus = string;

// Closed set: the checkout price is selected server-side from the cadence (ADR-0080, 2 €/mois · 20 €/an).
export type BillingCadence = 'monthly' | 'yearly';

export interface SubscriptionView {
  readonly tier: BillingTier;
  readonly status: SubscriptionStatus;
  readonly periodEnd: string | null;
}

export interface CheckoutSession {
  readonly checkoutUrl: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export type BillingErrorKind =
  | 'auth-required'
  | 'invalid-checkout-request'
  | 'forbidden'
  | 'already-subscribed'
  | 'no-active-subscription'
  | 'rate-limited'
  | 'provider-unavailable'
  | 'unknown';

export class BillingError extends Error {
  readonly kind: BillingErrorKind;
  readonly status: number;
  constructor(kind: BillingErrorKind, status: number, detail?: string) {
    super(detail ?? kind);
    this.name = 'BillingError';
    this.kind = kind;
    this.status = status;
  }
}

// Cookie-bearing; adapter sets credentials:'include' per ADR-0077.
export interface BillingClient {
  createCheckoutSession(tier: BillingTier, cadence: BillingCadence): Promise<CheckoutSession>;
  cancelSubscription(): Promise<SubscriptionView>;
  getSubscription(): Promise<SubscriptionView>;
}
