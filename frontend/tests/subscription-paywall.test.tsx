import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { DailySummary, PuzzleRepository } from '@/application';
import type { SoloEntriesStore, SoloEntry } from '@/application/solo/SoloEntriesStore';
import { AuthProvider } from '@/ui/components/auth';
import { GrillesArchiveScreen } from '@/ui/v2/GrillesArchiveScreen';
import { longDateFr } from '@/ui/v2/dailyCalendarModel';
import { HomeScreen } from '@/ui/home/HomeScreen';

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

const SUBSCRIBER: WhoAmIResult = { userId: USER_ID, displayName: 'Lapin 472', role: 'player', capabilities: ['grilles:all'] };
// Subscribe-eligible free player: can reach /abonnement, so promo surfaces apply.
const CAN_SUBSCRIBE: WhoAmIResult = { userId: USER_ID, displayName: 'Lapin 472', role: 'player', capabilities: ['billing:subscribe'] };
// Test-phase free player: no billing:subscribe → /abonnement is 404, so no promo surfaces.
const FREE: WhoAmIResult = { userId: USER_ID, displayName: 'Lapin 472', role: 'player', capabilities: [] };

function authClientFor(whoami: WhoAmIResult): AuthClient {
  return {
    whoami: async () => whoami,
    getMe: async () => { throw new Error('unused'); },
    updateMe: async () => {},
    deleteMe: async () => {},
    logout: async () => {},
    logoutAll: async () => {},
    startEmailOtp: async () => 'sent' as const,
    verifyEmailOtp: async () => 'ok' as const,
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return_to=${returnTo}`,
  };
}

// Fixed "now" — the component under test derives its own todayIso from Date.now(),
// so the clock is pinned in beforeEach rather than sampled independently here.
const TODAY = '2026-06-24T00:00:00.000Z';

function isoDaysBefore(n: number): string {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const RECENT = isoDaysBefore(3); // within the free window → never locked
const OLD = isoDaysBefore(20); // outside the free window → locked when unstarted
const OLD_STARTED = isoDaysBefore(21); // outside the free window but started → never locked

// One summary per date (ADR-0081): the calendar keys day cells by date.
const SUMMARIES: ReadonlyArray<DailySummary> = [
  { id: 'recent-unstarted', date: RECENT, gridNumber: 200, difficulty: 'medium', totalLetterCells: 20 },
  { id: 'old-unstarted', date: OLD, gridNumber: 201, difficulty: 'medium', totalLetterCells: 20 },
  { id: 'old-started', date: OLD_STARTED, gridNumber: 202, difficulty: 'medium', totalLetterCells: 20 },
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
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <GrillesArchiveScreen puzzleRepository={repo} soloEntriesStore={store} onglet="quotidiennes" onOngletChange={() => {}} />
    ),
  });
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
  vi.setSystemTime(new Date(TODAY));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('archive paywall markers (ADR-0080 W5a)', () => {
  it('shows no lock, no banner for a subscriber', async () => {
    renderArchive(SUBSCRIBER);

    // Wait for the subscriber state to settle: the old-unstarted day is a normal link, not a lock.
    await screen.findByRole('link', { name: `Commencer — ${longDateFr(OLD)}` });
    await waitFor(() => expect(screen.queryByRole('button', { name: /réservée à l'abonnement/i })).toBeNull());
    expect(screen.queryByText('Débloque toutes les grilles')).toBeNull();
  });

  it('shows no locks, no banner for a free player without billing:subscribe', async () => {
    renderArchive(FREE);

    // Test-phase free player: the calendar looks exactly as it did pre-subscription.
    await screen.findByRole('link', { name: `Commencer — ${longDateFr(OLD)}` });
    expect(screen.queryByRole('button', { name: /réservée à l'abonnement/i })).toBeNull();
    expect(screen.queryByText('Débloque toutes les grilles')).toBeNull();
    // All three days stay playable — none locked (OLD would lock only for a subscribe-eligible player).
    expect(screen.getAllByRole('link', { name: /Commencer/i })).toHaveLength(3);
  });

  it('locks only the old, unstarted day for a subscribe-eligible player', async () => {
    renderArchive(CAN_SUBSCRIBE);

    // The lock lands on OLD (old + unstarted), not the recent or the already-started day.
    const locked = await screen.findByRole('button', { name: `Grille réservée à l'abonnement — ${longDateFr(OLD)}` });
    expect(locked).toBeTruthy();

    // Exactly one lock; the recent day and the old-but-started day stay playable.
    expect(screen.getAllByRole('button', { name: /réservée à l'abonnement/i })).toHaveLength(1);
    expect(screen.getByRole('link', { name: `Commencer — ${longDateFr(RECENT)}` })).toBeTruthy();
    expect(screen.getByRole('link', { name: `Commencer — ${longDateFr(OLD_STARTED)}` })).toBeTruthy();
  });

  it('shows the upsell banner only for a subscribe-eligible player', async () => {
    const { unmount } = renderArchive(CAN_SUBSCRIBE);
    expect(await screen.findByText('Débloque toutes les grilles')).toBeTruthy();
    unmount();

    renderArchive(SUBSCRIBER);
    await screen.findByRole('link', { name: `Commencer — ${longDateFr(RECENT)}` });
    await waitFor(() => expect(screen.queryByText('Débloque toutes les grilles')).toBeNull());
  });

  it('opens the gating sheet instead of navigating when a locked grid is tapped', async () => {
    const { router } = renderArchive(CAN_SUBSCRIBE);

    const locked = await screen.findByRole('button', { name: /réservée à l'abonnement/i });
    fireEvent.click(locked);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Une grille réservée aux abonnés')).toBeTruthy();
    // Cosmetic gate: it must not navigate into the grid.
    expect(router.state.location.pathname).toBe('/');
  });

  it('links the sheet CTA to the offer page', async () => {
    renderArchive(CAN_SUBSCRIBE);
    fireEvent.click(await screen.findByRole('button', { name: /réservée à l'abonnement/i }));

    const dialog = await screen.findByRole('dialog');
    const cta = within(dialog).getByRole('link', { name: /Voir l'abonnement/i });
    expect(cta.getAttribute('href')).toContain('/abonnement');
  });
});

describe('home upsell teaser (ADR-0080 W5a)', () => {
  it('renders the teaser for a subscribe-eligible player', async () => {
    renderHome(CAN_SUBSCRIBE);
    expect(await screen.findByText('Débloque toutes les grilles')).toBeTruthy();
    expect(screen.getByText('Abonne-toi et joue sans limite')).toBeTruthy();
  });

  it('hides the teaser for a free player without billing:subscribe', async () => {
    renderHome(FREE);
    await screen.findByRole('button', { name: /Bientôt disponible|Jouer|Chargement/i });
    await waitFor(() => expect(screen.queryByText('Débloque toutes les grilles')).toBeNull());
  });

  it('hides the teaser for a subscriber', async () => {
    renderHome(SUBSCRIBER);
    await screen.findByRole('button', { name: /Bientôt disponible|Jouer|Chargement/i });
    await waitFor(() => expect(screen.queryByText('Débloque toutes les grilles')).toBeNull());
  });
});
