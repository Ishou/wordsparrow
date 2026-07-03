import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { ProgressSyncService } from '@/application/progress';
import { isDefaultPseudonym } from '@/domain/session/pseudonym';
import { useProgressSync } from './useProgressSync';

// Phase 5 §Architecture — context state machine.
// `loading` is the initial state until the first `whoami()` resolves.
// `anon` / `authed` are the steady states; visibilitychange re-checks
// in case sign-in happened in another tab.
export type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'anon' }
  | { readonly status: 'authed'; readonly whoami: WhoAmIResult };

export interface AuthContextValue {
  readonly state: AuthState;
  readonly status: AuthState['status'];
  readonly refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  readonly authClient: AuthClient;
  readonly getPseudonym: () => string;
  /**
   * Anon session id source. Fires {@link AuthProviderProps.onAuthed} on the
   * anon→authed transition with this value so the composition root can rebind
   * lobby seats. Optional — when omitted, the rebind hook is skipped (no
   * multiplayer feature flag, or test environments).
   */
  readonly getLocalSessionId?: () => string;
  /**
   * Fired once per sign-in event. The latch resets on sign-out so a
   * re-sign-in on the same page re-fires this hook. Failures inside the
   * callback are swallowed — AuthProvider clears the latch on rejection so
   * the next state change retries.
   */
  readonly onAuthed?: (anonSessionId: string) => Promise<void> | void;
  readonly progressSyncService?: ProgressSyncService;
  readonly children: ReactNode;
}

// Inside the provider so it can read auth context; a no-op without a service.
function ProgressSyncRunner({ service }: { service?: ProgressSyncService }) {
  useProgressSync(service);
  return null;
}

// Server default returned by the identity-api when a user signs in for
// the first time. If the local anon pseudonym is a default animal name,
// AuthProvider PATCHes it once so identity stays continuous.
const SERVER_DEFAULT_DISPLAY_NAME = 'Joueur';

// A tab regaining focus re-checks whoami at most every 5 minutes.
const WHOAMI_STALE_MS = 5 * 60_000;

export function AuthProvider({
  authClient,
  getPseudonym,
  getLocalSessionId,
  onAuthed,
  progressSyncService,
  children,
}: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  // Idempotency latch — guarantees the first-sign-in PATCH fires at
  // most once per page load, even if two visibilitychange events race.
  const carryOverAttempted = useRef(false);
  // Anon→authed rebind latch. Cleared on sign-out so a re-sign-in
  // re-fires the hook; cleared on callback rejection so the next render retries.
  const onAuthedLatch = useRef(false);
  // Set on every completed refresh (authed or anon) — records "we just asked", not "we are authed".
  const lastRefreshAt = useRef(0);

  const checkSession = useCallback(async (): Promise<WhoAmIResult | null> => {
    try {
      return await authClient.whoami();
    } catch {
      // Network failure (CORS, offline) — treat as anon. The user can
      // retry by signing in again; no UI value in surfacing a generic
      // fetch error in the header.
      return null;
    }
  }, [authClient]);

  const refresh = useCallback(async () => {
    try {
      const whoami = await checkSession();
      if (!whoami) {
        setState({ status: 'anon' });
        return;
      }
      // First-sign-in carry-over. The server defaulted displayName to
      // `Joueur` and the local anon pseudonym is still a generated
      // `Animal NNN` shape — patch the display name so it matches the
      // anon identity the player already saw, then re-read.
      if (
        !carryOverAttempted.current
        && whoami.displayName === SERVER_DEFAULT_DISPLAY_NAME
      ) {
        const local = getPseudonym();
        if (local.length > 0 && isDefaultPseudonym(local)) {
          carryOverAttempted.current = true;
          try {
            await authClient.updateMe(local);
            const after = await checkSession();
            setState(after ? { status: 'authed', whoami: after } : { status: 'anon' });
            return;
          } catch {
            // Non-fatal — display the server default; user can rename in /compte.
          }
        }
      }
      setState({ status: 'authed', whoami });
    } finally {
      lastRefreshAt.current = Date.now();
    }
  }, [authClient, checkSession, getPseudonym]);

  useEffect(() => {
    void refresh();
    const onVisibility = () => {
      if (
        document.visibilityState === 'visible'
        && Date.now() - lastRefreshAt.current >= WHOAMI_STALE_MS
      ) {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    if (state.status === 'anon') {
      onAuthedLatch.current = false;
      return;
    }
    if (state.status !== 'authed') return;
    if (onAuthedLatch.current) return;
    if (!onAuthed || !getLocalSessionId) return;
    onAuthedLatch.current = true;
    const anonSessionId = getLocalSessionId();
    Promise.resolve(onAuthed(anonSessionId)).catch((cause: unknown) => {
      console.warn('post-auth hook failed; will retry on next state change', cause);
      onAuthedLatch.current = false;
    });
  }, [state.status, onAuthed, getLocalSessionId]);

  return (
    <AuthContext.Provider value={{ state, status: state.status, refresh }}>
      <ProgressSyncRunner service={progressSyncService} />
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return ctx;
}

// Returns null outside an AuthProvider so callers can degrade gracefully.
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
