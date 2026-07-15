import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { SignalementSummary, SurveyClient } from '@/application/survey';
import { AuthProvider } from '@/ui/components/auth';
import { ToastProvider } from '@/ui/components/primitives';
import { Route as RootRoute } from '@/ui/routes/__root';
import { SignalementsScreen } from '@/ui/routes/signalements.lazy';

// Same route id as the real ParentRoute ('/signalements') so SignalementsPage's useRouteContext resolves against the stubbed context.
const GatedSignalementsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/signalements',
  component: SignalementsScreen,
});

const MAINTAINER: WhoAmIResult = {
  userId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
  displayName: 'Lapin 472',
  role: 'maintainer',
  capabilities: ['admin:signalements'],
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
    signInUrl: (provider: string, returnTo: string) => `https://auth.test/${provider}?return=${returnTo}`,
  } as unknown as AuthClient;
}

function summary(over: Partial<SignalementSummary> = {}): SignalementSummary {
  return {
    reportId: '0190e3a4-7a2c-7c9e-8f1a-000000000001',
    wordText: 'CHAT',
    clueText: 'Animal qui miaule',
    reason: 'erreur_sens',
    surface: 'daily',
    puzzleId: '0190e3a4-7a2c-7c9e-8f1a-0000000000ab',
    count: 2,
    latestNote: 'contre-sens',
    latestAt: '2026-07-11T10:00:00Z',
    mine: false,
    ...over,
  };
}

function stubSurveyClient(): SurveyClient {
  return {
    listSignalements: vi.fn().mockResolvedValue([summary()]),
    decideSignalement: vi.fn().mockResolvedValue(undefined),
  } as unknown as SurveyClient;
}

function renderGate(authClient: AuthClient): ReactNode {
  const router = createRouter({
    routeTree: RootRoute.addChildren([GatedSignalementsRoute]),
    history: createMemoryHistory({ initialEntries: ['/signalements'] }),
    context: {
      authClient,
      getPseudonym: () => 'Lapin 1',
      surveyClient: stubSurveyClient(),
      puzzleRepository: {
        fetchById: vi.fn(),
        fetchDaily: vi.fn(),
        listDailySummaries: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
      },
      puzzleSolver: { validate: vi.fn(), requestHint: vi.fn(), verify: vi.fn() },
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
    } as never,
  });
  return (
    <AuthProvider authClient={authClient} getPseudonym={() => 'Lapin 1'}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  );
}

describe('/signalements capability gate (no flash of the page identity)', () => {
  it('renders the v2 queue with resolved word, surface, puzzle context and actions for an authorized maintainer', async () => {
    render(renderGate(authClientFor(MAINTAINER)));

    expect(await screen.findByRole('heading', { name: 'Signalements' })).toBeInTheDocument();
    expect(await screen.findByText('CHAT')).toBeInTheDocument();
    expect(screen.getByText(/Grille du jour/)).toBeInTheDocument();
    expect(screen.getByText(/réf\. 0190e3a4/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Marquer comme traité les signalements sur CHAT/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rejeter les signalements sur CHAT/ })).toBeInTheDocument();
  });

  it('never reveals the signalements heading while the gate is loading', async () => {
    let release!: () => void;
    const latch = new Promise<void>((resolve) => { release = resolve; });
    render(renderGate(authClientFor(MAINTAINER, latch)));

    expect(await screen.findByRole('status')).toHaveTextContent('Chargement…');
    expect(screen.queryByRole('heading', { name: 'Signalements' })).toBeNull();
    expect(screen.queryByText('CHAT')).toBeNull();
    release();
  });

  it('renders the 404 (never the signalements heading) for an unauthorized user', async () => {
    render(renderGate(authClientFor(PLAYER)));

    await waitFor(() => expect(screen.getByText("Cette page s'est envolée")).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Signalements' })).toBeNull();
  });
});
