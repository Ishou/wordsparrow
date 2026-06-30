import { useOptionalAuth } from '@/ui/components/auth';

export type BillingGateStatus = 'loading' | 'denied' | 'allowed';

// Render-only gate from identity session capabilities; the server enforces (ADR-0078). `denied` renders the standard 404.
export function useBillingGate(capability = 'billing:subscribe'): BillingGateStatus {
  const auth = useOptionalAuth();
  if (auth?.state.status === 'loading') return 'loading';
  if (auth?.state.status === 'authed' && (auth.state.whoami.capabilities ?? []).includes(capability)) {
    return 'allowed';
  }
  return 'denied';
}
