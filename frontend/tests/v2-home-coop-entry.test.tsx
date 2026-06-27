import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleRepository } from '@/application';
import type { LobbyClient } from '@/application/game';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { Lobby, LobbyId, Pseudonym, SessionId } from '@/domain/game';
import { HomeScreen } from '@/ui/home/HomeScreen';

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

const puzzleRepository: PuzzleRepository = {
  fetchById: () => Promise.resolve(null as never),
  fetchDaily: () => Promise.resolve(null),
  listDailySummaries: () => Promise.resolve({ items: [], hasMore: false }),
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

function renderHome(opts: { multiplayer: boolean; lobbyClient?: Partial<LobbyClient> } = { multiplayer: false }) {
  const lobbyClient: LobbyClient = {
    createLobby: vi.fn().mockResolvedValue(lobby),
    getLobby: vi.fn().mockResolvedValue(lobby),
    findByCode: vi.fn().mockResolvedValue(lobby),
    listMyLobbies: vi.fn().mockResolvedValue([]),
    rebindLobbySessions: vi.fn().mockResolvedValue(undefined),
    unbindLobbySessions: vi.fn().mockResolvedValue(undefined),
    ...opts.lobbyClient,
  };
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <HomeScreen
        puzzleRepository={puzzleRepository}
        soloEntriesStore={emptyStore}
        lobbyClient={opts.multiplayer ? lobbyClient : undefined}
        getSession={opts.multiplayer ? () => ({ sessionId, pseudonym }) : undefined}
      />
    ),
  });
  // Navigation target for the co-op button; a stub component avoids mounting the real WS lobby.
  const lobbyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/v2/lobby/$lobbyId',
    component: () => <div>salon stub</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, lobbyRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return { lobbyClient, router, ...render(<RouterProvider router={router} />) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('v2 home co-op entry', () => {
  it('hides the co-op button when the multiplayer flag is off', async () => {
    renderHome({ multiplayer: false });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: /Jouer à plusieurs/ })).toBeNull();
  });

  it('shows the co-op button when the flag is on', async () => {
    renderHome({ multiplayer: true });
    expect(await screen.findByRole('button', { name: /Jouer à plusieurs/ })).toBeInTheDocument();
  });

  it('creates a lobby and navigates to it on click', async () => {
    const { lobbyClient, router } = renderHome({ multiplayer: true });
    const btn = await screen.findByRole('button', { name: /Jouer à plusieurs/ });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(lobbyClient.createLobby).toHaveBeenCalledWith({
        ownerSessionId: sessionId,
        ownerPseudonym: pseudonym,
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/v2/lobby/${lobbyId}`);
    });
  });
});
