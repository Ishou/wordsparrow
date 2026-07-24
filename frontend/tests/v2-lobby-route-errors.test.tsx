import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleRepository, PuzzleSolver } from '@/application';
import {
  LobbyClientError,
  type ConnectionState,
  type GameClient,
  type GameEvent,
  type LobbyClient,
} from '@/application/game';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { AuthClient } from '@/application/auth/AuthClient';
import { AuthProvider } from '@/ui/components/auth';
import type { Lobby, LobbyId, PlayerId, Pseudonym, SessionId } from '@/domain/game';
import { Route as RootRoute } from '@/ui/routes/__root';
import { Route as AppLayoutRoute } from '@/ui/routes/app-layout';
import { Route as LobbyRoute, lobbyLoaderRetryPolicy } from '@/ui/routes/lobby.$lobbyId';

const sessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const pseudonym = 'Joueur 1234' as Pseudonym;
const lobbyId = '7gQ2xK9p' as LobbyId;

const lobby: Lobby & { readonly id: LobbyId } = {
  id: lobbyId,
  ownerSessionId: sessionId,
  players: [{ playerId: sessionId as unknown as PlayerId, sessionId, pseudonym, joinedAt: '2026-06-27T15:30:00Z' }],
  state: 'WAITING',
  gridConfig: { width: 7, height: 7 },
  game: null,
  code: 'A2B3C4',
};

const notFoundError = () =>
  new LobbyClientError({ kind: 'not-found', status: 404, problem: null, message: 'gone' });
const upstreamError = () =>
  new LobbyClientError({ kind: 'upstream-unavailable', status: null, problem: null, message: 'net' });

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

// Dispatchable stub so tests can push server frames (e.g. the 404 protocol frame).
function makeStubGameClient() {
  const subscribers = new Set<(e: GameEvent) => void>();
  const connectionSubscribers = new Set<(s: ConnectionState) => void>();
  const calls = { leaveLobby: 0, disconnect: 0 };
  const client: GameClient = {
    connect: () => Promise.resolve(),
    joinLobby: () => {},
    renameSelf: () => {},
    setGridConfig: () => {},
    startGame: () => {},
    cellUpdate: () => {},
    cellFocus: () => {},
    leaveLobby: () => { calls.leaveLobby += 1; },
    rotateCode: () => {},
    rematch: () => {},
    returnToSalon: () => {},
    disconnect: () => { calls.disconnect += 1; },
    subscribe: (h) => { subscribers.add(h); return () => { subscribers.delete(h); }; },
    subscribeConnectionState: (h) => {
      connectionSubscribers.add(h);
      h('connected');
      return () => { connectionSubscribers.delete(h); };
    },
  };
  return {
    client,
    calls,
    dispatch: (e: GameEvent) => { for (const h of [...subscribers]) h(e); },
  };
}

// Minimal 1×1 wire puzzle so an IN_PROGRESS lobby mounts LiveCoopScreen.
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
  ...lobby,
  state: 'IN_PROGRESS',
  game: {
    puzzle: gamePuzzle,
    entries: [],
    lockedPositions: [],
    startedAt: '2026-06-27T15:31:00Z',
    completedAt: null,
  } as unknown as Lobby['game'],
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

function renderLobbyRoute(getLobby: LobbyClient['getLobby']) {
  const lobbyClient: LobbyClient = {
    createLobby: vi.fn().mockResolvedValue(lobby),
    getLobby,
    claimOwnership: vi.fn().mockResolvedValue(lobby),
    relinquishOwnership: vi.fn().mockResolvedValue(lobby),
    leaveLobby: vi.fn().mockResolvedValue(undefined),
    findByCode: vi.fn().mockResolvedValue(lobby),
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
  const stub = makeStubGameClient();
  const routeTree = RootRoute.addChildren([AppLayoutRoute.addChildren([LobbyRoute])]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/lobby/${lobbyId}`] }),
    context: {
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
      gameClient: stub.client,
      getSession: () => ({ sessionId, pseudonym }),
      setPseudonym: () => {},
      lobbyJoinCodeStash: { stash: () => {}, read: () => null, clear: () => {} },
    },
  });
  return {
    router,
    lobbyClient,
    stub,
    ...render(
      <AuthProvider authClient={stubAuthClient} getPseudonym={() => pseudonym}>
        <RouterProvider router={router} />
      </AuthProvider>,
    ),
  };
}

beforeEach(() => {
  lobbyLoaderRetryPolicy.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('v2 /lobby/$lobbyId loader error routing', () => {
  it('shows « Partie introuvable » on a server-confirmed not-found and never auto-retries', async () => {
    const getLobby = vi.fn().mockRejectedValue(notFoundError());
    renderLobbyRoute(getLobby);
    expect(await screen.findByText('Partie introuvable')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 150));
    expect(getLobby).toHaveBeenCalledTimes(1);
  });

  it('recovers silently from a one-shot network failure — no error screen, no retry chrome', async () => {
    const getLobby = vi
      .fn<LobbyClient['getLobby']>()
      .mockRejectedValueOnce(upstreamError())
      .mockResolvedValue(lobby);
    renderLobbyRoute(getLobby);

    // The instant retry lands and the salon renders — zero user action.
    expect(await screen.findByRole('button', { name: 'Quitter' })).toBeTruthy();
    expect(getLobby).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Partie introuvable')).toBeNull();
    expect(screen.queryByText('Reconnexion…')).toBeNull();
  });

  it('keeps auto-retrying a persistent transient failure with « Reconnexion… » — never « Partie introuvable »', async () => {
    const getLobby = vi.fn().mockRejectedValue(upstreamError());
    renderLobbyRoute(getLobby);

    // Instant retry fails → the loud phase surfaces with the manual CTA.
    expect(await screen.findByText('Reconnexion…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.queryByText('Partie introuvable')).toBeNull();
    expect(getLobby.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('rests at the manual « Réessayer » CTA once the auto-retry budget is spent', async () => {
    // Drain the budget as if the incident had been running for a few seconds.
    const base = Date.now();
    for (let i = 0; i < 6; i++) lobbyLoaderRetryPolicy.next(base - 6_000 + i * 1_000);

    const getLobby = vi.fn().mockRejectedValue(upstreamError());
    renderLobbyRoute(getLobby);

    expect(await screen.findByText('Connexion impossible')).toBeTruthy();
    const callsBefore = getLobby.mock.calls.length;
    await new Promise((r) => setTimeout(r, 150));
    expect(getLobby.mock.calls.length).toBe(callsBefore); // resting — no auto-retry

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => {
      expect(getLobby.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('swaps to « Partie introuvable » when the server reports the lobby gone mid-session', async () => {
    const getLobby = vi.fn().mockResolvedValue(lobby);
    const { stub } = renderLobbyRoute(getLobby);
    expect(await screen.findByRole('button', { name: 'Quitter' })).toBeTruthy();

    stub.dispatch({
      type: 'error',
      errorType: 'https://bliss.example/errors/protocol',
      title: 'Salon introuvable',
      detail: "Aucun salon avec l'identifiant 7gQ2xK9p n'existe.",
      status: 404,
    });

    expect(await screen.findByText('Partie introuvable')).toBeTruthy();
  });
});

describe('v2 /lobby/$lobbyId — in-game back does not relinquish (ADR-0098 §2)', () => {
  it('navigates home on the back arrow WITHOUT sending a leaveLobby frame', async () => {
    const getLobby = vi.fn().mockResolvedValue(inProgressLobby);
    const { router, stub } = renderLobbyRoute(getLobby);
    const back = await screen.findByRole('button', { name: 'Quitter la partie' });
    fireEvent.click(back);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    // Navigating away must not relinquish ownership — only disconnect on unmount.
    expect(stub.calls.leaveLobby).toBe(0);
    expect(stub.calls.disconnect).toBeGreaterThanOrEqual(1);
  });

  it('drives the ownerless claim banner from the REST snapshot flag on entry', async () => {
    const getLobby = vi.fn().mockResolvedValue({ ...inProgressLobby, ownerless: true });
    renderLobbyRoute(getLobby);
    // No live ownershipChanged event is pushed — the banner comes from lobby.ownerless.
    expect(await screen.findByRole('button', { name: 'Reprendre la partie' })).toBeTruthy();
  });
});
