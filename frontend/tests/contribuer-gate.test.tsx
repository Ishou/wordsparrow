import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { SurveyClient } from '@/application/survey';
import { surveyAnonRatedStore } from '@/infrastructure/session/localStorageSurveyAnon';
import { AuthProvider } from '@/ui/components/auth';
import { Route as RootRoute } from '@/ui/routes/__root';
import { ContribuerScreen } from '@/ui/routes/contribuer.lazy';
import { ContribuerPairsScreen } from '@/ui/routes/contribuer.pairs.lazy';

// Mount the gate wrapper directly (same '/contribuer' route id) to avoid lazy-chunk timing; ContribuerScreen is the lazy route's component.
const GatedContribuerRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/contribuer',
  component: ContribuerScreen,
});

const MAINTAINER: WhoAmIResult = {
  userId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
  displayName: 'Lapin 472',
  role: 'maintainer',
  capabilities: ['contribuer'],
};

const PLAYER: WhoAmIResult = {
  userId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
  displayName: 'Renard 423',
  role: 'player',
  capabilities: ['hint'],
};

function authClientFor(whoami: WhoAmIResult | null, latch?: Promise<void>): AuthClient {
  return {
    async whoami() {
      if (latch) await latch;
      return whoami;
    },
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${returnTo}`,
  };
}

function stubSurveyClient(): SurveyClient {
  return {
    getNextItem: vi.fn().mockResolvedValue(null),
    submitRating: vi.fn(),
    getNextPair: vi.fn().mockResolvedValue(null),
    submitPairRating: vi.fn().mockResolvedValue({ undoToken: null }),
    undoAction: vi.fn().mockResolvedValue(undefined),
    getProgress: vi.fn().mockResolvedValue({ itemsRated: 0, calibrationAgreement: null, lastRatedAt: null }),
    getContributions: vi.fn().mockResolvedValue([]),
    patchPreferences: vi.fn().mockResolvedValue(undefined),
    getCurrentCampaign: vi.fn().mockResolvedValue({
      campaignId: '0190e3a4-7a2c-7c9e-8f1a-000000000007',
      batchLabel: 'round-7',
      openedAt: '2026-05-30T10:00:00Z',
      closedAt: null,
    }),
    getLemmaMeta: vi.fn().mockResolvedValue({ priorSenses: [], priorSubTags: [] }),
  };
}

function renderGate(authClient: AuthClient): ReactNode {
  const routeTree = RootRoute.addChildren([GatedContribuerRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/contribuer'] }),
    context: {
      authClient,
      getPseudonym: () => 'Lapin 1',
      surveyClient: stubSurveyClient(),
      surveyAnonStore: surveyAnonRatedStore,
      analytics: { trackEvent: vi.fn() },
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
  return (
    <AuthProvider authClient={authClient} getPseudonym={() => 'Lapin 1'}>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

describe('Contribuer capability gate', () => {
  it('renders the rating screen for a maintainer holding the contribuer capability', async () => {
    render(renderGate(authClientFor(MAINTAINER)));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Campagne de qualité des indices' })).toBeInTheDocument(),
    );
    expect(screen.queryByText("Cette page s'est envolée")).toBeNull();
  });

  it('renders the 404 screen for a player lacking the contribuer capability', async () => {
    render(renderGate(authClientFor(PLAYER)));
    await waitFor(() =>
      expect(screen.getByText("Cette page s'est envolée")).toBeInTheDocument(),
    );
    expect(screen.queryByRole('heading', { name: 'Campagne de qualité des indices' })).toBeNull();
  });

  it('renders the 404 screen for an anonymous visitor', async () => {
    render(renderGate(authClientFor(null)));
    await waitFor(() =>
      expect(screen.getByText("Cette page s'est envolée")).toBeInTheDocument(),
    );
  });

  it('shows a loading state while the session resolves', async () => {
    const latch = new Promise<void>(() => {});
    render(renderGate(authClientFor(MAINTAINER, latch)));
    expect(await screen.findByRole('status')).toHaveTextContent('Chargement…');
    expect(screen.queryByText("Cette page s'est envolée")).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Campagne de qualité des indices' })).toBeNull();
  });
});

describe('Contribuer pairs capability gate', () => {
  function renderPairsGate(authClient: AuthClient): ReactNode {
    const PairsRoute = createRoute({
      getParentRoute: () => RootRoute,
      path: '/contribuer/pairs',
      component: ContribuerPairsScreen,
    });
    const routeTree = RootRoute.addChildren([PairsRoute]);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/contribuer/pairs'] }),
      context: {
        authClient,
        getPseudonym: () => 'Lapin 1',
        surveyClient: stubSurveyClient(),
        surveyAnonStore: surveyAnonRatedStore,
        analytics: { trackEvent: vi.fn() },
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
    return (
      <AuthProvider authClient={authClient} getPseudonym={() => 'Lapin 1'}>
        <RouterProvider router={router} />
      </AuthProvider>
    );
  }

  it('renders the 404 screen for a player lacking the contribuer capability', async () => {
    render(renderPairsGate(authClientFor(PLAYER)));
    await waitFor(() => expect(screen.getByText("Cette page s'est envolée")).toBeInTheDocument());
  });

  it('renders the pairs screen for a maintainer', async () => {
    render(renderPairsGate(authClientFor(MAINTAINER)));
    // the pairs page shares the campaign h1; its distinguishing chrome is the pair-mode shortcuts legend
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Campagne de qualité des indices' })).toBeInTheDocument(),
    );
    expect(screen.queryByText("Cette page s'est envolée")).toBeNull();
  });

  it('sets the document title on the 404 gate screen (WCAG 2.4.2)', async () => {
    render(renderPairsGate(authClientFor(null)));
    await waitFor(() => expect(document.title).toBe('Page introuvable — WordSparrow'));
  });
});
