import { useOptionalAuth } from '@/ui/components/auth';

export type Role = 'guest' | 'player' | 'maintainer';

export function useRole(): Role {
  const auth = useOptionalAuth();
  if (!auth || auth.state.status !== 'authed') return 'guest';
  // Authed sessions always carry a role on the wire; the fallback only
  // guards a partially-populated state.
  return auth.state.whoami.role ?? 'player';
}
