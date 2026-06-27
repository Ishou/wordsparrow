import { render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from '@/application/auth';
import { AuthProvider } from '@/ui/components/auth';
import { Route as RootRoute } from '@/ui/routes/__root';
import { Route as V2Route } from '@/ui/routes/v2';
import { Route as ReglagesRoute } from '@/ui/routes/v2.reglages';
import { expectAxeClean } from '@/test/a11y';

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

function stubAuth(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(null),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    signInUrl: (provider, returnTo) =>
      `https://auth.test/${provider}?return=${encodeURIComponent(returnTo)}`,
    ...overrides,
  };
}

function renderReglages(authClient: AuthClient) {
  const routeTree = RootRoute.addChildren([V2Route.addChildren([ReglagesRoute])]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/v2/reglages'] }),
    context: {
      authClient,
      getPseudonym: () => 'Lapin 1',
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

describe('v2 réglages screen', () => {
  it('renders the title, the legal and help groups', async () => {
    renderReglages(stubAuth());
    expect(await screen.findByRole('heading', { level: 1, name: 'Réglages' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Confidentialité & légal' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Aide' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Retour/ })).toBeTruthy();
  });

  it('links Confidentialité and Mentions légales to their v2 routes', async () => {
    renderReglages(stubAuth());
    await screen.findByRole('heading', { level: 1, name: 'Réglages' });
    expect(screen.getByRole('link', { name: 'Confidentialité' }).getAttribute('href')).toBe(
      '/v2/confidentialite',
    );
    expect(screen.getByRole('link', { name: 'Mentions légales' }).getAttribute('href')).toBe(
      '/v2/mentions-legales',
    );
  });

  it('shows the Google sign-in link with a real returnTo href when anon', async () => {
    renderReglages(stubAuth());
    await screen.findByRole('heading', { level: 1, name: 'Réglages' });
    const signIn = await screen.findByRole('link', { name: 'Se connecter avec Google' });
    await waitFor(() =>
      expect(signIn.getAttribute('href')).toContain('https://auth.test/google?return='),
    );
    expect(signIn.getAttribute('aria-disabled')).toBeNull();
    expect(screen.getByText('Invité')).toBeTruthy();
    expect(screen.getByText('Joueur invité')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull();
  });

  it('shows the display name and a logout button when authed', async () => {
    const authClient = stubAuth({
      whoami: vi.fn().mockResolvedValue({ userId: USER_ID, displayName: 'Mésange 7' }),
    });
    renderReglages(authClient);
    await screen.findByRole('heading', { level: 1, name: 'Réglages' });
    expect(await screen.findByText('Mésange 7')).toBeTruthy();
    expect(screen.getByText('Connecté')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Se connecter avec Google' })).toBeNull();
  });

  it('is axe-clean (ADR-0050)', async () => {
    const { container } = renderReglages(stubAuth());
    await screen.findByRole('link', { name: 'Se connecter avec Google' });
    await expectAxeClean(container);
  });
});
