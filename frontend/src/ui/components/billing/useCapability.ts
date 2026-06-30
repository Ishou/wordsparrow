import { useOptionalAuth } from '@/ui/components/auth';

// Render-only gate sourced from the identity session's capabilities; the
// server still enforces authorization (ADR-0078). Capabilities live on
// identity, never on billing (ADR-0060/0078).
export function useCapability(capability: string): boolean {
  const auth = useOptionalAuth();
  if (!auth || auth.state.status !== 'authed') return false;
  return (auth.state.whoami.capabilities ?? []).includes(capability);
}
