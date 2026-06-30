import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { BillingClient, SubscriptionView } from '@/application/billing';
import { BillingError } from '@/application/billing';
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

const { AbonnementManage, AbonnementScreen } = await import('@/ui/v2/AbonnementScreen');

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

const FREE_VIEW: SubscriptionView = { tier: 'free', status: 'none', periodEnd: null };
const ACTIVE_VIEW: SubscriptionView = {
  tier: 'premium',
  status: 'active',
  periodEnd: '2026-08-01T00:00:00Z',
};

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

function fakeBillingClient(overrides: Partial<BillingClient> = {}): BillingClient {
  return {
    getSubscription: vi.fn().mockResolvedValue(FREE_VIEW),
    createCheckoutSession: vi.fn().mockResolvedValue({
      checkoutUrl: 'https://checkout.mollie.test/session/abc',
      successUrl: 'https://wordsparrow.io/abonnement/merci',
      cancelUrl: 'https://wordsparrow.io/abonnement',
    }),
    cancelSubscription: vi.fn().mockResolvedValue(FREE_VIEW),
    ...overrides,
  };
}

const SUBSCRIBER: WhoAmIResult = {
  userId: USER_ID,
  displayName: 'Lapin 472',
  role: 'maintainer',
  capabilities: ['billing:subscribe'],
};
const PLAYER: WhoAmIResult = {
  userId: USER_ID,
  displayName: 'Lapin 472',
  role: 'player',
  capabilities: [],
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

const originalLocation = window.location;

beforeEach(() => {
  routeContext = {};
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('AbonnementManage', () => {
  it('renders the active subscription status from the billing client', async () => {
    const client = fakeBillingClient({ getSubscription: vi.fn().mockResolvedValue(ACTIVE_VIEW) });
    render(<AbonnementManage client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    await waitFor(() => expect(screen.getByText(/Premium — actif/)).toBeInTheDocument());
    expect(client.getSubscription).toHaveBeenCalled();
  });

  it('renders the free offer when there is no active subscription', async () => {
    render(<AbonnementManage client={fakeBillingClient()} />, { wrapper: withAuth(SUBSCRIBER) });

    await waitFor(() =>
      expect(screen.getByText("Tu joues avec l'offre gratuite.")).toBeInTheDocument(),
    );
  });

  it('hides the subscribe CTA when a subscription is already active', async () => {
    const client = fakeBillingClient({ getSubscription: vi.fn().mockResolvedValue(ACTIVE_VIEW) });
    render(<AbonnementManage client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    await waitFor(() => expect(screen.getByText(/Premium — actif/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /S'abonner/ })).toBeNull();
  });

  it('starts a premium checkout and hands off to the provider URL on subscribe', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'http://localhost/abonnement', origin: 'http://localhost', assign },
    });
    const client = fakeBillingClient();
    render(<AbonnementManage client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    const button = await screen.findByRole('button', { name: /S'abonner/ });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(client.createCheckoutSession).toHaveBeenCalledWith('premium'));
    expect(assign).toHaveBeenCalledWith('https://checkout.mollie.test/session/abc');
  });

  it('shows an inline message when checkout fails with a BillingError', async () => {
    const client = fakeBillingClient({
      createCheckoutSession: vi.fn().mockRejectedValue(new BillingError('provider-unavailable', 503)),
    });
    render(<AbonnementManage client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    const button = await screen.findByRole('button', { name: /S'abonner/ });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/service de paiement/i),
    );
  });

  it('cancels an active subscription then refetches the status', async () => {
    const getSubscription = vi.fn().mockResolvedValueOnce(ACTIVE_VIEW).mockResolvedValue(FREE_VIEW);
    const client = fakeBillingClient({ getSubscription });
    render(<AbonnementManage client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    const button = await screen.findByRole('button', { name: 'Résilier' });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(client.cancelSubscription).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Tu joues avec l'offre gratuite.")).toBeInTheDocument(),
    );
    expect(getSubscription).toHaveBeenCalledTimes(2);
  });

  it('disables Résilier while the subscription is reloading', async () => {
    // Second fetch never resolves: loading stays true while subscription is still the stale ACTIVE view.
    const getSubscription = vi
      .fn<BillingClient['getSubscription']>()
      .mockResolvedValueOnce(ACTIVE_VIEW)
      .mockReturnValueOnce(new Promise<SubscriptionView>(() => {}));
    const client = fakeBillingClient({ getSubscription });
    render(<AbonnementManage client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    const button = await screen.findByRole('button', { name: 'Résilier' });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(client.cancelSubscription).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Résilier' })).toBeDisabled());
  });
});

describe('AbonnementScreen capability gate', () => {
  it('renders the screen for an authed user with billing:subscribe', async () => {
    routeContext = { billingClient: fakeBillingClient() };
    render(<AbonnementScreen />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText("Tu joues avec l'offre gratuite.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /S'abonner/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Abonnement' })).toBeInTheDocument();
  });

  it('renders the standard 404 for an anonymous visitor', async () => {
    routeContext = { billingClient: fakeBillingClient() };
    render(<AbonnementScreen />, { wrapper: withAuth(null) });

    expect(await screen.findByText("Cette page s'est envolée")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Abonnement' })).toBeNull();
  });

  it('renders the standard 404 for an authed user without the capability', async () => {
    routeContext = { billingClient: fakeBillingClient() };
    render(<AbonnementScreen />, { wrapper: withAuth(PLAYER) });

    expect(await screen.findByText("Cette page s'est envolée")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Abonnement' })).toBeNull();
  });

  it('shows a neutral loading state with no page title while the session resolves', async () => {
    const authClient = fakeAuthClient(null);
    authClient.whoami = vi.fn().mockReturnValue(new Promise<WhoAmIResult | null>(() => {}));
    routeContext = { billingClient: fakeBillingClient() };
    render(
      <AuthProvider authClient={authClient} getPseudonym={() => 'Renard 423'}>
        <AbonnementScreen />
      </AuthProvider>,
    );

    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
    // No page identity while loading: a `denied` resolve must not flash the "Abonnement" title before the 404.
    expect(screen.queryByRole('heading', { level: 1, name: 'Abonnement' })).toBeNull();
  });
});
