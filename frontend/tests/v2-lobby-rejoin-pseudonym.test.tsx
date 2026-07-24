import { act, fireEvent, render, screen } from '@testing-library/react';
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

const sessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const pseudonym = 'Renard 777' as Pseudonym;
const lobbyId = '7gQ2xK9p' as LobbyId;
// Anon: playerId equals sessionId (ADR-0066 (e)).
const anonPlayerId = sessionId as unknown as PlayerId;
const accountUserId = '11111111-1111-1111-1111-111111111111';

const waitingLobby: Lobby & { readonly id: LobbyId } = {
  id: lobbyId,
  ownerSessionId: sessionId,
  players: [{ playerId: anonPlayerId, sessionId, pseudonym, joinedAt: '2026-06-27T15:30:00Z' as Instant }],
  state: 'WAITING',
  gridConfig: { width: 7, height: 7 },
  game: null,
  code: 'A2B3C4',
};

const gamePuzzle = {
  id: 'p1',
  title: 'Test',
  language: 'fr',
  width: 1,
  height: 1,
  hintsAllowed: 0,
  cells: [{ kind: 'letter', position: { row: 0, column: 0 }, letter: null }],
  clues: [],
  createdAt: '2026-06-27T15:31:00Z',
};

const inProgressLobby: Lobby & { readonly id: LobbyId } = {
  ...waitingLobby,
  state: 'IN_PROGRESS',
  game: {
    puzzle: gamePuzzle,
    entries: [],
    lockedPositions: [],
    startedAt: '2026-06-27T15:31:00Z',
    completedAt: null,
  } as unknown as Lobby['game'],
};

const completedLobby: Lobby & { readonly id: LobbyId } = {
  ...waitingLobby,
  state: 'COMPLETED',
  game: {
    puzzle: gamePuzzle,
    entries: [],
    lockedPositions: [],
    startedAt: '2026-06-27T15:31:00Z',
    completedAt: '2026-06-27T15:41:00Z',
  } as unknown as Lobby['game'],
};

// An authed host: the server-verified account name differs from the local guest session pseudonym.
const accountName = 'Colin Compte' as Pseudonym;
const authedWaitingLobby: Lobby & { readonly id: LobbyId } = {
  ...waitingLobby,
  // Authed: identity is the account userId (ADR-0066 (e)), not the device sessionId.
  players: [{ playerId: accountUserId as PlayerId, sessionId, pseudonym: accountName, joinedAt: '2026-06-27T15:30:00Z' as Instant }],
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
const stubAuthClient: AuthClient = {
  whoami: () => Promise.resolve(null),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  deleteMe: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  startEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
  signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${returnTo}`,
};
const authedAuthClient: AuthClient = {
  ...stubAuthClient,
  whoami: () => Promise.resolve({ userId: '11111111-1111-1111-1111-111111111111', displayName: accountName }),
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
    createLobby: vi.fn().mockResolvedValue(waitingLobby),
    getLobby,
    claimOwnership: vi.fn().mockResolvedValue(waitingLobby),
    relinquishOwnership: vi.fn().mockResolvedValue(waitingLobby),
    leaveLobby: vi.fn().mockResolvedValue(undefined),
    findByCode: vi.fn().mockResolvedValue(waitingLobby),
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
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: {
      authClient: stubAuthClient,
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
  return router;
}

function renderRouter(router: ReturnType<typeof makeRouter>, authClient: AuthClient = stubAuthClient) {
  return render(
    <AuthProvider authClient={authClient} getPseudonym={() => pseudonym}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

const goLobby = (router: ReturnType<typeof makeRouter>) =>
  router.navigate({ to: '/lobby/$lobbyId', params: { lobbyId } });

beforeEach(() => { lobbyLoaderRetryPolicy.reset(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('v2 /lobby/$lobbyId — local pseudonym survives a seatless rejoin snapshot', () => {
  it('keeps « (toi) » on the roster and pre-fills the rename editor when the connect snapshot drops the local seat', async () => {
    const gameClient = makeGameClient();
    const getLobby = vi.fn<LobbyClient['getLobby']>().mockResolvedValue(waitingLobby);
    const router = makeRouter(getLobby, gameClient);
    renderRouter(router);

    await act(async () => { await goLobby(router); });
    // Sanity: the salon shows the local player before any snapshot churn.
    expect(await screen.findByText('Renard 777 (toi)')).toBeTruthy();

    // Connect-time replay: the pre-join snapshot lacks the local seat (grace freed it / authed seat-move not yet applied).
    act(() => {
      gameClient.dispatch({
        type: 'lobbyState',
        players: [],
        ownerSessionId: sessionId,
        state: 'WAITING',
        gridConfig: { width: 7, height: 7 },
        code: 'A2B3C4',
        game: null,
      });
    });

    // The local pseudonym must still be shown (not blanked) while the join re-seat is in flight.
    expect(screen.getByText('Renard 777 (toi)')).toBeTruthy();
    // And the rename editor pre-fills from the local identity, not an empty string.
    fireEvent.click(screen.getByRole('button', { name: 'Changer mon pseudo' }));
    const input = screen.getByLabelText('Ton pseudonyme') as HTMLInputElement;
    expect(input.value).toBe('Renard 777');
  });

  it('shows the authed account pseudonym (not the local guest name) when the connect snapshot drops the local seat', async () => {
    const gameClient = makeGameClient();
    const getLobby = vi.fn<LobbyClient['getLobby']>().mockResolvedValue(authedWaitingLobby);
    const router = makeRouter(getLobby, gameClient);
    renderRouter(router, authedAuthClient);

    await act(async () => { await goLobby(router); });
    expect(await screen.findByText('Colin Compte (toi)')).toBeTruthy();

    // Connect-time replay drops the local seat while the authed account name differs from the local guest pseudonym.
    act(() => {
      gameClient.dispatch({
        type: 'lobbyState',
        players: [],
        ownerSessionId: sessionId,
        state: 'WAITING',
        gridConfig: { width: 7, height: 7 },
        code: 'A2B3C4',
        game: null,
      });
    });

    // The synthesized fallback seat must carry the ACCOUNT name, never the local guest « Renard 777 ».
    expect(await screen.findByText('Colin Compte (toi)')).toBeTruthy();
    expect(screen.queryByText(/Renard 777/)).toBeNull();
  });

  it('keeps « (toi) » in the live co-op roster when the connect snapshot drops the local seat', async () => {
    const gameClient = makeGameClient();
    const getLobby = vi.fn<LobbyClient['getLobby']>().mockResolvedValue(inProgressLobby);
    const router = makeRouter(getLobby, gameClient);
    renderRouter(router);

    await act(async () => { await goLobby(router); });
    expect(await screen.findByText('Renard 777 (toi)')).toBeTruthy();

    act(() => {
      gameClient.dispatch({
        type: 'lobbyState',
        players: [],
        ownerSessionId: sessionId,
        state: 'IN_PROGRESS',
        gridConfig: { width: 1, height: 1 },
        code: 'A2B3C4',
        game: {
          puzzle: gamePuzzle,
          startedAt: '2026-06-27T15:31:00Z' as Instant,
          completedAt: null,
          entries: [],
          presence: [],
          lockedPositions: [],
        },
      } as unknown as GameEvent);
    });

    expect(screen.getByText('Renard 777 (toi)')).toBeTruthy();
  });

  it('keeps the local pseudonym on the Résultats roster when the connect snapshot drops the local seat', async () => {
    const gameClient = makeGameClient();
    const getLobby = vi.fn<LobbyClient['getLobby']>().mockResolvedValue(completedLobby);
    const router = makeRouter(getLobby, gameClient);
    renderRouter(router);

    await act(async () => { await goLobby(router); });
    expect(await screen.findByText('Renard 777')).toBeTruthy();

    act(() => {
      gameClient.dispatch({
        type: 'lobbyState',
        players: [],
        ownerSessionId: sessionId,
        state: 'COMPLETED',
        gridConfig: { width: 1, height: 1 },
        code: 'A2B3C4',
        game: {
          puzzle: gamePuzzle,
          startedAt: '2026-06-27T15:31:00Z' as Instant,
          completedAt: '2026-06-27T15:41:00Z' as Instant,
          entries: [],
          presence: [],
          lockedPositions: [],
        },
      } as unknown as GameEvent);
    });

    expect(screen.getByText('Renard 777')).toBeTruthy();
  });
});
