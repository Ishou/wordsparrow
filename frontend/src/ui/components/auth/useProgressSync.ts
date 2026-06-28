import { useEffect, useRef } from 'react';
import type { ProgressSyncService } from '@/application/progress';
import { useOptionalAuth } from './AuthProvider';

// Drives the cross-device merge on the authed transition (ADR-0075).
export function useProgressSync(service: ProgressSyncService | undefined): void {
  const auth = useOptionalAuth();
  const status = auth?.state.status;
  const pulled = useRef(false);

  useEffect(() => {
    service?.setEnabled(status === 'authed');
    if (status === 'anon') {
      pulled.current = false;
      service?.dispose(); // cancel in-flight debounce timers on sign-out
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
