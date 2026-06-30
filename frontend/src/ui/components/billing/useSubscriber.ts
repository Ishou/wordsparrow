import { useCapability } from './useCapability';

// Subscriber = holder of the paid tier-derived capability (ADR-0080); never reads a tier field.
export function useSubscriber(): boolean {
  return useCapability('grilles:all');
}
