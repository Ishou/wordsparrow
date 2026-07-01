import { render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient, GetMeResult } from '@/application/auth';
import type { BillingClient, SubscriptionView } from '@/application/billing';
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

const ACTIVE_VIEW: SubscriptionView = { tier: 'subscriber', status: 'active', periodEnd: '2026-08-01T00:00:00Z' };

function authedClient(capabilities: readonly string[]): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue({ userId: USER_ID, displayName: 'Lapin 472', capabilities }),
    getMe: vi.fn().mockResolvedValue(ME),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${returnTo}`,
  };
}

function fakeBillingClient(): BillingClient {
  return {
    getSubscription: vi.fn().mockResolvedValue(ACTIVE_VIEW),
    createCheckoutSession: vi.fn(),
    cancelSubscription: vi.fn(),
    listReceipts: vi.fn().mockResolvedValue({ receipts: [], nextCursor: null }),
  };
}

function renderCompte(capabilities: readonly string[], billingClient: BillingClient | undefined) {
  const authClient = authedClient(capabilities);
  const routeTree = RootRoute.addChildren([AppLayoutRoute.addChildren([CompteRoute])]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/compte'] }),
    context: {
      authClient,
      billingClient,
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

// Scope meta queries to the hero (its edit button is unique) since the app-layout menu also
// renders the display name and a "Connecté" subline.
const hero = () =>
  within(screen.getByRole('button', { name: /Modifier le pseudonyme/i }).closest('section') as HTMLElement);

describe('/compte — abonnement', () => {
  it('renders the manage panel and the abonné·e hero for a subscriber', async () => {
    renderCompte(['billing:subscribe', 'grilles:all'], fakeBillingClient());
    expect(await screen.findByRole('navigation', { name: 'Ton abonnement' })).toBeInTheDocument();
    expect(hero().getByText('Connecté · Abonné·e')).toBeInTheDocument();
  });

  it('shows the plain Connecté hero when not a subscriber', async () => {
    renderCompte(['billing:subscribe'], fakeBillingClient());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Modifier le pseudonyme/i })).toBeInTheDocument(),
    );
    expect(hero().getByText('Connecté')).toBeInTheDocument();
    expect(hero().queryByText('Connecté · Abonné·e')).toBeNull();
  });

  it('omits the manage panel when no billing client is wired', async () => {
    renderCompte(['billing:subscribe', 'grilles:all'], undefined);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Modifier le pseudonyme/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('navigation', { name: 'Ton abonnement' })).toBeNull();
  });
});
