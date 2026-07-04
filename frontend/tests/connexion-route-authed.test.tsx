import { render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth';
import { AuthProvider } from '@/ui/components/auth';
import { Route as RootRoute } from '@/ui/routes/__root';
import { Route as AppLayoutRoute } from '@/ui/routes/app-layout';
import { Route as ConnexionRoute } from '@/ui/routes/connexion';
import { Route as CompteRoute } from '@/ui/routes/compte';

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

function stubAuth(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(null),
    getMe: vi.fn().mockResolvedValue({ id: USER_ID, displayName: 'Lapin 472', createdAt: '2026-01-01T00:00:00Z', providers: [] }),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${encodeURIComponent(returnTo)}`,
    ...overrides,
  };
}

function renderConnexion(authClient: AuthClient, initialEntry: string) {
  const routeTree = RootRoute.addChildren([AppLayoutRoute.addChildren([ConnexionRoute, CompteRoute])]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    context: {
      authClient,
      getPseudonym: () => 'Lapin 1',
      progressSyncService: undefined,
      surveyClient: undefined,
      analytics: undefined,
      puzzleRepository: {
        fetchById: vi.fn(),
        fetchDaily: vi.fn(),
        listDailySummaries: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
      },
      puzzleSolver: { validate: vi.fn(), requestHint: vi.fn() },
      sessionClient: {
        eraseSession: () => Promise.resolve({ deleted: 0 }),
        getSessionId: () => 'test-session-id',
        clearLocalSession: () => {},
      },
      soloEntriesStore: {
        load: () => [],
        save: () => {},
        loadLockedCells: () => [],
        lockCell: () => {},
        loadHintsUsed: () => 0,
        recordHintUsed: () => {},
        loadElapsed: () => 0,
        saveElapsed: () => {},
        clearForPuzzle: () => {},
      },
      tourSeenStore: { get: () => true, set: () => {}, clear: () => {} },
    },
  });
  const utils = render(
    <AuthProvider authClient={authClient} getPseudonym={() => 'Lapin 1'}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { router, ...utils };
}

describe('/connexion — already-authenticated guard', () => {
  it('redirects an authed visitor to returnTo instead of showing the sign-in form', async () => {
    const authClient = stubAuth({
      whoami: vi.fn().mockResolvedValue({ userId: USER_ID, displayName: 'Lapin 472' }),
    });
    const { router } = renderConnexion(authClient, '/connexion?returnTo=%2Fcompte');

    await waitFor(() => expect(router.state.location.pathname).toBe('/compte'));
    expect(screen.queryByLabelText('Adresse e-mail')).not.toBeInTheDocument();
  });

  it('keeps showing the sign-in form for an anonymous visitor', async () => {
    const authClient = stubAuth();
    renderConnexion(authClient, '/connexion');

    await waitFor(() => expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument());
  });
});
