import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient, GetMeResult } from '@/application/auth';
import { AuthProvider } from '@/ui/components/auth';
import { Route as RootRoute } from '@/ui/routes/__root';
import { Route as AppLayoutRoute } from '@/ui/routes/app-layout';
import { Route as CompteRoute } from '@/ui/routes/compte';

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

const ME: GetMeResult = {
  id: USER_ID,
  displayName: 'Lapin 472',
  createdAt: '2026-01-01T00:00:00Z',
  providers: [{ provider: 'google', linkedAt: '2026-01-01T00:00:00Z' }],
};

function authedClient(): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue({ userId: USER_ID, displayName: 'Lapin 472' }),
    getMe: vi.fn().mockResolvedValue(ME),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${returnTo}`,
  };
}

function renderCompte(authClient: AuthClient) {
  const routeTree = RootRoute.addChildren([AppLayoutRoute.addChildren([CompteRoute])]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/compte'] }),
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
  return render(
    <AuthProvider authClient={authClient} getPseudonym={() => 'Lapin 1'}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

const logoutAllButton = () =>
  screen.getByRole('button', { name: /Se déconnecter de tous les appareils/i });

describe('/compte — Se déconnecter de tous les appareils', () => {
  it('calls logoutAll then refresh and announces success', async () => {
    const client = authedClient();
    renderCompte(client);
    await waitFor(() => expect(logoutAllButton()).toBeInTheDocument());
    const whoamiBefore = (client.whoami as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => { fireEvent.click(logoutAllButton()); });

    expect(client.logoutAll).toHaveBeenCalledTimes(1);
    // refresh() re-checks the session, so whoami is called again after logoutAll.
    await waitFor(() =>
      expect((client.whoami as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(whoamiBefore),
    );
    const logoutOrder = (client.logoutAll as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const whoamiOrders = (client.whoami as ReturnType<typeof vi.fn>).mock.invocationCallOrder;
    expect(whoamiOrders[whoamiOrders.length - 1]).toBeGreaterThan(logoutOrder);
    await waitFor(() =>
      expect(screen.getByText('Déconnecté·e de tous les appareils.')).toBeInTheDocument(),
    );
  });

  it('leaves the single-device logout untouched', async () => {
    const client = authedClient();
    renderCompte(client);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeInTheDocument(),
    );
    expect(client.logout).not.toHaveBeenCalled();
    expect(client.logoutAll).not.toHaveBeenCalled();
  });
});
