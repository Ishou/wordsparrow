import { act, render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth/AuthClient';
import type { DailySummary, PuzzleRepository } from '@/application';
import type { ProgressSyncService } from '@/application/progress';
import type { SoloEntriesStore, SoloLockedCell } from '@/application/solo/SoloEntriesStore';
import { HomeScreen } from '@/ui/home/HomeScreen';
import { AuthProvider } from '@/ui/components/auth';

const TODAY = new Date().toISOString().slice(0, 10);
const summaryToday: DailySummary = {
  id: 'today-1',
  date: TODAY,
  gridNumber: 200,
  difficulty: null,
  totalLetterCells: 4,
};
const repo: PuzzleRepository = {
  fetchById: () => Promise.resolve(null as never),
  fetchDaily: () => Promise.resolve(null),
  listDailySummaries: () => Promise.resolve({ items: [summaryToday], hasMore: false }),
};

// Mutable store: `locked` flips from 0 to full to simulate a merge writing local storage.
function mutableStore(): SoloEntriesStore & { locked: number } {
  const store = {
    locked: 0,
    load: () => [],
    save: () => {},
    loadLockedCells: (): ReadonlyArray<SoloLockedCell> =>
      Array.from({ length: store.locked }, (_, i) => ({ row: 0, column: i })),
    lockCell: () => {},
    loadHintsUsed: () => 0,
    recordHintUsed: () => {},
    loadElapsed: () => 0,
    saveElapsed: () => {},
    clearForPuzzle: () => {},
  };
  return store;
}

function observableService(): ProgressSyncService & { fireMerge: () => void } {
  const listeners = new Set<() => void>();
  let revision = 0;
  return {
    setEnabled: () => {},
    pullAndMergeAll: vi.fn(async () => {}),
    pullAndMergeOne: async () => {},
    reconcileOnAuth: async () => {},
    resetReconciled: () => {},
    schedulePush: () => {},
    dispose: () => {},
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getRevision: () => revision,
    fireMerge: () => {
      revision += 1;
      for (const l of listeners) l();
    },
  };
}

function authClientOf(authed: boolean): AuthClient {
  return {
    whoami: () => Promise.resolve(authed ? { userId: 'u-1', displayName: 'Lapin 1' } : null),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (p: 'google' | 'apple', r: string) => `https://auth.test/${p}?return=${r}`,
  } as unknown as AuthClient;
}

function renderHome(opts: {
  authed: boolean;
  store: SoloEntriesStore;
  service?: ProgressSyncService;
}) {
  const authClient = authClientOf(opts.authed);
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <AuthProvider authClient={authClient} getPseudonym={() => 'Lapin 1'}>
        <HomeScreen
          puzzleRepository={repo}
          soloEntriesStore={opts.store}
          progressSyncService={opts.service}
        />
      </AuthProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

// The day-dot button renders the day-of-month as its only text; that's unambiguous among page buttons.
const DAY_NUM = String(new Date(`${TODAY}T00:00:00Z`).getUTCDate());
const todayCell = () => screen.getAllByRole('button').find((b) => b.textContent === DAY_NUM)!;

describe('Home — cross-device progress sync', () => {
  it('fires pullAndMergeAll on mount when authed', async () => {
    const service = observableService();
    renderHome({ authed: true, store: mutableStore(), service });
    await waitFor(() => expect(service.pullAndMergeAll).toHaveBeenCalledTimes(1));
  });

  it('does not pull when anon', async () => {
    const service = observableService();
    renderHome({ authed: false, store: mutableStore(), service });
    // Wait until the strip has rendered (summaries loaded + auth resolved to anon) so a stray pull would have fired.
    await waitFor(() => expect(todayCell()).toBeTruthy());
    expect(service.pullAndMergeAll).not.toHaveBeenCalled();
  });

  it('re-reads the strip when a merge notifies', async () => {
    const store = mutableStore();
    const service = observableService();
    renderHome({ authed: true, store, service });
    // today's dot: 0 locked → untouched; aria has no "terminée".
    await waitFor(() => expect(todayCell()).toBeTruthy());
    expect(todayCell().getAttribute('aria-label')).not.toMatch(/terminée/i);

    // Simulate a merge that fully solved today's grid on another device.
    act(() => {
      store.locked = summaryToday.totalLetterCells;
      service.fireMerge();
    });

    await waitFor(() => expect(todayCell().getAttribute('aria-label')).toMatch(/terminée/i));
  });
});
