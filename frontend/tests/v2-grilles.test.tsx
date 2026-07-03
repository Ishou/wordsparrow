import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { DailySummariesPage, DailySummary, PuzzleRepository } from '@/application';
import type { AuthClient } from '@/application/auth';
import type { LobbyClient, LobbySummary } from '@/application/game';
import type { SoloEntriesStore, SoloLockedCell } from '@/application/solo/SoloEntriesStore';
import type { LobbyId, SessionId, Pseudonym } from '@/domain/game';
import { AuthProvider } from '@/ui/components/auth';
import { Route as RootRoute } from '@/ui/routes/__root';
import { Route as AppLayoutRoute } from '@/ui/routes/app-layout';
import { Route as GrillesRoute } from '@/ui/routes/grilles';
import { longDateFr, monthLabelFr, monthOf } from '@/ui/v2/dailyCalendarModel';
import { expectAxeClean } from '@/test/a11y';

const TODAY = new Date().toISOString().slice(0, 10);

function daysAgo(n: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function summary(date: string, id: string, totalLetterCells = 14): DailySummary {
  return { id, date, gridNumber: 100, difficulty: null, totalLetterCells };
}

// today = 8/14 locked (en cours); done = 10/10 (terminée); fresh = 0 (à jouer); old = 0 + >7j (paywall candidate).
const SUMMARIES: ReadonlyArray<DailySummary> = [
  summary(TODAY, 'today'),
  summary(daysAgo(1), 'done', 10),
  summary(daysAgo(2), 'fresh'),
  summary(daysAgo(10), 'old'),
];

const LOCKED: Record<string, number> = { today: 8, done: 10, fresh: 0, old: 0 };

function lockedCells(n: number): ReadonlyArray<SoloLockedCell> {
  return Array.from({ length: n }, (_, i) => ({ row: 0, column: i }));
}

const soloStore = {
  load: () => [],
  save: () => {},
  loadLockedCells: (id: string) => lockedCells(LOCKED[id] ?? 0),
  lockCell: () => {},
  loadHintsUsed: () => 0,
  recordHintUsed: () => {},
  loadElapsed: () => 0,
  saveElapsed: () => {},
  clearForPuzzle: () => {},
} as unknown as SoloEntriesStore;

function repoOf(...pages: Array<DailySummariesPage | Promise<DailySummariesPage>>): PuzzleRepository {
  let call = 0;
  return {
    fetchById: () => Promise.reject(new Error('unused')),
    fetchDaily: () => Promise.resolve(null),
    listDailySummaries: () => Promise.resolve(pages[Math.min(call++, pages.length - 1)]),
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const LOBBY: LobbySummary = {
  id: 'AAAA1111BBBB2222CCCC3333' as LobbyId,
  code: 'A2B3C4',
  state: 'IN_PROGRESS',
  gridConfig: { width: 7, height: 7 },
  playerCount: 3,
  connectedCount: 2,
  lastActivityAt: '2026-06-28T12:00:00Z',
  progress: { solvedCells: 12, totalCells: 50 },
};

function authClientOf(capabilities: readonly string[] | null): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(
      capabilities == null ? null : { userId: 'u-1', displayName: 'Lapin 472', capabilities },
    ),
    signInUrl: () => 'https://auth.test/google',
  } as unknown as AuthClient;
}

interface HarnessOptions {
  readonly repo?: PuzzleRepository;
  readonly capabilities?: readonly string[] | null;
  readonly lobbyClient?: LobbyClient;
  readonly withMultiplayer?: boolean;
  readonly initialEntry?: string;
}

function renderGrilles(opts: HarnessOptions = {}) {
  const repo = opts.repo ?? repoOf({ items: SUMMARIES, hasMore: false });
  const authClient = authClientOf(opts.capabilities ?? null);
  const getSession = () => ({ sessionId: 'session-1' as SessionId, pseudonym: 'Renard 423' as Pseudonym });
  const withMultiplayer = opts.withMultiplayer ?? true;
  const lobbyClient =
    opts.lobbyClient ?? ({ listMyLobbies: () => Promise.resolve([]) } as unknown as LobbyClient);
  const play = createRoute({ getParentRoute: () => AppLayoutRoute, path: 'play', component: () => <div>play</div> });
  const lobby = createRoute({
    getParentRoute: () => AppLayoutRoute,
    path: 'lobby/$lobbyId',
    component: () => <div>lobby</div>,
  });
  const routeTree = RootRoute.addChildren([AppLayoutRoute.addChildren([GrillesRoute, play, lobby])]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [opts.initialEntry ?? '/grilles'] }),
    context: {
      authClient,
      getPseudonym: () => 'Renard 423',
      puzzleRepository: repo,
      puzzleSolver: { validate: vi.fn(), requestHint: vi.fn() },
      sessionClient: {
        eraseSession: () => Promise.resolve({ deleted: 0 }),
        getSessionId: () => 'session-1',
        clearLocalSession: () => {},
      },
      soloEntriesStore: soloStore,
      tourSeenStore: { get: () => true, set: () => {}, clear: () => {} },
      ...(withMultiplayer ? { lobbyClient, getSession } : {}),
    },
  });
  return {
    router,
    lobbyClient,
    ...render(
      <AuthProvider authClient={authClient} getPseudonym={() => 'Renard 423'}>
        <RouterProvider router={router as never} />
      </AuthProvider>,
    ),
  };
}

async function findTodayCell() {
  // today's fixture has 8/14 locked cells: Reprendre with a 57 % progress ring.
  return screen.findByRole('link', { name: `Reprendre — ${longDateFr(TODAY)} — 57 %` });
}

// Click ◀ until the viewed month is the one containing `date` (cells outside the viewed month don't render).
async function gotoMonthOf(date: string) {
  const target = monthLabelFr(monthOf(date));
  for (let i = 0; i < 4 && screen.queryByRole('heading', { name: target }) == null; i++) {
    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }));
  }
  expect(screen.getByRole('heading', { name: target })).toBeTruthy();
}

describe('v2 grilles — quotidiennes calendar', () => {
  it('skeletons while summaries are in flight, then shows the calendar', async () => {
    const d = deferred<DailySummariesPage>();
    renderGrilles({ repo: repoOf(d.promise) });
    expect(await screen.findByLabelText('Chargement des grilles')).toBeTruthy();
    d.resolve({ items: SUMMARIES, hasMore: false });
    expect(await findTodayCell()).toBeTruthy();
    expect(screen.queryByLabelText('Chargement des grilles')).toBeNull();
  });

  it('labels day cells by status: terminée / en cours / à jouer', async () => {
    renderGrilles();
    await findTodayCell();
    await gotoMonthOf(daysAgo(1));
    expect(screen.getByRole('link', { name: `Revoir — ${longDateFr(daysAgo(1))}` })).toBeTruthy();
    await gotoMonthOf(daysAgo(2));
    expect(screen.getByRole('link', { name: `Commencer — ${longDateFr(daysAgo(2))}` })).toBeTruthy();
  });

  it('navigates a past day to /play with its date, today without a param', async () => {
    const { router } = renderGrilles();
    await findTodayCell();
    await gotoMonthOf(daysAgo(2));
    fireEvent.click(screen.getByRole('link', { name: `Commencer — ${longDateFr(daysAgo(2))}` }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/play'));
    expect(router.state.location.search).toEqual({ date: daysAgo(2) });
  });

  it('opens the abonnement sheet on a paywalled day for a subscribable player', async () => {
    const { router } = renderGrilles({ capabilities: ['billing:subscribe'] });
    await findTodayCell();
    const lockedName = `Grille réservée à l'abonnement — ${longDateFr(daysAgo(10))}`;
    // the capability arrives async from whoami; the cell re-renders locked once it lands
    await waitFor(() => {
      if (screen.queryByRole('button', { name: lockedName }) == null) {
        const target = monthLabelFr(monthOf(daysAgo(10)));
        if (screen.queryByRole('heading', { name: target }) == null) {
          fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }));
        }
        expect(screen.getByRole('button', { name: lockedName })).toBeTruthy();
      }
    });
    fireEvent.click(screen.getByRole('button', { name: lockedName }));
    expect(await screen.findByText('Une grille réservée aux abonnés')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/grilles');
  });

  it('shows old days as playable (not paywalled) without the subscribe capability', async () => {
    renderGrilles({ capabilities: null });
    await findTodayCell();
    await gotoMonthOf(daysAgo(10));
    expect(screen.getByRole('link', { name: `Commencer — ${longDateFr(daysAgo(10))}` })).toBeTruthy();
  });

  it('pages the whole archive and clamps month navigation to it', async () => {
    const oldest = daysAgo(40);
    const repo = repoOf(
      { items: [...SUMMARIES], hasMore: true },
      { items: [summary(oldest, 'oldest')], hasMore: false },
    );
    renderGrilles({ repo });
    await findTodayCell();
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeDisabled();
    await gotoMonthOf(oldest);
    expect(screen.getByRole('button', { name: 'Mois précédent' })).toBeDisabled();
    expect(screen.getByRole('link', { name: `Commencer — ${longDateFr(oldest)}` })).toBeTruthy();
  });
});

describe('v2 grilles — onglets', () => {
  it('deep-links ?onglet=a-finir to the in-progress list and tabs back to the calendar', async () => {
    const { router } = renderGrilles({ initialEntry: '/grilles?onglet=a-finir' });
    expect(await screen.findByText('En cours · 8 / 14 cases')).toBeTruthy();
    expect(screen.getByRole('link', { name: `Reprendre — ${longDateFr(TODAY)}` })).toBeTruthy();
    expect(screen.queryByText(`Revoir — ${longDateFr(daysAgo(1))}`)).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Quotidiennes' }));
    await findTodayCell();
    expect(router.state.location.search).toEqual({});
  });

  it('updates the URL when switching to À finir', async () => {
    const { router } = renderGrilles();
    await findTodayCell();
    fireEvent.click(screen.getByRole('tab', { name: 'À finir' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ onglet: 'a-finir' }));
  });

  it('shows the progress empty state when nothing is in progress', async () => {
    const repo = repoOf({ items: [summary(daysAgo(2), 'fresh')], hasMore: false });
    renderGrilles({ repo, initialEntry: '/grilles?onglet=a-finir' });
    expect(await screen.findByText('Aucune grille en cours')).toBeTruthy();
  });

  it('omits the À plusieurs tab when the multiplayer adapters are absent', async () => {
    renderGrilles({ withMultiplayer: false });
    await findTodayCell();
    expect(screen.queryByRole('tab', { name: 'À plusieurs' })).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });
});

describe('v2 grilles — à plusieurs', () => {
  it('lists lobbies under the tab', async () => {
    const lobbyClient = { listMyLobbies: () => Promise.resolve([LOBBY]) } as unknown as LobbyClient;
    renderGrilles({ lobbyClient, initialEntry: '/grilles?onglet=plusieurs' });
    expect(await screen.findByRole('link', { name: 'Reprendre — Partie du 28 juin' })).toBeTruthy();
  });

  it('creates a lobby from the empty state and navigates to it', async () => {
    const createLobby = vi.fn().mockResolvedValue({ id: 'AAAA1111BBBB2222CCCC3333' });
    const lobbyClient = {
      listMyLobbies: () => Promise.resolve([]),
      createLobby,
    } as unknown as LobbyClient;
    const { router } = renderGrilles({ lobbyClient, initialEntry: '/grilles?onglet=plusieurs' });
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une partie' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/lobby/AAAA1111BBBB2222CCCC3333'));
    expect(createLobby).toHaveBeenCalledWith({ ownerSessionId: 'session-1', ownerPseudonym: 'Renard 423' });
  });

  it('offers the join-by-code path from the empty state', async () => {
    renderGrilles({ initialEntry: '/grilles?onglet=plusieurs' });
    expect(await screen.findByRole('link', { name: 'Rejoindre avec un code' })).toBeTruthy();
  });
});

describe('v2 grilles — a11y', () => {
  it('is axe-clean once loaded (ADR-0050)', async () => {
    const { container } = renderGrilles();
    await findTodayCell();
    await expectAxeClean(container);
  });
});
