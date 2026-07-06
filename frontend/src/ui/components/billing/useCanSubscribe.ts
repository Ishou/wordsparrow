import { useSubscriber } from './useSubscriber';

// Offer visibility is not gated on billing:subscribe; checkout stays capability-gated server-side (ADR-0078, amends ADR-0080).
export function useCanSubscribe(): boolean {
  return !useSubscriber();
}
