import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient, GetMeResult } from '@/application/auth';
import type { ProgressSyncService } from '@/application/progress';
import { AuthProvider } from '@/ui/components/auth';
import { Route as RootRoute } from '@/ui/routes/__root';
import { Route as AppLayoutRoute } from '@/ui/routes/app-layout';
import { Route as CompteRoute } from '@/ui/routes/compte';

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

const ME: GetMeResult = {
  id: USER_ID,
  displayName: 'Lapin 472',
  createdAt: '2026-01-01T00:00:00Z',
  providers: [{ provider: 'google', linkedAt: '2026-01-01T00:00:00Z', emailOptIn: false }],
};

function authedClient(): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue({ userId: USER_ID, displayName: 'Lapin 472' }),
    getMe: vi.fn().mockResolvedValue(ME),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${returnTo}`,
  };
}

function fakeSyncService(pullAndMergeAll: () => Promise<void>): ProgressSyncService {
  return {
    setEnabled: () => {},
    pullAndMergeAll,
    pullAndMergeOne: async () => {},
    reconcileOnAuth: async () => {},
    resetReconciled: () => {},
    schedulePush: () => {},
    dispose: () => {},
  };
}

function renderCompte(progressSyncService: ProgressSyncService | undefined) {
  const authClient = authedClient();
  const routeTree = RootRoute.addChildren([AppLayoutRoute.addChildren([CompteRoute])]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/compte'] }),
    context: {
      authClient,
      getPseudonym: () => 'Lapin 1',
      progressSyncService,
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

const syncButton = () => screen.getByRole('button', { name: /Synchroniser maintenant/i });

describe('/compte — Synchroniser button', () => {
  it('calls pullAndMergeAll and announces success', async () => {
    const pull = vi.fn().mockResolvedValue(undefined);
    renderCompte(fakeSyncService(pull));
    await waitFor(() => expect(syncButton()).toBeInTheDocument());
    await act(async () => { fireEvent.click(syncButton()); });
    expect(pull).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Synchronisation terminée/i));
  });

  it('announces failure when the sync rejects', async () => {
    const pull = vi.fn().mockRejectedValue(new Error('offline'));
    renderCompte(fakeSyncService(pull));
    await waitFor(() => expect(syncButton()).toBeInTheDocument());
    await act(async () => { fireEvent.click(syncButton()); });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/La synchronisation a échoué/i));
  });

  it('does not double-fire while a sync is in flight', async () => {
    let resolve!: () => void;
    const pull = vi.fn().mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    renderCompte(fakeSyncService(pull));
    await waitFor(() => expect(syncButton()).toBeInTheDocument());
    await act(async () => { fireEvent.click(syncButton()); });
    await act(async () => { fireEvent.click(syncButton()); });
    expect(pull).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); });
  });

  it('hides the sync section when no service is wired', async () => {
    renderCompte(undefined);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Modifier le pseudonyme/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Synchroniser maintenant/i })).toBeNull();
  });
});
