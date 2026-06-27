import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleRepository, PuzzleSolver } from '@/application';
import { LobbyClientError, type GameClient, type LobbyClient } from '@/application/game';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { Lobby, LobbyId, Pseudonym, SessionId } from '@/domain/game';
import { Route as RootRoute } from '@/ui/routes/__root';
import { Route as V2Route } from '@/ui/routes/v2';
import { Route as V2JoinRoute } from '@/ui/routes/v2.join.$code';
import { Route as V2LobbyRoute } from '@/ui/routes/v2.lobby.$lobbyId';

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
  validate: () => Promise.resolve({ solved: false, incorrectCells: [] }),
  requestHint: () => Promise.reject(new Error('not used')),
};
const emptyStore: SoloEntriesStore = {
  load: () => [],
  save: () => {},
  loadLockedCells: () => [],
  lockCell: () => {},
  loadHintsUsed: () => 0,
  recordHintUsed: () => {},
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
    V2Route.addChildren([V2JoinRoute, V2LobbyRoute]),
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
  return { router, lobbyClient, stash, ...render(<RouterProvider router={router} />) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('v2 /join/$code route', () => {
  it('resolves the code, stashes it, and redirects to the lobby', async () => {
    const { lobbyClient, stash, router } = renderJoin('/v2/join/A2B3C4');
    await waitFor(() => {
      expect(lobbyClient.findByCode).toHaveBeenCalledWith('A2B3C4');
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/v2/lobby/${lobbyId}`);
    });
    expect(stash.read(lobbyId)).toBe('A2B3C4');
  });

  it('shows an error for a not-found code', async () => {
    renderJoin('/v2/join/Z9Z9Z9', {
      findByCode: vi
        .fn()
        .mockRejectedValue(
          new LobbyClientError({ kind: 'not-found', status: 404, problem: null, message: 'gone' }),
        ),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Code invalide ou partie expirée.');
  });

  it('rejects a malformed code at parse-time without calling findByCode', async () => {
    const { lobbyClient } = renderJoin('/v2/join/!!');
    expect(await screen.findByRole('alert')).toHaveTextContent('Code invalide ou partie expirée.');
    expect(lobbyClient.findByCode).not.toHaveBeenCalled();
  });
});
