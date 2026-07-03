import { cleanup, render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleRepository } from '@/application';
import type { AuthClient } from '@/application/auth';
import type { SoloEntriesStore } from '@/application/solo/SoloEntriesStore';
import { AuthProvider } from '@/ui/components/auth';
import { HomeScreen } from '@/ui/home/HomeScreen';
import { expectAxeClean } from '@/test/a11y';

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

const authClient: AuthClient = {
  whoami: vi.fn().mockResolvedValue(null),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  deleteMe: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  startEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
  signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${encodeURIComponent(returnTo)}`,
};

async function renderHome() {
  const rootRoute = createRootRoute();
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <AuthProvider authClient={authClient} getPseudonym={() => 'Renard 423'}>
        <HomeScreen puzzleRepository={puzzleRepository} soloEntriesStore={emptyStore} />
      </AuthProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1 });
}

afterEach(cleanup);

// Google OAuth branding verification requires the privacy-policy link visible on the home page itself.
describe('home legal footer', () => {
  it('links to the privacy policy from the home page', async () => {
    await renderHome();
    const nav = screen.getByRole('navigation', { name: 'Liens légaux' });
    const privacy = screen.getByRole('link', { name: 'Confidentialité' });
    expect(nav.contains(privacy)).toBe(true);
    expect(privacy.getAttribute('href')).toBe('/confidentialite');
  });

  it('links to the legal notice from the home page', async () => {
    await renderHome();
    const legal = screen.getByRole('link', { name: 'Mentions légales' });
    expect(legal.getAttribute('href')).toBe('/mentions-legales');
  });

  it('legal footer is axe-clean (ADR-0050)', async () => {
    await renderHome();
    const nav = screen.getByRole('navigation', { name: 'Liens légaux' });
    await expectAxeClean(nav);
  });
});
