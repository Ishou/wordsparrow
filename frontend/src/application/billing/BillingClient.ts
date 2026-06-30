// Application-layer port for the billing-api surface (ADR-0078).

// Open strings, not enums: tier/status are config-driven and deferred (ADR-0078).
export type BillingTier = string;
export type SubscriptionStatus = string;

export interface Entitlement {
  readonly tier: BillingTier;
  readonly status: SubscriptionStatus;
  readonly periodEnd: string | null;
  readonly capabilities: readonly string[];
}

export interface CheckoutSession {
  readonly checkoutUrl: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export type BillingErrorKind =
  | 'auth-required'
  | 'forbidden'
  | 'invalid-checkout-request'
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

// ADR-0077: credentials:'include' required; `__Secure-ws_session` is SameSite=Strict.
export interface BillingClient {
  createCheckoutSession(tier: BillingTier): Promise<CheckoutSession>;
  cancelSubscription(): Promise<Entitlement>;
  getEntitlement(): Promise<Entitlement>;
}
