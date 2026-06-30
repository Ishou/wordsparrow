import { useOptionalAuth } from '@/ui/components/auth';

// Render-only gate from identity session capabilities; server enforces (ADR-0078).
export function useCapability(capability: string): boolean {
  const auth = useOptionalAuth();
  if (!auth || auth.state.status !== 'authed') return false;
  return (auth.state.whoami.capabilities ?? []).includes(capability);
}
