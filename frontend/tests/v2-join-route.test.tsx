import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectAxeClean } from '@/test/a11y';
import type { PuzzleRepository, PuzzleSolver } from '@/application';
import type { AuthClient } from '@/application/auth/AuthClient';
import { AuthProvider } from '@/ui/components/auth';
import { LobbyClientError, type GameClient, type LobbyClient } from '@/application/game';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { Lobby, LobbyId, Pseudonym, SessionId } from '@/domain/game';
import { Route as RootRoute } from '@/ui/routes/__root';
import { Route as AppLayoutRoute } from '@/ui/routes/app-layout';
import { Route as JoinRoute, joinLoaderRetryPolicy } from '@/ui/routes/join.$code';
import { Route as LobbyRoute } from '@/ui/routes/lobby.$lobbyId';

const sessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const pseudonym = 'Joueur 1234' as Pseudonym;
const lobbyId = '7gQ2xK9p' as LobbyId;

const lobby: Lobby & { readonly id: LobbyId } = {
  id: lobbyId,
  ownerSessionId: sessionId,
  players: [{ sessionId, pseudonym, joinedAt: '2026-06-27T15:30:00Z' }],
  state: 'WAITING',
  gridConfig: { width: 7, height: 7 },
  game: null,
  code: 'A2B3C4',
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
const stubGameClient: GameClient = {
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
  subscribe: () => () => {},
  subscribeConnectionState: () => () => {},
};

const stubAuthClient: AuthClient = {
  whoami: () => Promise.resolve(null),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  deleteMe: vi.fn(),
  logout: vi.fn(),
  signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${returnTo}`,
};

const makeInMemoryStash = () => {
  const map = new Map<string, string>();
  return {
    stash(id: string, code: string) { map.set(id, code); },
    read(id: string) { return map.get(id) ?? null; },
    clear(id: string) { map.delete(id); },
  };
};

function renderJoin(initialEntry: string, lobbyClientOverrides: Partial<LobbyClient> = {}) {
  const lobbyClient: LobbyClient = {
    createLobby: vi.fn().mockResolvedValue(lobby),
    getLobby: vi.fn().mockResolvedValue(lobby),
    findByCode: vi.fn().mockResolvedValue(lobby),
    listMyLobbies: vi.fn().mockResolvedValue([]),
    rebindLobbySessions: vi.fn().mockResolvedValue(undefined),
    unbindLobbySessions: vi.fn().mockResolvedValue(undefined),
    ...lobbyClientOverrides,
  };
  const stash = makeInMemoryStash();
  const puzzleRepository: PuzzleRepository = {
    fetchById: () => Promise.resolve(null as never),
    fetchDaily: () => Promise.resolve(null),
    listDailySummaries: () => Promise.resolve({ items: [], hasMore: false }),
  };
  const routeTree = RootRoute.addChildren([
    AppLayoutRoute.addChildren([JoinRoute, LobbyRoute]),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
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
      gameClient: stubGameClient,
      getSession: () => ({ sessionId, pseudonym }),
      setPseudonym: () => {},
      lobbyJoinCodeStash: stash,
    },
  });
  return {
    router,
    lobbyClient,
    stash,
    ...render(
      <AuthProvider authClient={stubAuthClient} getPseudonym={() => pseudonym}>
        <RouterProvider router={router} />
      </AuthProvider>,
    ),
  };
}

beforeEach(() => {
  joinLoaderRetryPolicy.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('v2 /join/$code route', () => {
  it('resolves the code, stashes it, and redirects to the lobby', async () => {
    const { lobbyClient, stash, router } = renderJoin('/join/A2B3C4');
    await waitFor(() => {
      expect(lobbyClient.findByCode).toHaveBeenCalledWith('A2B3C4');
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/lobby/${lobbyId}`);
    });
    expect(stash.read(lobbyId)).toBe('A2B3C4');
  });

  it('shows an error for a not-found code', async () => {
    renderJoin('/join/Z9Z9Z9', {
      findByCode: vi
        .fn()
        .mockRejectedValue(
          new LobbyClientError({ kind: 'not-found', status: 404, problem: null, message: 'gone' }),
        ),
    });
    expect(await screen.findByText('Code invalide ou partie expirée.')).toBeTruthy();
  });

  it('rejects a malformed code at parse-time without calling findByCode', async () => {
    const { lobbyClient } = renderJoin('/join/!!');
    expect(await screen.findByText('Code invalide ou partie expirée.')).toBeTruthy();
    expect(lobbyClient.findByCode).not.toHaveBeenCalled();
  });

  it('auto-retries a transient findByCode failure instead of claiming the code is bad', async () => {
    const findByCode = vi
      .fn<LobbyClient['findByCode']>()
      .mockRejectedValueOnce(
        new LobbyClientError({ kind: 'upstream-unavailable', status: null, problem: null, message: 'net' }),
      )
      .mockResolvedValue(lobby);
    const { router } = renderJoin('/join/A2B3C4', { findByCode });

    // The instant silent retry lands and the redirect proceeds — the
    // bad-code screen never gets a chance to lie about a network blip.
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/lobby/${lobbyId}`);
    });
    expect(findByCode).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Code invalide ou partie expirée.')).toBeNull();
  });

  it('shows « Reconnexion… » with a « Réessayer » CTA while findByCode keeps failing', async () => {
    renderJoin('/join/A2B3C4', {
      findByCode: vi.fn().mockRejectedValue(
        new LobbyClientError({ kind: 'transient', status: 502, problem: null, message: '5xx' }),
      ),
    });
    expect(await screen.findByText('Reconnexion…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
    expect(screen.queryByText('Code invalide ou partie expirée.')).toBeNull();
  });

  it('V2JoinError is axe-clean (ADR-0050)', async () => {
    const { container } = renderJoin('/join/Z9Z9Z9', {
      findByCode: vi.fn().mockRejectedValue(
        new LobbyClientError({ kind: 'not-found', status: 404, problem: null, message: 'gone' }),
      ),
    });
    await screen.findByText('Code invalide ou partie expirée.');
    await expectAxeClean(container);
  });
});
