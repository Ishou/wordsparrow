import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import { AuthProvider } from '@/ui/components/auth';

// PhoneShell pulls router + root-context primitives (DesktopAppBar → MenuSheet); stub them so screens render without a full router.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
      <a href={String(to)} className={className}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
    useRouteContext: () => ({}),
  };
});

const { CheckoutCancelScreen, AbonnementAnnuleScreen } = await import('@/ui/v2/AbonnementAnnuleScreen');

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

function fakeAuthClient(whoami: WhoAmIResult | null): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(whoami),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return_to=${returnTo}`,
  };
}

const SUBSCRIBER: WhoAmIResult = {
  userId: USER_ID,
  displayName: 'Lapin 472',
  role: 'maintainer',
  capabilities: ['billing:subscribe'],
};

function withAuth(whoami: WhoAmIResult | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider authClient={fakeAuthClient(whoami)} getPseudonym={() => 'Renard 423'}>
        {children}
      </AuthProvider>
    );
  };
}

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

describe('CheckoutCancelScreen', () => {
  it('renders the cancelled copy and a link back to the abonnement screen', async () => {
    render(<CheckoutCancelScreen />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText("Aucun montant n'a été débité.")).toBeInTheDocument();
    const back = screen.getByRole('link', { name: /Revenir à mon abonnement/ });
    expect(back).toHaveAttribute('href', '/abonnement');
  });
});

describe('AbonnementAnnuleScreen capability gate', () => {
  it('renders the cancelled screen for an authed user with billing:subscribe', async () => {
    render(<AbonnementAnnuleScreen />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText("Aucun montant n'a été débité.")).toBeInTheDocument();
  });

  it('renders the standard 404 for an anonymous visitor', async () => {
    render(<AbonnementAnnuleScreen />, { wrapper: withAuth(null) });

    expect(await screen.findByText("Cette page s'est envolée")).toBeInTheDocument();
    expect(screen.queryByText("Aucun montant n'a été débité.")).toBeNull();
  });

  it('shows a neutral loading state with no page title while the session resolves', async () => {
    const authClient = fakeAuthClient(null);
    authClient.whoami = vi.fn().mockReturnValue(new Promise<WhoAmIResult | null>(() => {}));
    render(
      <AuthProvider authClient={authClient} getPseudonym={() => 'Renard 423'}>
        <AbonnementAnnuleScreen />
      </AuthProvider>,
    );

    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
    // No page identity while loading: a `denied` resolve must not flash the "Paiement annulé" title before the 404.
    expect(screen.queryByRole('heading', { level: 1, name: 'Paiement annulé' })).toBeNull();
  });
});
