import { useCapability } from './useCapability';
import { useSubscriber } from './useSubscriber';

// Subscription-promo surfaces gate on the same capability as the offer page, so a free player who 404s on /abonnement sees no locks or incitators (ADR-0080).
export function useCanSubscribe(): boolean {
  const canSubscribe = useCapability('billing:subscribe');
  const subscriber = useSubscriber();
  return canSubscribe && !subscriber;
}
