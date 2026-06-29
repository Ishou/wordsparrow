import { useEffect } from 'react';
import type { ProgressSyncService } from '@/application/progress';
import { useOptionalAuth } from './AuthProvider';

// Drives the cross-device merge once per sign-in, keyed by account (ADR-0075).
export function useProgressSync(service: ProgressSyncService | undefined): void {
  const auth = useOptionalAuth();
  const state = auth?.state;
  const status = state?.status;
  const userId = state?.status === 'authed' ? state.whoami.userId : undefined;

  useEffect(() => {
    service?.setEnabled(status === 'authed');
    if (status === 'anon') {
      service?.resetReconciled(); // re-sign-in should re-sync
      service?.dispose(); // cancel in-flight debounce timers on sign-out
    }
  }, [service, status]);

  useEffect(() => {
    if (!service || !userId) return;
    void service.reconcileOnAuth(userId).catch(() => {
      // Offline / transient: marker stays unset, retries on the next authed mount.
    });
  }, [service, userId]);

  useEffect(() => () => service?.dispose(), [service]);
}
