import { useSubscriber } from './useSubscriber';

// Show the subscribe offer to everyone who isn't already a subscriber — guests
// and free players alike. Visibility is intentionally NOT gated on the
// `billing:subscribe` capability: checkout is auth- + capability-gated
// server-side (ADR-0078), and guests are routed through sign-in first. Amends
// ADR-0080's "no incitators for non-subscribers".
export function useCanSubscribe(): boolean {
  return !useSubscriber();
}
