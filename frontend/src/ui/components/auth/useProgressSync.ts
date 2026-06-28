import { useEffect, useRef } from 'react';
import type { ProgressSyncService } from '@/application/progress';
import { useOptionalAuth } from './AuthProvider';

// Drives the cross-device merge (ADR-0075 Wave 3): on the first authed state it
// pulls + merges the account's progress into local. Anon/offline is a no-op —
// the effect only fires while authed, and a failed pull is swallowed so the
// local render path is never blocked. `service` is undefined in bundles/tests
// without the sync layer wired, which short-circuits to the unchanged anon UX.
export function useProgressSync(service: ProgressSyncService | undefined): void {
  const auth = useOptionalAuth();
  const status = auth?.state.status;
  const pulled = useRef(false);

  useEffect(() => {
    service?.setEnabled(status === 'authed');
    if (status === 'anon') {
      pulled.current = false;
    }
  }, [service, status]);

  useEffect(() => {
    if (!service || status !== 'authed' || pulled.current) return;
    pulled.current = true;
    void service.pullAndMergeAll().catch(() => {
      // Offline / transient: local stays the source of truth; retry on next authed mount.
      pulled.current = false;
    });
  }, [service, status]);

  useEffect(() => () => service?.dispose(), [service]);
}
