import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { GameClient, LobbyClient } from '@/application/game';
import type { Lobby, LobbyId, Player, Pseudonym, SessionId } from '@/domain/game';
import { useCreateOrResume } from '@/ui/components/lobby/useCreateOrResume';
import { OwnedGameModal } from '@/ui/v2/multiplayer/OwnedGameModal';
import { expectAxeClean } from '@/test/a11y';

const sessionId = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b' as SessionId;
const pseudonym = 'Joueur 1234' as Pseudonym;
const ownedId = '7gQ2xK9p' as LobbyId;
const freshId = '8hR3yL0q' as LobbyId;

const self: Player = { sessionId, pseudonym, joinedAt: '2026-06-27T15:30:00Z' };
const peer: Player = {
  sessionId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6c' as SessionId,
  pseudonym: 'Amie' as Pseudonym,
  joinedAt: '2026-06-27T15:30:01Z',
};

const ownedGame = (players: readonly Player[]): Lobby & { readonly id: LobbyId } => ({
  id: ownedId,
  ownerSessionId: sessionId,
  players: [...players],
  state: 'IN_PROGRESS',
  gridConfig: { width: 7, height: 7 },
  game: null,
  code: 'A2B3C4',
});

const freshLobby: Lobby & { readonly id: LobbyId } = {
  id: freshId,
  ownerSessionId: sessionId,
  players: [self],
  state: 'WAITING',
  gridConfig: { width: 7, height: 7 },
  game: null,
  code: 'Z9Y8X7',
};

function makeGameClient(): { client: GameClient; calls: string[] } {
  const calls: string[] = [];
  const client: GameClient = {
    connect: (args) => { calls.push(`connect:${args.lobbyId}`); return Promise.resolve(); },
    joinLobby: () => {},
    renameSelf: () => {},
    setGridConfig: () => {},
    startGame: () => {},
    cellUpdate: () => {},
    cellFocus: () => {},
    leaveLobby: () => { calls.push('leaveLobby'); },
    rotateCode: () => {},
    disconnect: () => { calls.push('disconnect'); },
    subscribe: () => () => {},
    subscribeConnectionState: (h) => { h('connected'); return () => {}; },
  };
  return { client, calls };
}

// Minimal host: exposes the hook's create trigger and renders the modal
// exactly as the real create sites do — no auth gate, so create runs once
// per click and the once-mocks aren't drained by the whoami re-click dance.
function Harness({ lobbyClient, gameClient }: { lobbyClient: LobbyClient; gameClient?: GameClient }) {
  const coop = useCreateOrResume({
    lobbyClient,
    getSession: () => ({ sessionId, pseudonym }),
    gameClient,
  });
  return (
    <>
      <button type="button" onClick={coop.createOrResume}>créer</button>
      <OwnedGameModal
        lobby={coop.ownedGame}
        canStartNew={coop.canStartNew}
        onRejoindre={coop.rejoindre}
        onStartNew={coop.startNewGame}
        onClose={coop.dismiss}
        startingNew={coop.startingNew}
      />
    </>
  );
}

function renderHarness(opts: { createLobby: LobbyClient['createLobby']; withGameClient?: boolean }) {
  const lobbyClient: LobbyClient = {
    createLobby: opts.createLobby,
    getLobby: vi.fn().mockResolvedValue(freshLobby),
    claimOwnership: vi.fn().mockResolvedValue(freshLobby),
    findByCode: vi.fn().mockResolvedValue(freshLobby),
    listMyLobbies: vi.fn().mockResolvedValue([]),
    listMyLobbiesForUser: vi.fn().mockResolvedValue([]),
    rebindLobbySessions: vi.fn().mockResolvedValue(undefined),
    unbindLobbySessions: vi.fn().mockResolvedValue(undefined),
  };
  const game = makeGameClient();
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <Harness lobbyClient={lobbyClient} gameClient={opts.withGameClient === false ? undefined : game.client} />
    ),
  });
  const lobbyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/lobby/$lobbyId',
    component: () => <div>salon stub</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, lobbyRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return { lobbyClient, game, router, ...render(<RouterProvider router={router} />) };
}

const create = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'créer' }));
};

describe('OwnedGameModal / useCreateOrResume (ADR-0098 §6)', () => {
  it('shows the informational modal instead of navigating when create resolves to an owned IN_PROGRESS game', async () => {
    const { router } = renderHarness({ createLobby: vi.fn().mockResolvedValue(ownedGame([self])) });
    await create();
    expect(await screen.findByRole('button', { name: 'Rejoindre ma partie' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/');
  });

  it('navigates straight into a fresh WAITING lobby without a modal', async () => {
    const { router } = renderHarness({ createLobby: vi.fn().mockResolvedValue(freshLobby) });
    await create();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/lobby/${freshId}`));
    expect(screen.queryByText(/Vous avez déjà une partie en cours/)).toBeNull();
  });

  it('offers "Rejoindre ma partie" which navigates into the owned game', async () => {
    const { router } = renderHarness({ createLobby: vi.fn().mockResolvedValue(ownedGame([self])) });
    await create();
    fireEvent.click(await screen.findByRole('button', { name: 'Rejoindre ma partie' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/lobby/${ownedId}`));
  });

  it('offers the sole-occupant fresh-start only when alone', async () => {
    const alone = renderHarness({ createLobby: vi.fn().mockResolvedValue(ownedGame([self])) });
    await create();
    expect(await screen.findByRole('button', { name: /Démarrer une nouvelle partie/ })).toBeTruthy();
    alone.unmount();

    renderHarness({ createLobby: vi.fn().mockResolvedValue(ownedGame([self, peer])) });
    await create();
    await screen.findByRole('button', { name: 'Rejoindre ma partie' });
    expect(screen.queryByRole('button', { name: /Démarrer une nouvelle partie/ })).toBeNull();
  });

  it('hides the fresh-start button when no game client is reachable', async () => {
    renderHarness({ createLobby: vi.fn().mockResolvedValue(ownedGame([self])), withGameClient: false });
    await create();
    await screen.findByRole('button', { name: 'Rejoindre ma partie' });
    expect(screen.queryByRole('button', { name: /Démarrer une nouvelle partie/ })).toBeNull();
  });

  it('relinquishes via the WS leaveLobby frame, then creates and navigates to a new game', async () => {
    const createLobby = vi
      .fn()
      .mockResolvedValueOnce(ownedGame([self]))
      .mockResolvedValueOnce(freshLobby);
    const { game, router } = renderHarness({ createLobby });
    await create();
    fireEvent.click(await screen.findByRole('button', { name: /Démarrer une nouvelle partie/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/lobby/${freshId}`));
    expect(game.calls).toEqual([`connect:${ownedId}`, 'leaveLobby', 'disconnect']);
    expect(createLobby).toHaveBeenCalledTimes(2);
  });

  it('the owned-game modal is axe-clean (ADR-0050)', async () => {
    const { baseElement } = renderHarness({ createLobby: vi.fn().mockResolvedValue(ownedGame([self])) });
    await create();
    await screen.findByRole('button', { name: 'Rejoindre ma partie' });
    await expectAxeClean(baseElement);
  });
});
