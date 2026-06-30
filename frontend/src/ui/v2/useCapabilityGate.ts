import { useCapability } from '@/ui/components/billing/useCapability';
import { useOptionalAuth } from '@/ui/components/auth';

export type CapabilityGateStatus = 'loading' | 'denied' | 'allowed';

// Render-only gate from identity session capabilities; the server enforces (ADR-0079). `denied` renders the standard 404.
export function useCapabilityGate(capability: string): CapabilityGateStatus {
  const auth = useOptionalAuth();
  const allowed = useCapability(capability);
  if (auth?.state.status === 'loading') return 'loading';
  return allowed ? 'allowed' : 'denied';
}
