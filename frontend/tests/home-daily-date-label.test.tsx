import { render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth/AuthClient';
import type { DailySummary, PuzzleRepository } from '@/application';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import { HomeScreen } from '@/ui/home/HomeScreen';
import { AuthProvider } from '@/ui/components/auth';

// June 30 is N°181 (day-of-year since the 2026-01-01 launch epoch); July 1 is N°182.
const summary30: DailySummary = {
  id: 'aaaaaaaa-0000-7000-8000-000000000030',
  date: '2026-06-30',
  gridNumber: 181,
  difficulty: null,
  totalLetterCells: 10,
};

const puzzleRepository: PuzzleRepository = {
  fetchById: () => Promise.resolve(null as never),
  fetchDaily: () => Promise.resolve(null),
  listDailySummaries: () => Promise.resolve({ items: [summary30], hasMore: false }),
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

const authClient: AuthClient = {
  whoami: () => Promise.resolve(null),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  deleteMe: vi.fn(),
  logout: vi.fn(),
  signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${returnTo}`,
};

function renderHome() {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <AuthProvider authClient={authClient} getPseudonym={() => 'Lapin 1'}>
        <HomeScreen puzzleRepository={puzzleRepository} soloEntriesStore={emptyStore} />
      </AuthProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('home daily date label', () => {
  // At 00:30 Paris (UTC+2 in July) the local date is July 1 but the server/strip/puzzle UTC day is still June 30.
  it('labels the hero with the UTC day, matching the served puzzle and the strip', async () => {
    vi.stubEnv('TZ', 'Europe/Paris');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-30T22:30:00Z'));

    renderHome();

    await waitFor(() => {
      expect(screen.getByText('Mardi 30 juin')).toBeInTheDocument();
    });
    expect(screen.queryByText('Mercredi 1 juillet')).not.toBeInTheDocument();
  });
});
