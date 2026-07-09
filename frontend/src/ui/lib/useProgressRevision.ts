import { useCallback, useSyncExternalStore } from 'react';
import type { ProgressSyncService } from '@/application/progress';

// Re-renders on every progress merge (ADR-0075) so mount-gated derived views re-read local storage; 0 when unwired or prerendering.
export function useProgressRevision(service: ProgressSyncService | undefined): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => service?.subscribe(onStoreChange) ?? (() => {}),
    [service],
  );
  return useSyncExternalStore(
    subscribe,
    () => service?.getRevision() ?? 0,
    () => 0,
  );
}
