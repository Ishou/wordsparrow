import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import type { DailySummariesPage, DailySummary, PuzzleRepository } from '@/application';
import type { SoloEntriesStore, SoloLockedCell } from '@/application/solo/SoloEntriesStore';
import { GrillesArchiveScreen } from '@/ui/v2/GrillesArchiveScreen';
import { expectAxeClean } from '@/test/a11y';

const TODAY = new Date().toISOString().slice(0, 10);

const SUMMARIES: ReadonlyArray<DailySummary> = [
  { id: 'today', date: TODAY, gridNumber: 176, difficulty: 'medium', totalLetterCells: 14 },
  { id: 'done-1', date: '2026-06-20', gridNumber: 175, difficulty: 'easy', totalLetterCells: 10 },
  { id: 'new-1', date: '2026-06-19', gridNumber: 174, difficulty: 'hard', totalLetterCells: 12 },
];

function lockedCells(n: number): ReadonlyArray<SoloLockedCell> {
  return Array.from({ length: n }, (_, i) => ({ row: 0, column: i }));
}

// today = 8/14 locked (en cours); done-1 = 10/10 (terminée); new-1 = 0 (nouvelle).
const LOCKED: Record<string, number> = { today: 8, 'done-1': 10, 'new-1': 0 };

const soloStore: SoloEntriesStore = {
  load: () => [],
  save: () => {},
  loadLockedCells: (id: string) => lockedCells(LOCKED[id] ?? 0),
  lockCell: () => {},
  loadHintsUsed: () => 0,
  recordHintUsed: () => {},
  clearForPuzzle: () => {},
} as unknown as SoloEntriesStore;

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeRepo(page: DailySummariesPage | Promise<DailySummariesPage>): PuzzleRepository {
  return {
    fetchById: () => Promise.reject(new Error('unused')),
    fetchDaily: () => Promise.resolve(null),
    listDailySummaries: () => (page instanceof Promise ? page : Promise.resolve(page)),
  };
}

function renderScreen(repo: PuzzleRepository) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <GrillesArchiveScreen puzzleRepository={repo} soloEntriesStore={soloStore} />,
  });
  const play = createRoute({ getParentRoute: () => root, path: '/v2/play', component: () => <div>play</div> });
  const router = createRouter({
    routeTree: root.addChildren([index, play]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return { router, ...render(<RouterProvider router={router as never} />) };
}

async function renderLoaded(): Promise<ReturnType<typeof renderScreen>> {
  const result = renderScreen(makeRepo({ items: SUMMARIES, hasMore: false }));
  await screen.findByText(/n°175/);
  return result;
}

describe('v2 grilles archive', () => {
  it('skeletons the list while summaries are in flight, then shows cards', async () => {
    const d = deferred<DailySummariesPage>();
    const { container } = renderScreen(makeRepo(d.promise));

    expect(await screen.findByLabelText('Chargement des grilles')).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    await expectAxeClean(container);

    await act(async () => {
      d.resolve({ items: SUMMARIES, hasMore: false });
      await d.promise;
    });

    await waitFor(() => expect(screen.queryByLabelText('Chargement des grilles')).toBeNull());
    expect(screen.getByText(/n°176/)).toBeTruthy();
  });

  it('derives status: terminée / en cours / nouvelle from locked cells', async () => {
    await renderLoaded();

    expect(screen.getByText('En cours · 8 / 14 cases')).toBeTruthy();
    expect(screen.getByText('Terminée')).toBeTruthy();
    expect(screen.getByText('Pas encore commencée')).toBeTruthy();
  });

  it('labels CTAs by status: Reprendre / Revoir / Commencer', async () => {
    await renderLoaded();

    expect(screen.getByRole('button', { name: /Reprendre/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Revoir/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Commencer/ })).toBeTruthy();
  });

  it('flags today and navigates a past card to /v2/play with its date', async () => {
    const { router } = renderScreen(makeRepo({ items: SUMMARIES, hasMore: false }));
    await screen.findByText(/n°175/);

    expect(screen.getByText("Aujourd'hui")).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Revoir/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/v2/play'));
    expect(router.state.location.search).toEqual({ date: '2026-06-20' });
  });

  it('filters to only terminées when the Terminées tab is selected', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole('tab', { name: 'Terminées' }));

    expect(screen.getByText(/n°175/)).toBeTruthy();
    expect(screen.queryByText(/n°176/)).toBeNull();
    expect(screen.queryByText(/n°174/)).toBeNull();
  });

  it('filters to À finir (non-terminées) cards', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByRole('tab', { name: 'À finir' }));

    expect(screen.getByText(/n°176/)).toBeTruthy();
    expect(screen.getByText(/n°174/)).toBeTruthy();
    expect(screen.queryByText(/n°175/)).toBeNull();
  });

  it('is axe-clean once loaded (ADR-0050)', async () => {
    const { container } = await renderLoaded();
    await expectAxeClean(container);
  });
});
