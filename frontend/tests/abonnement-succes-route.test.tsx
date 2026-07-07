import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, GetMeResult, WhoAmIResult } from '@/application/auth';
import type { BillingClient } from '@/application/billing';
import { AuthProvider } from '@/ui/components/auth';

// PhoneShell pulls router + root-context primitives (DesktopAppBar → MenuSheet); stub them so screens render without a full router.
let routeContext: Record<string, unknown> = {};
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
    useRouteContext: () => routeContext,
  };
});

const { CheckoutSuccessScreen, AbonnementSuccesScreen } = await import('@/ui/v2/AbonnementSuccesScreen');

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

// billing:subscribe lets the visitor reach the page; grilles:all is the paid capability the paywall
// reads, so the success screen only shows the "active" CTA once whoami reports it.
const NOT_YET_UNLOCKED: WhoAmIResult = {
  userId: USER_ID,
  displayName: 'Lapin 472',
  role: 'maintainer',
  capabilities: ['billing:subscribe'],
};
const UNLOCKED: WhoAmIResult = {
  ...NOT_YET_UNLOCKED,
  capabilities: ['billing:subscribe', 'grilles:all'],
};

function fakeBillingClient(): BillingClient {
  return {
    getSubscription: vi.fn(),
    createCheckoutSession: vi.fn(),
    cancelSubscription: vi.fn(),
    reactivateSubscription: vi.fn(),
    listReceipts: vi.fn().mockResolvedValue({ receipts: [], nextCursor: null }),
  };
}

function fakeAuthClient(whoami: AuthClient['whoami'], getMe?: AuthClient['getMe']): AuthClient {
  return {
    whoami,
    getMe: getMe ?? vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    startEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return_to=${returnTo}`,
  };
}

function withAuth(authClient: AuthClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider authClient={authClient} getPseudonym={() => 'Renard 423'}>
        {children}
      </AuthProvider>
    );
  };
}

describe('CheckoutSuccessScreen polling', () => {
  beforeEach(() => {
    routeContext = {};
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('polls whoami and shows the active state once the paid capability lands', async () => {
    const whoami = vi
      .fn<AuthClient['whoami']>()
      .mockResolvedValueOnce(NOT_YET_UNLOCKED)
      .mockResolvedValue(UNLOCKED);
    render(<CheckoutSuccessScreen />, { wrapper: withAuth(fakeAuthClient(whoami)) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/confirmation en cours/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /revenir à mon abonnement/i })).toHaveAttribute(
      'href',
      '/abonnement',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText(/te voilà abonné·e/i)).toBeInTheDocument();
  });

  it('shows the neutral timeout after the polling cap when the capability never lands', async () => {
    const whoami = vi.fn<AuthClient['whoami']>().mockResolvedValue(NOT_YET_UNLOCKED);
    render(<CheckoutSuccessScreen />, { wrapper: withAuth(fakeAuthClient(whoami)) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(screen.getByText(/plus de temps que prévu/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /retour à mon compte/i })).toHaveAttribute('href', '/compte');
  });

  it('shows the active state immediately when the capability is already present', async () => {
    const whoami = vi.fn<AuthClient['whoami']>().mockResolvedValue(UNLOCKED);
    render(<CheckoutSuccessScreen />, { wrapper: withAuth(fakeAuthClient(whoami)) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/te voilà abonné·e/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    // whoami fetched once on mount; the paywall capability was already present, so no polling.
    expect(whoami).toHaveBeenCalledTimes(1);
  });
});

describe('CheckoutSuccessScreen receipt line', () => {
  function getMeWith(email?: string): AuthClient['getMe'] {
    const me: GetMeResult = {
      id: USER_ID,
      displayName: 'Lapin 472',
      createdAt: '2026-01-01T00:00:00Z',
      providers: [],
      email,
    };
    return vi.fn().mockResolvedValue(me);
  }

  beforeEach(() => {
    routeContext = {};
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows the receipt line once getMe resolves with an email on file', async () => {
    routeContext = {
      authClient: fakeAuthClient(vi.fn().mockResolvedValue(UNLOCKED), getMeWith('lapin@example.com')),
    };
    render(<CheckoutSuccessScreen />, {
      wrapper: withAuth(fakeAuthClient(vi.fn().mockResolvedValue(UNLOCKED))),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/un reçu te sera envoyé par e-mail/i)).toBeInTheDocument();
  });

  it('hides the receipt line when no email is on file', async () => {
    routeContext = {
      authClient: fakeAuthClient(vi.fn().mockResolvedValue(UNLOCKED), getMeWith(undefined)),
    };
    render(<CheckoutSuccessScreen />, {
      wrapper: withAuth(fakeAuthClient(vi.fn().mockResolvedValue(UNLOCKED))),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/te voilà abonné/i)).toBeInTheDocument();
    expect(screen.queryByText(/un reçu te sera envoyé par e-mail/i)).toBeNull();
  });
});

describe('AbonnementSuccesScreen capability gate', () => {
  beforeEach(() => {
    routeContext = {};
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('renders the confirmation screen for an authed user with billing:subscribe', async () => {
    routeContext = { billingClient: fakeBillingClient() };
    render(<AbonnementSuccesScreen />, {
      wrapper: withAuth(fakeAuthClient(vi.fn().mockResolvedValue(NOT_YET_UNLOCKED))),
    });

    expect(await screen.findByText(/confirmation en cours/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Abonnement' })).toBeInTheDocument();
  });

  it('renders the standard 404 for an anonymous visitor', async () => {
    routeContext = { billingClient: fakeBillingClient() };
    render(<AbonnementSuccesScreen />, {
      wrapper: withAuth(fakeAuthClient(vi.fn().mockResolvedValue(null))),
    });

    expect(await screen.findByText("Cette page s'est envolée")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Abonnement' })).toBeNull();
  });

  it('shows a neutral loading state with no page title while the session resolves', async () => {
    const whoami = vi.fn<AuthClient['whoami']>().mockReturnValue(new Promise(() => {}));
    routeContext = { billingClient: fakeBillingClient() };
    render(
      <AuthProvider authClient={fakeAuthClient(whoami)} getPseudonym={() => 'Renard 423'}>
        <AbonnementSuccesScreen />
      </AuthProvider>,
    );

    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
    // No page identity while loading: a `denied` resolve must not flash the "Abonnement" title before the 404.
    expect(screen.queryByRole('heading', { level: 1, name: 'Abonnement' })).toBeNull();
  });
});
