import { useCallback, useEffect, useState } from 'react';

import type { BillingClient, SubscriptionView } from '@/application/billing';

export interface SubscriptionState {
  readonly subscription: SubscriptionView | null;
  readonly loading: boolean;
  readonly error: Error | null;
  readonly refetch: () => void;
}

// Subscription STATUS for the manage UI only; capabilities come from identity (ADR-0078).
export function useSubscription(client: BillingClient): SubscriptionState {
  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSubscription = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSubscription(await client.getSubscription());
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('subscription fetch failed'));
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void fetchSubscription();
  }, [fetchSubscription]);

  const refetch = useCallback(() => {
    void fetchSubscription();
  }, [fetchSubscription]);

  return { subscription, loading, error, refetch };
}
