import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { DailySummary, PuzzleRepository } from '@/application';
import type { SoloEntriesStore, SoloEntry } from '@/application/solo/SoloEntriesStore';
import { AuthProvider } from '@/ui/components/auth';
import { GrillesArchiveScreen } from '@/ui/v2/GrillesArchiveScreen';
import { HomeScreen } from '@/ui/home/HomeScreen';

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

const SUBSCRIBER: WhoAmIResult = { userId: USER_ID, displayName: 'Lapin 472', role: 'player', capabilities: ['grilles:all'] };
const FREE: WhoAmIResult = { userId: USER_ID, displayName: 'Lapin 472', role: 'player', capabilities: [] };

function authClientFor(whoami: WhoAmIResult): AuthClient {
  return {
    whoami: async () => whoami,
    getMe: async () => { throw new Error('unused'); },
    updateMe: async () => {},
    deleteMe: async () => {},
    logout: async () => {},
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return_to=${returnTo}`,
  };
}

// Fixed UTC day offsets so the 7-day lock window is deterministic regardless of run date.
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const RECENT = isoDaysAgo(3); // within the free window → never locked
const OLD = isoDaysAgo(20); // outside the free window → locked when unstarted

// n°201 = old + unstarted (the only lockable grid); n°200 recent, n°202 old-but-started.
const SUMMARIES: ReadonlyArray<DailySummary> = [
  { id: 'recent-unstarted', date: RECENT, gridNumber: 200, difficulty: 'medium', totalLetterCells: 20 },
  { id: 'old-unstarted', date: OLD, gridNumber: 201, difficulty: 'medium', totalLetterCells: 20 },
  { id: 'old-started', date: OLD, gridNumber: 202, difficulty: 'medium', totalLetterCells: 20 },
];

const ENTRIES: Record<string, ReadonlyArray<SoloEntry>> = {
  'old-started': [{ row: 0, column: 0, letter: 'A' }],
};

const store: SoloEntriesStore = {
  load: (id: string) => ENTRIES[id] ?? [],
  save: () => {},
  loadLockedCells: () => [],
  lockCell: () => {},
  loadHintsUsed: () => 0,
  recordHintUsed: () => {},
  loadElapsed: () => 0,
  saveElapsed: () => {},
  clearForPuzzle: () => {},
} as unknown as SoloEntriesStore;

const repo: PuzzleRepository = {
  fetchById: () => Promise.reject(new Error('unused')),
  fetchDaily: () => Promise.resolve(null),
  listDailySummaries: () => Promise.resolve({ items: SUMMARIES, hasMore: false }),
};

function renderArchive(whoami: WhoAmIResult) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => <GrillesArchiveScreen puzzleRepository={repo} soloEntriesStore={store} /> });
  const play = createRoute({ getParentRoute: () => root, path: '/play', component: () => <div>play</div> });
  const abonnement = createRoute({ getParentRoute: () => root, path: '/abonnement', component: () => <div>offre</div> });
  const router = createRouter({ routeTree: root.addChildren([index, play, abonnement]), history: createMemoryHistory({ initialEntries: ['/'] }) });
  return {
    router,
    ...render(
      <AuthProvider authClient={authClientFor(whoami)} getPseudonym={() => 'Renard 423'}>
        <RouterProvider router={router as never} />
      </AuthProvider>,
    ),
  };
}

function renderHome(whoami: WhoAmIResult) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => <HomeScreen puzzleRepository={repo} soloEntriesStore={store} /> });
  const play = createRoute({ getParentRoute: () => root, path: '/play', component: () => <div>play</div> });
  const abonnement = createRoute({ getParentRoute: () => root, path: '/abonnement', component: () => <div>offre</div> });
  const router = createRouter({ routeTree: root.addChildren([index, play, abonnement]), history: createMemoryHistory({ initialEntries: ['/'] }) });
  return render(
    <AuthProvider authClient={authClientFor(whoami)} getPseudonym={() => 'Renard 423'}>
      <RouterProvider router={router as never} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

describe('archive paywall markers (ADR-0080 W5a)', () => {
  it('shows no lock, no banner for a subscriber', async () => {
    renderArchive(SUBSCRIBER);

    // Wait for the subscriber state to settle: the old-unstarted grid is a normal link, not a lock.
    await screen.findByRole('link', { name: /Commencer — .*n°201/i }).catch(() => screen.findByText(/n°201/));
    await waitFor(() => expect(screen.queryByRole('button', { name: /réservée à l'abonnement/i })).toBeNull());
    expect(screen.queryByText('Débloque toutes les grilles')).toBeNull();
  });

  it('locks only the old, unstarted grid for a free player', async () => {
    renderArchive(FREE);

    const locked = await screen.findByRole('button', { name: /réservée à l'abonnement/i });
    // The lock lands on n°201 (old + unstarted), not the recent or the already-started grid.
    expect(within(locked).getByText(/n°201/)).toBeTruthy();
    expect(screen.getByText("Réservée à l'abonnement")).toBeTruthy();

    // Exactly one lock; the recent grid and the old-but-started grid stay playable.
    expect(screen.getAllByRole('button', { name: /réservée à l'abonnement/i })).toHaveLength(1);
    const playable = screen.getAllByRole('link', { name: /Commencer/i });
    expect(playable).toHaveLength(2);
  });

  it('shows the upsell banner only for a free player', async () => {
    const { unmount } = renderArchive(FREE);
    expect(await screen.findByText('Débloque toutes les grilles')).toBeTruthy();
    unmount();

    renderArchive(SUBSCRIBER);
    await screen.findByText(/n°200/);
    await waitFor(() => expect(screen.queryByText('Débloque toutes les grilles')).toBeNull());
  });

  it('opens the gating sheet instead of navigating when a locked grid is tapped', async () => {
    const { router } = renderArchive(FREE);

    const locked = await screen.findByRole('button', { name: /réservée à l'abonnement/i });
    fireEvent.click(locked);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Une grille réservée aux abonnés')).toBeTruthy();
    // Cosmetic gate: it must not navigate into the grid.
    expect(router.state.location.pathname).toBe('/');
  });

  it('links the sheet CTA to the offer page', async () => {
    renderArchive(FREE);
    fireEvent.click(await screen.findByRole('button', { name: /réservée à l'abonnement/i }));

    const dialog = await screen.findByRole('dialog');
    const cta = within(dialog).getByRole('link', { name: /Voir l'abonnement/i });
    expect(cta.getAttribute('href')).toContain('/abonnement');
  });
});

describe('home upsell teaser (ADR-0080 W5a)', () => {
  it('renders the teaser for a free player', async () => {
    renderHome(FREE);
    expect(await screen.findByText('Débloque toutes les grilles')).toBeTruthy();
    expect(screen.getByText('Abonne-toi et joue sans limite')).toBeTruthy();
  });

  it('hides the teaser for a subscriber', async () => {
    renderHome(SUBSCRIBER);
    await screen.findByRole('button', { name: /Bientôt disponible|Jouer|Chargement/i });
    await waitFor(() => expect(screen.queryByText('Débloque toutes les grilles')).toBeNull());
  });
});
