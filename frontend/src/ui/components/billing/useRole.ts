import { useOptionalAuth } from '@/ui/components/auth';

export type Role = 'guest' | 'player' | 'maintainer';

// Role is identity's, read from the existing session state (no whoami re-fetch).
export function useRole(): Role {
  const auth = useOptionalAuth();
  if (!auth || auth.state.status !== 'authed') return 'guest';
  // Authed sessions always carry a role on the wire; the fallback only guards a partially-populated state.
  return auth.state.whoami.role ?? 'player';
}
