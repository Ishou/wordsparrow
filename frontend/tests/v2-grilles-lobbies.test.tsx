import { render, screen, waitFor } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { DailySummary, PuzzleRepository } from '@/application';
import type { AuthClient } from '@/application/auth';
import type { LobbyClient, LobbySummary } from '@/application/game';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import type { LobbyId, SessionId } from '@/domain/game';
import { AuthProvider } from '@/ui/components/auth';
import { GrillesArchiveScreen } from '@/ui/v2/GrillesArchiveScreen';
import { expectAxeClean } from '@/test/a11y';

const TODAY = new Date().toISOString().slice(0, 10);

const SUMMARIES: ReadonlyArray<DailySummary> = [
  { id: 'today', date: TODAY, gridNumber: 176, difficulty: 'medium', totalLetterCells: 14 },
];

const soloStore = {
  load: () => [],
  save: () => {},
  loadLockedCells: () => [],
  lockCell: () => {},
} as unknown as SoloEntriesStore;

const repo = {
  fetchById: () => Promise.reject(new Error('unused')),
  fetchDaily: () => Promise.resolve(null),
  listDailySummaries: () => Promise.resolve({ items: SUMMARIES, hasMore: false }),
} as unknown as PuzzleRepository;

const IN_PROGRESS: LobbySummary = {
  id: 'AAAA1111BBBB2222CCCC3333' as LobbyId,
  code: 'A2B3C4',
  state: 'IN_PROGRESS',
  gridConfig: { width: 7, height: 7 },
  playerCount: 3,
  connectedCount: 2,
  lastActivityAt: '2026-06-28T12:00:00Z',
  progress: { solvedCells: 12, totalCells: 50 },
};

const COMPLETED: LobbySummary = {
  id: 'DDDD4444EEEE5555FFFF6666' as LobbyId,
  code: 'X9Y8Z7',
  state: 'COMPLETED',
  title: 'Grille du soir',
  gridConfig: { width: 9, height: 9 },
  playerCount: 1,
  connectedCount: 0,
  lastActivityAt: '2026-06-20T12:00:00Z',
  progress: { solvedCells: 60, totalCells: 60 },
};

function makeLobbyClient(result: Promise<readonly LobbySummary[]>): LobbyClient {
  return { listMyLobbies: () => result } as unknown as LobbyClient;
}

const getSession = () => ({ sessionId: 'session-1' as SessionId });

// The screen always mounts inside an AuthProvider in prod (MenuSheet reads it); anon guest case.
const authClient = {
  whoami: vi.fn().mockResolvedValue(null),
  signInUrl: () => 'https://auth.test/google',
} as unknown as AuthClient;

function renderScreen(props: { lobbyClient?: LobbyClient; withSession?: boolean } = {}) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <AuthProvider authClient={authClient} getPseudonym={() => 'Renard 423'}>
        <GrillesArchiveScreen
          puzzleRepository={repo}
          soloEntriesStore={soloStore}
          lobbyClient={props.lobbyClient}
          getSession={props.withSession === false ? undefined : getSession}
        />
      </AuthProvider>
    ),
  });
  const lobby = createRoute({
    getParentRoute: () => root,
    path: '/lobby/$lobbyId',
    component: () => <div>lobby</div>,
  });
  const play = createRoute({ getParentRoute: () => root, path: '/play', component: () => <div>play</div> });
  const router = createRouter({
    routeTree: root.addChildren([index, lobby, play]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router as never} />);
}

describe('v2 grilles — parties à plusieurs', () => {
  it('lists the player lobbies with state, players and deep link', async () => {
    renderScreen({ lobbyClient: makeLobbyClient(Promise.resolve([IN_PROGRESS, COMPLETED])) });

    expect(await screen.findByRole('heading', { name: 'Parties à plusieurs' })).toBeInTheDocument();
    expect(screen.getByText('Partie du 28 juin')).toBeInTheDocument();
    expect(screen.getByText('Grille du soir')).toBeInTheDocument();
    expect(screen.getByText(/3 joueurs · En cours · 12 \/ 50 cases/)).toBeInTheDocument();
    expect(screen.getByText(/1 joueur · Terminée/)).toBeInTheDocument();

    const resume = screen.getByRole('link', { name: 'Reprendre — Partie du 28 juin' });
    expect(resume.getAttribute('href')).toBe(`/lobby/${IN_PROGRESS.id}`);
    expect(screen.getByRole('link', { name: 'Revoir — Grille du soir' })).toBeInTheDocument();
  });

  it('shows a progress bar only for in-progress lobbies', async () => {
    renderScreen({ lobbyClient: makeLobbyClient(Promise.resolve([IN_PROGRESS, COMPLETED])) });
    const section = (await screen.findByRole('heading', { name: 'Parties à plusieurs' })).closest('section')!;
    expect(section.querySelectorAll('[data-testid="lobby-progress"]')).toHaveLength(1);
  });

  it('renders no section when the player has no lobbies', async () => {
    renderScreen({ lobbyClient: makeLobbyClient(Promise.resolve([])) });
    await screen.findByText(/n°176/);
    expect(screen.queryByRole('heading', { name: 'Parties à plusieurs' })).not.toBeInTheDocument();
  });

  it('renders no section when the multiplayer adapters are absent', async () => {
    renderScreen({ withSession: false });
    await screen.findByText(/n°176/);
    expect(screen.queryByRole('heading', { name: 'Parties à plusieurs' })).not.toBeInTheDocument();
  });

  it('keeps the archive when the lobby fetch fails', async () => {
    renderScreen({ lobbyClient: makeLobbyClient(Promise.reject(new Error('boom'))) });
    expect(await screen.findByText(/n°176/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Parties à plusieurs' })).not.toBeInTheDocument();
    });
  });

  it('has no critical/serious axe violations with lobbies present', async () => {
    const { container } = renderScreen({
      lobbyClient: makeLobbyClient(Promise.resolve([IN_PROGRESS, COMPLETED])),
    });
    await screen.findByRole('heading', { name: 'Parties à plusieurs' });
    await expectAxeClean(container);
  });
});
