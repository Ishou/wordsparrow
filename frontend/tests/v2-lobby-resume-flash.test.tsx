import { act, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleRepository, PuzzleSolver } from '@/application';
import type {
  ConnectionState,
  GameClient,
  GameEvent,
  LobbyClient,
} from '@/application/game';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { AuthClient } from '@/application/auth/AuthClient';
import { AuthProvider } from '@/ui/components/auth';
import type { Lobby, LobbyId, Pseudonym, SessionId } from '@/domain/game';
import { Route as RootRoute } from '@/ui/routes/__root';
import { Route as AppLayoutRoute } from '@/ui/routes/app-layout';
import { Route as LobbyRoute, lobbyLoaderRetryPolicy } from '@/ui/routes/lobby.$lobbyId';

const sessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const pseudonym = 'Joueur 1234' as Pseudonym;
const lobbyId = '7gQ2xK9p' as LobbyId;

const waitingLobby: Lobby & { readonly id: LobbyId } = {
  id: lobbyId,
  ownerSessionId: sessionId,
  players: [{ sessionId, pseudonym, joinedAt: '2026-06-27T15:30:00Z' }],
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

const ownerlessInProgressLobby: Lobby & { readonly id: LobbyId } = {
  ...inProgressLobby,
  ownerless: true,
};

const stubPuzzleSolver: PuzzleSolver = {
  validate: () => Promise.resolve({ solved: false }),
  requestHint: () => Promise.reject(new Error('not used')),
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

function makeStubGameClient(): GameClient {
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
    disconnect: () => {},
    subscribe: (h) => { subscribers.add(h); return () => { subscribers.delete(h); }; },
    subscribeConnectionState: (h: (s: ConnectionState) => void) => {
      h('connected');
      return () => {};
    },
  };
}

// A `/` home route sits alongside the lobby so the test can navigate away and back —
// reproducing the resume flow (Accueil → « Rejoindre ma partie » → /lobby/$id).
function makeRouter(getLobby: LobbyClient['getLobby'], authClient: AuthClient = stubAuthClient) {
  const lobbyClient: LobbyClient = {
    createLobby: vi.fn().mockResolvedValue(waitingLobby),
    getLobby,
    claimOwnership: vi.fn().mockResolvedValue(waitingLobby),
    relinquishOwnership: vi.fn().mockResolvedValue(waitingLobby),
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
  const routeTree = RootRoute.addChildren([
    AppLayoutRoute.addChildren([homeRoute, LobbyRoute]),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: {
      authClient,
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
      gameClient: makeStubGameClient(),
      getSession: () => ({ sessionId, pseudonym }),
      setPseudonym: () => {},
      lobbyJoinCodeStash: { stash: () => {}, read: () => null, clear: () => {} },
    },
  });
  return { router, lobbyClient };
}

function renderRouter(
  router: ReturnType<typeof makeRouter>['router'],
  authClient: AuthClient = stubAuthClient,
) {
  return render(
    <AuthProvider authClient={authClient} getPseudonym={() => pseudonym}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

const goLobby = (router: ReturnType<typeof makeRouter>['router']) =>
  router.navigate({ to: '/lobby/$lobbyId', params: { lobbyId } });

// Salon-unique lead copy — distinguishes the waiting room from LiveCoopScreen (which also carries a « Quitter » control).
const SALON_MARKER = 'Invite tes amis, puis lance la grille ensemble.';

beforeEach(() => {
  lobbyLoaderRetryPolicy.reset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('v2 /lobby/$lobbyId — resuming an in-progress game shows no waiting-room flash', () => {
  it('never paints SalonScreen when a stale WAITING snapshot was cached, then the lobby is now IN_PROGRESS', async () => {
    let deferred: { resolve: (l: Lobby) => void } | null = null;
    let phase: 'waiting' | 'in-progress' = 'waiting';
    const getLobby = vi.fn<LobbyClient['getLobby']>().mockImplementation(() => {
      if (phase === 'waiting') return Promise.resolve(waitingLobby);
      return new Promise<Lobby>((resolve) => { deferred = { resolve }; });
    });
    const { router } = makeRouter(getLobby);
    renderRouter(router);

    // First visit: WAITING → the salon renders and its snapshot lands in the loader cache.
    await act(async () => { await goLobby(router); });
    expect(await screen.findByText(SALON_MARKER)).toBeTruthy();

    // Leave to Accueil; the WAITING match stays in the router cache (default gcTime).
    await act(async () => { await router.navigate({ to: '/' }); });
    await screen.findByText('accueil');

    // The owner has since started the game: the server now answers IN_PROGRESS (deferred).
    phase = 'in-progress';

    // Resume: navigate back to the same lobby while the loader is in flight —
    // the router must show the pending placeholder, NEVER the stale waiting room.
    let navPromise!: Promise<void>;
    await act(async () => {
      navPromise = goLobby(router) as unknown as Promise<void>;
      await Promise.resolve();
    });
    expect(screen.queryByText(SALON_MARKER)).toBeNull();

    // Resolve the in-flight loader → the live grid mounts, with no salon frame in between.
    await act(async () => {
      deferred!.resolve(inProgressLobby);
      await navPromise;
    });
    expect(await screen.findByRole('button', { name: 'Quitter la partie' })).toBeTruthy();
    expect(screen.queryByText(SALON_MARKER)).toBeNull();
  });

  it('still renders the waiting room for a genuinely WAITING lobby (no regression)', async () => {
    const getLobby = vi.fn<LobbyClient['getLobby']>().mockResolvedValue(waitingLobby);
    const { router } = makeRouter(getLobby);
    renderRouter(router);
    await act(async () => { await goLobby(router); });
    await waitFor(() => expect(screen.getByText(SALON_MARKER)).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Quitter la partie' })).toBeNull();
  });
});

describe('v2 /lobby/$lobbyId — claiming an ownerless game (ADR-0098 §6 / ADR-0083)', () => {
  // A controllable whoami: the test resolves it only after the claim button is up, so the
  // auth state settles deterministically to anon/authed before the tap (no loading-window race).
  const goOwnerless = async (whoamiResult: Awaited<ReturnType<AuthClient['whoami']>>) => {
    let resolveWhoami!: (v: Awaited<ReturnType<AuthClient['whoami']>>) => void;
    const authClient: AuthClient = {
      ...stubAuthClient,
      whoami: () => new Promise((resolve) => { resolveWhoami = resolve; }),
    };
    const getLobby = vi.fn<LobbyClient['getLobby']>().mockResolvedValue(ownerlessInProgressLobby);
    const { router, lobbyClient } = makeRouter(getLobby, authClient);
    renderRouter(router, authClient);
    await act(async () => { await goLobby(router); });
    await screen.findByRole('button', { name: 'Reprendre la partie' });
    await act(async () => { resolveWhoami(whoamiResult); await Promise.resolve(); });
    return { lobbyClient };
  };

  it('prompts a guest (anon) to sign in and never calls claimOwnership; the game stays playable', async () => {
    const { lobbyClient } = await goOwnerless(null);
    // Playing is never gated for a guest — the on-screen keyboard is present before any claim tap
    // (asserted here, not after: the sign-in modal makes the background inert once open).
    expect(screen.getByRole('button', { name: 'Effacer' })).toBeTruthy();
    act(() => {
      screen.getByRole('button', { name: 'Reprendre la partie' }).click();
    });
    expect(await screen.findByText('Connecte-toi pour créer une partie')).toBeTruthy();
    expect(lobbyClient.claimOwnership).not.toHaveBeenCalled();
  });

  it('claims ownership directly for a signed-in player', async () => {
    const { lobbyClient } = await goOwnerless({ userId: 'u-1', displayName: 'Lapin 472', capabilities: [] });
    act(() => {
      screen.getByRole('button', { name: 'Reprendre la partie' }).click();
    });
    await waitFor(() => expect(lobbyClient.claimOwnership).toHaveBeenCalledWith(lobbyId));
    expect(screen.queryByText('Connecte-toi pour créer une partie')).toBeNull();
  });
});
