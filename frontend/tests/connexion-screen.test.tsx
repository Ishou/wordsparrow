import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function fakeAuthClient(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(null),
    getMe: vi.fn().mockResolvedValue({ id: USER_ID, displayName: 'Joueur', createdAt: '2026-01-01T00:00:00Z', providers: [] }),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn().mockResolvedValue('sent'),
    verifyEmailOtp: vi.fn().mockResolvedValue('ok'),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return=${returnTo}`,
    ...overrides,
  };
}

function renderConnexion(authClient: AuthClient, returnTo = '/compte') {
  const routeTree = RootRoute.addChildren([AppLayoutRoute.addChildren([ConnexionRoute, CompteRoute])]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [`/connexion?returnTo=${encodeURIComponent(returnTo)}`] }),
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

const emailField = () => screen.getByLabelText('Adresse e-mail');
const submitButton = () => screen.getByRole('button', { name: /Recevoir le code/i });
const otpSlots = (container: HTMLElement) =>
  container.querySelectorAll<HTMLInputElement>('input[data-part="input"]');

async function typeEmailAndSubmit(email: string) {
  await act(async () => { fireEvent.change(emailField(), { target: { value: email } }); });
  await act(async () => { fireEvent.click(submitButton()); });
}

async function typeCode(container: HTMLElement, code: string) {
  const slots = otpSlots(container);
  for (const [index, digit] of [...code].entries()) {
    await act(async () => {
      slots[index]!.focus();
      fireEvent.change(slots[index]!, { target: { value: digit } });
    });
  }
}

describe('/connexion — email-OTP screen', () => {
  it('advances from email to code step when startEmailOtp resolves "sent"', async () => {
    const authClient = fakeAuthClient();
    const { container } = renderConnexion(authClient);
    await waitFor(() => expect(emailField()).toBeInTheDocument());
    await typeEmailAndSubmit('joueuse@exemple.fr');

    expect(authClient.startEmailOtp).toHaveBeenCalledWith('joueuse@exemple.fr');
    await waitFor(() => expect(otpSlots(container).length).toBe(6));
    // Announcer confirms the transition on the polite channel.
    await waitFor(() => expect(screen.getByText('Code envoyé par e-mail.')).toBeInTheDocument());
  });

  it('verifies the code, refreshes auth, and navigates to returnTo on "ok"', async () => {
    const authClient = fakeAuthClient();
    const { container, router } = renderConnexion(authClient, '/compte');
    await waitFor(() => expect(emailField()).toBeInTheDocument());
    const initialWhoami = (authClient.whoami as ReturnType<typeof vi.fn>).mock.calls.length;

    await typeEmailAndSubmit('joueuse@exemple.fr');
    await waitFor(() => expect(otpSlots(container).length).toBe(6));
    await typeCode(container, '123456');

    expect(authClient.verifyEmailOtp).toHaveBeenCalledWith('joueuse@exemple.fr', '123456');
    // refresh() re-probes whoami on success (anon→authed flip).
    await waitFor(() =>
      expect((authClient.whoami as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialWhoami),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/compte'));
  });

  it('shows a role="alert" error and clears the code when verify returns "invalid"', async () => {
    const authClient = fakeAuthClient({ verifyEmailOtp: vi.fn().mockResolvedValue('invalid') });
    const { container } = renderConnexion(authClient);
    await waitFor(() => expect(emailField()).toBeInTheDocument());
    await typeEmailAndSubmit('joueuse@exemple.fr');
    await waitFor(() => expect(otpSlots(container).length).toBe(6));
    await typeCode(container, '000000');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Code incorrect ou expiré.'));
  });

  it('shows the cooldown copy when startEmailOtp returns "rate_limited"', async () => {
    const authClient = fakeAuthClient({ startEmailOtp: vi.fn().mockResolvedValue('rate_limited') });
    renderConnexion(authClient);
    await waitFor(() => expect(emailField()).toBeInTheDocument());
    await typeEmailAndSubmit('joueuse@exemple.fr');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Trop de tentatives, réessaie dans une minute.'),
    );
  });

  it('shows a role="alert" error when the email is rejected as "invalid"', async () => {
    const authClient = fakeAuthClient({ startEmailOtp: vi.fn().mockResolvedValue('invalid') });
    renderConnexion(authClient);
    await waitFor(() => expect(emailField()).toBeInTheDocument());
    await typeEmailAndSubmit('pas-un-email');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Cette adresse e-mail n’est pas valide.'),
    );
  });
});
