import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, GetMeResult, WhoAmIResult } from '@/application/auth';
import type { BillingClient, SubscriptionView } from '@/application/billing';
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
const PENDING_VIEW: SubscriptionView = { tier: 'subscriber', status: 'pending', periodEnd: null };
const ACTIVE_VIEW: SubscriptionView = {
  tier: 'subscriber',
  status: 'active',
  periodEnd: '2026-08-01T00:00:00Z',
};

function fakeBillingClient(getSubscription: BillingClient['getSubscription']): BillingClient {
  return {
    getSubscription,
    createCheckoutSession: vi.fn(),
    cancelSubscription: vi.fn(),
    listReceipts: vi.fn().mockResolvedValue({ receipts: [], nextCursor: null }),
  };
}

function fakeAuthClient(whoami: WhoAmIResult | null): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(whoami),
    getMe: vi.fn(),
    updateMe: vi.fn(),
    deleteMe: vi.fn(),
    logout: vi.fn(),
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

describe('CheckoutSuccessScreen polling', () => {
  beforeEach(() => {
    routeContext = {};
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('polls then shows the active state once the webhook confirms the subscription', async () => {
    const getSubscription = vi
      .fn<BillingClient['getSubscription']>()
      .mockResolvedValueOnce(PENDING_VIEW)
      .mockResolvedValue(ACTIVE_VIEW);
    render(<CheckoutSuccessScreen client={fakeBillingClient(getSubscription)} />, {
      wrapper: withAuth(SUBSCRIBER),
    });

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
    expect(getSubscription).toHaveBeenCalledTimes(2);
  });

  it('shows the neutral timeout message after the polling cap with no active status', async () => {
    const getSubscription = vi.fn<BillingClient['getSubscription']>().mockResolvedValue(PENDING_VIEW);
    render(<CheckoutSuccessScreen client={fakeBillingClient(getSubscription)} />, {
      wrapper: withAuth(SUBSCRIBER),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(screen.getByText(/plus de temps que prévu/i)).toBeInTheDocument();
    expect(getSubscription).toHaveBeenCalledTimes(5);
    expect(screen.getByRole('link', { name: /retour à mon compte/i })).toHaveAttribute('href', '/compte');
  });

  it('stops polling once active without ticking through the whole cap', async () => {
    const getSubscription = vi.fn<BillingClient['getSubscription']>().mockResolvedValue(ACTIVE_VIEW);
    render(<CheckoutSuccessScreen client={fakeBillingClient(getSubscription)} />, {
      wrapper: withAuth(SUBSCRIBER),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/te voilà abonné·e/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(getSubscription).toHaveBeenCalledTimes(1);
  });
});

describe('CheckoutSuccessScreen receipt line', () => {
  function fakeAuthClientWithEmail(email?: string): AuthClient {
    const me: GetMeResult = {
      id: USER_ID,
      displayName: 'Lapin 472',
      createdAt: '2026-01-01T00:00:00Z',
      providers: [],
      email,
    };
    return {
      whoami: vi.fn().mockResolvedValue(SUBSCRIBER),
      getMe: vi.fn().mockResolvedValue(me),
      updateMe: vi.fn(),
      deleteMe: vi.fn(),
      logout: vi.fn(),
      signInUrl: (provider, returnTo) => `https://auth.test/${provider}?return_to=${returnTo}`,
    };
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
    routeContext = { authClient: fakeAuthClientWithEmail('lapin@example.com') };
    const getSubscription = vi.fn<BillingClient['getSubscription']>().mockResolvedValue(ACTIVE_VIEW);
    render(<CheckoutSuccessScreen client={fakeBillingClient(getSubscription)} />, {
      wrapper: withAuth(SUBSCRIBER),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(await screen.findByText(/un reçu te sera envoyé par e-mail/i)).toBeInTheDocument();
  });

  it('hides the receipt line when no email is on file', async () => {
    routeContext = { authClient: fakeAuthClientWithEmail(undefined) };
    const getSubscription = vi.fn<BillingClient['getSubscription']>().mockResolvedValue(ACTIVE_VIEW);
    render(<CheckoutSuccessScreen client={fakeBillingClient(getSubscription)} />, {
      wrapper: withAuth(SUBSCRIBER),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(await screen.findByText(/te voilà abonné/i)).toBeInTheDocument();
    expect(screen.queryByText(/un reçu te sera envoyé par e-mail/i)).toBeNull();
  });
});

describe('AbonnementSuccesScreen capability gate', () => {
  beforeEach(() => {
    routeContext = {};
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('renders the confirmation screen for an authed user with billing:subscribe', async () => {
    routeContext = { billingClient: fakeBillingClient(vi.fn().mockResolvedValue(PENDING_VIEW)) };
    render(<AbonnementSuccesScreen />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText(/confirmation en cours/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Abonnement' })).toBeInTheDocument();
  });

  it('renders the standard 404 for an anonymous visitor', async () => {
    routeContext = { billingClient: fakeBillingClient(vi.fn().mockResolvedValue(PENDING_VIEW)) };
    render(<AbonnementSuccesScreen />, { wrapper: withAuth(null) });

    expect(await screen.findByText("Cette page s'est envolée")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Abonnement' })).toBeNull();
  });

  it('shows a neutral loading state with no page title while the session resolves', async () => {
    const authClient = fakeAuthClient(null);
    authClient.whoami = vi.fn().mockReturnValue(new Promise<WhoAmIResult | null>(() => {}));
    routeContext = { billingClient: fakeBillingClient(vi.fn().mockResolvedValue(PENDING_VIEW)) };
    render(
      <AuthProvider authClient={authClient} getPseudonym={() => 'Renard 423'}>
        <AbonnementSuccesScreen />
      </AuthProvider>,
    );

    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
    // No page identity while loading: a `denied` resolve must not flash the "Abonnement" title before the 404.
    expect(screen.queryByRole('heading', { level: 1, name: 'Abonnement' })).toBeNull();
  });
});
