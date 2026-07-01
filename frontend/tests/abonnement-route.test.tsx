import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { BillingClient } from '@/application/billing';
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

const { AbonnementOffer, AbonnementScreen } = await import('@/ui/v2/AbonnementScreen');

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

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
    getSubscription: vi.fn().mockResolvedValue({ tier: 'free', status: 'none', periodEnd: null }),
    createCheckoutSession: vi.fn().mockResolvedValue({
      checkoutUrl: 'https://checkout.test/session/abc',
      successUrl: 'https://wordsparrow.io/abonnement/merci',
      cancelUrl: 'https://wordsparrow.io/abonnement',
    }),
    cancelSubscription: vi.fn(),
    listReceipts: vi.fn().mockResolvedValue({ receipts: [], nextCursor: null }),
    ...overrides,
  };
}

// Eligible-to-subscribe (test phase): billing:subscribe but no paid tier-derived capability.
const ELIGIBLE: WhoAmIResult = {
  userId: USER_ID,
  displayName: 'Lapin 472',
  role: 'maintainer',
  capabilities: ['billing:subscribe'],
};
// Already subscribed: holds grilles:all (ADR-0080 tier-derived), so useSubscriber() is true.
const SUBSCRIBED: WhoAmIResult = {
  userId: USER_ID,
  displayName: 'Lapin 472',
  role: 'maintainer',
  capabilities: ['billing:subscribe', 'grilles:all'],
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

describe('AbonnementOffer', () => {
  it('renders both the Accès complet and Gratuit cards with their prices', () => {
    render(<AbonnementOffer client={fakeBillingClient()} />, { wrapper: withAuth(ELIGIBLE) });

    expect(screen.getByRole('region', { name: 'Accès complet' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Gratuit' })).toBeInTheDocument();
    expect(screen.getByText('2 €')).toBeInTheDocument();
    expect(screen.getByText('20 €')).toBeInTheDocument();
    expect(
      screen.getByText(/Paiement sécurisé · sans engagement · résiliable à tout moment/),
    ).toBeInTheDocument();
  });

  it('toggles the selected cadence between mensuel and annuel', () => {
    render(<AbonnementOffer client={fakeBillingClient()} />, { wrapper: withAuth(ELIGIBLE) });

    const mensuel = screen.getByRole('radio', { name: /Mensuel/ });
    const annuel = screen.getByRole('radio', { name: /Annuel/ });
    expect(mensuel).toHaveAttribute('aria-checked', 'true');
    expect(annuel).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(annuel);
    expect(annuel).toHaveAttribute('aria-checked', 'true');
    expect(mensuel).toHaveAttribute('aria-checked', 'false');
  });

  it('arrow-right moves the cadence selection forward and shifts the tabbable radio', () => {
    render(<AbonnementOffer client={fakeBillingClient()} />, { wrapper: withAuth(ELIGIBLE) });

    const mensuel = screen.getByRole('radio', { name: /Mensuel/ });
    act(() => {
      mensuel.focus();
      fireEvent.keyDown(mensuel, { key: 'ArrowRight' });
    });

    const annuel = screen.getByRole('radio', { name: /Annuel/ });
    expect(annuel).toHaveAttribute('aria-checked', 'true');
    expect(annuel).toHaveAttribute('tabindex', '0');
    expect(mensuel).toHaveAttribute('aria-checked', 'false');
    expect(mensuel).toHaveAttribute('tabindex', '-1');
  });

  it('arrow-left wraps the cadence selection from the first to the last option', () => {
    render(<AbonnementOffer client={fakeBillingClient()} />, { wrapper: withAuth(ELIGIBLE) });

    const mensuel = screen.getByRole('radio', { name: /Mensuel/ });
    act(() => {
      mensuel.focus();
      fireEvent.keyDown(mensuel, { key: 'ArrowLeft' });
    });

    expect(screen.getByRole('radio', { name: /Annuel/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('starts an annual checkout and hands off to the provider URL when Annuel is selected', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'http://localhost/abonnement', origin: 'http://localhost', assign },
    });
    const client = fakeBillingClient();
    render(<AbonnementOffer client={client} />, { wrapper: withAuth(ELIGIBLE) });

    fireEvent.click(screen.getByRole('radio', { name: /Annuel/ }));
    const button = screen.getByRole('button', { name: /S'abonner/ });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(client.createCheckoutSession).toHaveBeenCalledWith('subscriber', 'yearly'));
    expect(assign).toHaveBeenCalledWith('https://checkout.test/session/abc');
  });

  it('starts a monthly checkout with the default Mensuel cadence', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'http://localhost/abonnement', origin: 'http://localhost', assign },
    });
    const client = fakeBillingClient();
    render(<AbonnementOffer client={client} />, { wrapper: withAuth(ELIGIBLE) });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /S'abonner/ }));
    });

    await waitFor(() => expect(client.createCheckoutSession).toHaveBeenCalledWith('subscriber', 'monthly'));
    expect(assign).toHaveBeenCalledWith('https://checkout.test/session/abc');
  });

  it('shows an inline message when checkout fails with a BillingError', async () => {
    const client = fakeBillingClient({
      createCheckoutSession: vi.fn().mockRejectedValue(new BillingError('provider-unavailable', 503)),
    });
    render(<AbonnementOffer client={client} />, { wrapper: withAuth(ELIGIBLE) });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /S'abonner/ }));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/service de paiement/i));
  });
});

describe('AbonnementScreen', () => {
  it('renders the offer with a subscribe CTA for an eligible user', async () => {
    routeContext = { billingClient: fakeBillingClient() };
    render(<AbonnementScreen />, { wrapper: withAuth(ELIGIBLE) });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Joue toutes les grilles' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /S'abonner/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Gratuit' })).toBeInTheDocument();
  });

  it('shows the subscribed state with a Réglages link and no CTA when already subscribed', async () => {
    routeContext = { billingClient: fakeBillingClient() };
    render(<AbonnementScreen />, { wrapper: withAuth(SUBSCRIBED) });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tu es abonné·e' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aller aux Réglages' })).toHaveAttribute('href', '/reglages');
    expect(screen.queryByRole('button', { name: /S'abonner/ })).toBeNull();
  });

  it('renders the standard 404 for an anonymous visitor', async () => {
    routeContext = { billingClient: fakeBillingClient() };
    render(<AbonnementScreen />, { wrapper: withAuth(null) });

    expect(await screen.findByText("Cette page s'est envolée")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Joue toutes les grilles' })).toBeNull();
  });

  it('renders the standard 404 for an authed user without the capability', async () => {
    routeContext = { billingClient: fakeBillingClient() };
    render(<AbonnementScreen />, { wrapper: withAuth(PLAYER) });

    expect(await screen.findByText("Cette page s'est envolée")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Joue toutes les grilles' })).toBeNull();
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
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});
