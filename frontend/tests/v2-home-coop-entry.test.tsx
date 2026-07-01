import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleRepository } from '@/application';
import { LobbyClientError, type LobbyClient } from '@/application/game';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { Lobby, LobbyId, Pseudonym, SessionId } from '@/domain/game';
import { AuthProvider } from '@/ui/components/auth';
import { HomeScreen } from '@/ui/home/HomeScreen';
import { expectAxeClean } from '@/test/a11y';

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

const AUTHED_USER: WhoAmIResult = {
  userId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
  displayName: 'Renard 423',
  role: 'player',
  capabilities: [],
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
  loadElapsed: () => 0,
  saveElapsed: () => {},
  clearForPuzzle: () => {},
};

function stubAuthClient(whoami: WhoAmIResult | null): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(whoami),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    signInUrl: (provider, returnTo) =>
      `https://auth.test/${provider}?return=${encodeURIComponent(returnTo)}`,
  };
}

function renderHome(
  opts: { multiplayer: boolean; lobbyClient?: Partial<LobbyClient>; whoami?: WhoAmIResult | null } = {
    multiplayer: false,
  },
) {
  const lobbyClient: LobbyClient = {
    createLobby: vi.fn().mockResolvedValue(lobby),
    getLobby: vi.fn().mockResolvedValue(lobby),
    findByCode: vi.fn().mockResolvedValue(lobby),
    listMyLobbies: vi.fn().mockResolvedValue([]),
    rebindLobbySessions: vi.fn().mockResolvedValue(undefined),
    unbindLobbySessions: vi.fn().mockResolvedValue(undefined),
    ...opts.lobbyClient,
  };
  // Home always mounts inside an AuthProvider in prod (MenuSheet + the host gate read it); a null whoami is the guest/anon case.
  const authClient = stubAuthClient(opts.whoami ?? null);
  const withAuth = (node: ReactNode) => (
    <AuthProvider authClient={authClient} getPseudonym={() => 'Renard 423'}>
      {node}
    </AuthProvider>
  );
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () =>
      withAuth(
        <HomeScreen
          puzzleRepository={puzzleRepository}
          soloEntriesStore={emptyStore}
          lobbyClient={opts.multiplayer ? lobbyClient : undefined}
          getSession={opts.multiplayer ? () => ({ sessionId, pseudonym }) : undefined}
        />,
      ),
  });
  // Navigation target for the co-op button; a stub component avoids mounting the real WS lobby.
  const lobbyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/lobby/$lobbyId',
    component: () => <div>salon stub</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, lobbyRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { authClient },
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

  it('co-op button is axe-clean (ADR-0050)', async () => {
    const { container } = renderHome({ multiplayer: true });
    await screen.findByRole('button', { name: /Jouer à plusieurs/ });
    await expectAxeClean(container);
  });

  it('prompts a guest to sign in and does not create a lobby', async () => {
    const { lobbyClient } = renderHome({ multiplayer: true });
    const btn = await screen.findByRole('button', { name: /Jouer à plusieurs/ });
    fireEvent.click(btn);
    expect(await screen.findByText(/Connecte-toi pour créer une partie/)).toBeInTheDocument();
    expect(lobbyClient.createLobby).not.toHaveBeenCalled();
  });

  it('creates a lobby and navigates to it when the caller is signed in', async () => {
    const { lobbyClient, router } = renderHome({ multiplayer: true, whoami: AUTHED_USER });
    const btn = await screen.findByRole('button', { name: /Jouer à plusieurs/ });
    // waitFor re-clicks until auth resolves to authed; earlier clicks are no-ops (sheet), the authed one creates.
    await waitFor(() => {
      fireEvent.click(btn);
      expect(lobbyClient.createLobby).toHaveBeenCalledWith({
        ownerSessionId: sessionId,
        ownerPseudonym: pseudonym,
      });
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/lobby/${lobbyId}`);
    });
  });

  it('surfaces the sign-in prompt when createLobby rejects with 401 (expired session)', async () => {
    const { lobbyClient } = renderHome({
      multiplayer: true,
      whoami: AUTHED_USER,
      lobbyClient: {
        createLobby: vi.fn().mockRejectedValue(
          new LobbyClientError({ kind: 'unauthorized', status: 401, problem: null, message: '401' }),
        ),
      },
    });
    const btn = await screen.findByRole('button', { name: /Jouer à plusieurs/ });
    await waitFor(() => {
      fireEvent.click(btn);
      expect(lobbyClient.createLobby).toHaveBeenCalled();
    });
    expect(await screen.findByText(/Connecte-toi pour créer une partie/)).toBeInTheDocument();
  });
});
