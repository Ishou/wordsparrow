import { useOptionalAuth } from '@/ui/components/auth';

export type Role = 'guest' | 'player' | 'maintainer';

export function useRole(): Role {
  const auth = useOptionalAuth();
  if (!auth || auth.state.status !== 'authed') return 'guest';
  // Wire always carries role; fallback guards legacy/under-specified fixtures.
  return auth.state.whoami.role ?? 'player';
}
