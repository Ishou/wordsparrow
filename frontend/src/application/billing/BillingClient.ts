// Application-layer port for the billing-api surface (ADR-0078). Billing owns
// subscription STATUS only; capabilities live on identity (ADR-0060/0078).

// Open strings, not enums: the tier/status sets are config-driven and
// deliberately deferred (ADR-0078).
export type BillingTier = string;
export type SubscriptionStatus = string;

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

// Cookie-bearing calls require `__Secure-ws_session`; the adapter sets
// `credentials: 'include'` per call (ADR-0077).
export interface BillingClient {
  createCheckoutSession(tier: BillingTier): Promise<CheckoutSession>;
  cancelSubscription(): Promise<SubscriptionView>;
  getSubscription(): Promise<SubscriptionView>;
}
