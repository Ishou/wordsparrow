import { act, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleRepository, PuzzleSolver } from '@/application';
import type { ConnectionState, GameClient, GameEvent, LobbyClient } from '@/application/game';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { AuthClient } from '@/application/auth/AuthClient';
import { AuthProvider } from '@/ui/components/auth';
import type { Instant, Lobby, LobbyId, PlayerId, Pseudonym, SessionId } from '@/domain/game';
import { Route as RootRoute } from '@/ui/routes/__root';
import { Route as AppLayoutRoute } from '@/ui/routes/app-layout';
import { Route as LobbyRoute, lobbyLoaderRetryPolicy } from '@/ui/routes/lobby.$lobbyId';
import { t } from '@/ui/i18n';

const sessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const pseudonym = 'Renard 777' as Pseudonym;
const lobbyId = '7gQ2xK9p' as LobbyId;
const accountUserId = '11111111-1111-1111-1111-111111111111';
const accountName = 'Colin Compte' as Pseudonym;

// The account already holds a seat from a prior WS join (the loader's REST snapshot reflects it), keyed by the account userId — not the device sessionId.
const authedWaitingLobby: Lobby & { readonly id: LobbyId } = {
  id: lobbyId,
  ownerSessionId: sessionId,
  players: [{ playerId: accountUserId as PlayerId, sessionId, pseudonym: accountName, joinedAt: '2026-06-27T15:30:00Z' as Instant }],
  state: 'WAITING',
  gridConfig: { width: 7, height: 7 },
  game: null,
  code: 'A2B3C4',
};

const stubPuzzleSolver: PuzzleSolver = {
  validate: () => Promise.resolve({ solved: false }),
  requestHint: () => Promise.reject(new Error('not used')),
  verify: () => Promise.reject(new Error('not used')),
};
const emptyStore: SoloEntriesStore = {
  load: () => [],
  save: () => {},
  loadLockedCells: () => [],
  lockCell: () => {},
  loadHintsUsed: () => 0,
  recordHintUsed: () => {},
  loadElapsed: () => 0,
  saveElapsed: () => {},
  clearForPuzzle: () => {},
};

// whoami() only settles once the test explicitly releases it, so it can be forced to resolve after the lobby loader — mirroring the real deep-link timing where AuthProvider's whoami() and the route loader are two independent, unordered network round-trips.
let releaseWhoami: (v: { userId: string; displayName: Pseudonym } | null) => void = () => {};
const slowAuthClient: AuthClient = {
  whoami: () => new Promise((resolve) => { releaseWhoami = resolve; }),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  deleteMe: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  startEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
  signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${returnTo}`,
};

interface Dispatchable extends GameClient {
  readonly dispatch: (event: GameEvent) => void;
}

function makeGameClient(): Dispatchable {
  const subscribers = new Set<(e: GameEvent) => void>();
  return {
    connect: () => Promise.resolve(),
    joinLobby: () => {},
    renameSelf: () => {},
    setGridConfig: () => {},
    startGame: () => {},
    cellUpdate: () => {},
    cellFocus: () => {},
    leaveLobby: () => {},
    rotateCode: () => {},
    rematch: () => {},
    returnToSalon: () => {},
    disconnect: () => {},
    subscribe: (h) => { subscribers.add(h); return () => { subscribers.delete(h); }; },
    subscribeConnectionState: (h: (s: ConnectionState) => void) => { h('connected'); return () => {}; },
    dispatch: (event) => { for (const s of [...subscribers]) s(event); },
  };
}

function makeRouter(getLobby: LobbyClient['getLobby'], gameClient: GameClient) {
  const lobbyClient: LobbyClient = {
    createLobby: vi.fn().mockResolvedValue(authedWaitingLobby),
    getLobby,
    claimOwnership: vi.fn().mockResolvedValue(authedWaitingLobby),
    relinquishOwnership: vi.fn().mockResolvedValue(authedWaitingLobby),
    leaveLobby: vi.fn().mockResolvedValue(undefined),
    findByCode: vi.fn().mockResolvedValue(authedWaitingLobby),
    listMyLobbies: vi.fn().mockResolvedValue([]),
    listMyLobbiesForUser: vi.fn().mockResolvedValue([]),
    rebindLobbySessions: vi.fn().mockResolvedValue(undefined),
    unbindLobbySessions: vi.fn().mockResolvedValue(undefined),
  };
  const puzzleRepository: PuzzleRepository = {
    fetchById: () => Promise.resolve(null as never),
    fetchDaily: () => Promise.resolve(null),
    listDailySummaries: () => Promise.resolve({ items: [], hasMore: false }),
  };
  const homeRoute = createRoute({
    getParentRoute: () => AppLayoutRoute,
    path: '/',
    component: () => <div>accueil</div>,
  });
  const routeTree = RootRoute.addChildren([AppLayoutRoute.addChildren([homeRoute, LobbyRoute])]);
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: {
      authClient: slowAuthClient,
      puzzleRepository,
      puzzleSolver: stubPuzzleSolver,
      sessionClient: {
        eraseSession: () => Promise.resolve({ deleted: 0 }),
        getSessionId: () => 'test-session-id',
        clearLocalSession: () => {},
      },
      soloEntriesStore: emptyStore,
      tourSeenStore: { get: () => true, set: () => {}, clear: () => {} },
      lobbyClient,
      gameClient,
      getSession: () => ({ sessionId, pseudonym }),
      setPseudonym: () => {},
      lobbyJoinCodeStash: { stash: () => {}, read: () => null, clear: () => {} },
    },
  });
}

beforeEach(() => { lobbyLoaderRetryPolicy.reset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('v2 /lobby/$lobbyId — authed deep-link race between the loader and whoami()', () => {
  it('confirms the join and renders the salon once whoami() resolves after the loader, for an account already seated in the snapshot', async () => {
    const gameClient = makeGameClient();
    const getLobby = vi.fn<LobbyClient['getLobby']>().mockResolvedValue(authedWaitingLobby);
    const router = makeRouter(getLobby, gameClient);
    render(
      <AuthProvider authClient={slowAuthClient} getPseudonym={() => pseudonym}>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    // The loader settles first (whoami() is still pending), so the first render computes currentPlayerId from the anon sessionId fallback — mirroring a fresh page load / shared-invite deep link.
    await act(async () => { await router.navigate({ to: '/lobby/$lobbyId', params: { lobbyId } }); });
    expect(screen.getByText(t('route.lobby.placeholder.connecting'))).toBeTruthy();

    // whoami() now resolves — AuthProvider flips to 'authed' and currentPlayerId becomes the account userId already present in the snapshot.
    await act(async () => {
      releaseWhoami({ userId: accountUserId, displayName: accountName });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText('Colin Compte (toi)')).toBeTruthy();
    expect(screen.queryByText(t('route.lobby.placeholder.connecting'))).toBeNull();
  });
});
