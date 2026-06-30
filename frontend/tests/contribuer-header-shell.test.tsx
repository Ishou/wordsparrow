import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth';
import type { SurveyClient, SurveyItem } from '@/application/survey';
import { surveyAnonRatedStore } from '@/infrastructure/session/localStorageSurveyAnon';
import { AuthProvider } from '@/ui/components/auth';
import { Route as RootRoute } from '@/ui/routes/__root';
import { ContribuerPage } from '@/ui/routes/contribuer.lazy';

// Render the inner screen directly (same '/contribuer' route id) to exercise the header shell without the maintainer gate (covered in contribuer-gate.test.tsx).
const InnerContribuerRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/contribuer',
  component: ContribuerPage,
});

const sampleItem: SurveyItem = {
  itemId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
  mot: 'CHAT',
  definition: 'Animal domestique à moustaches',
  pos: 'nom_commun',
  categorie: 'faune_flore',
  style: 'definition_directe',
  forceClaimed: 2,
  longueur: 4,
  tier: 'mid',
  isCalibration: false,
};

function stubAuth(): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(null),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    signInUrl: (provider, returnTo) =>
      `https://auth.test/${provider}?return=${encodeURIComponent(returnTo)}`,
  };
}

function stubSurveyClient(): SurveyClient {
  return {
    getNextItem: vi.fn().mockResolvedValue(sampleItem),
    submitRating: vi.fn(),
    getNextPair: vi.fn().mockResolvedValue(null),
    submitPairRating: vi.fn().mockResolvedValue({ undoToken: null }),
    undoAction: vi.fn().mockResolvedValue(undefined),
    getProgress: vi.fn().mockResolvedValue({
      itemsRated: 0,
      calibrationAgreement: null,
      lastRatedAt: null,
    }),
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

function renderContribuer() {
  const authClient = stubAuth();
  const surveyClient = stubSurveyClient();
  const routeTree = RootRoute.addChildren([InnerContribuerRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/contribuer'] }),
    context: {
      authClient,
      getPseudonym: () => 'Lapin 1',
      surveyClient,
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
  return render(
    <AuthProvider authClient={authClient} getPseudonym={() => 'Lapin 1'}>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

describe('Contribuer header shell', () => {
  // Brand/Alpha chrome is supplied globally by AppHeader; the page must not duplicate it.
  it('keeps the campaign title and display-name subtitle', async () => {
    renderContribuer();
    await waitFor(() => expect(screen.getByTestId('rating-card')).toBeInTheDocument());
    expect(
      screen.getByRole('heading', { name: 'Campagne de qualité des indices' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('campaign-subtitle')).toHaveTextContent('Moineau 7');
  });

  it('renders the keyboard legend at the foot of the loop', async () => {
    renderContribuer();
    await waitFor(() => expect(screen.getByTestId('rating-card')).toBeInTheDocument());
    const legend = screen.getByLabelText('Raccourcis clavier');
    expect(legend).toHaveTextContent('noter');
    expect(legend).toHaveTextContent('corriger');
    expect(legend).toHaveTextContent('confirmer / enregistrer');
  });

  it('keeps the Mode paires link pointing at /contribuer/pairs', async () => {
    renderContribuer();
    await waitFor(() => expect(screen.getByTestId('rating-card')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Mode paires/ })).toHaveAttribute(
      'href',
      '/contribuer/pairs',
    );
  });
});
