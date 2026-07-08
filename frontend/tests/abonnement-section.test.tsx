import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { BillingClient, SubscriptionView } from '@/application/billing';
import { BillingError } from '@/application/billing';
import { AuthProvider } from '@/ui/components/auth';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
      <a href={String(to)} className={className}>
        {children}
      </a>
    ),
  };
});

const { AbonnementSection } = await import('@/ui/v2/AbonnementSection');

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

const ACTIVE_VIEW: SubscriptionView = { tier: 'subscriber', status: 'active', periodEnd: '2026-08-01T00:00:00Z' };
const PENDING_VIEW: SubscriptionView = { tier: 'subscriber', status: 'pending_cancellation', periodEnd: '2026-08-01T00:00:00Z' };
const CANCELED_VIEW: SubscriptionView = { tier: 'subscriber', status: 'canceled', periodEnd: '2026-07-14T00:00:00Z' };
const PAST_DUE_VIEW: SubscriptionView = { tier: 'subscriber', status: 'past_due', periodEnd: '2026-08-01T00:00:00Z' };

function fakeBillingClient(getSubscription: BillingClient['getSubscription'], overrides: Partial<BillingClient> = {}): BillingClient {
  return {
    getSubscription,
    createCheckoutSession: vi.fn(),
    cancelSubscription: vi.fn(),
    reactivateSubscription: vi.fn(),
    listReceipts: vi.fn().mockResolvedValue({ receipts: [], nextCursor: null }),
    ...overrides,
  };
}

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

describe('AbonnementSection états', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('renders nothing without the billing:subscribe capability', async () => {
    const client = fakeBillingClient(vi.fn().mockResolvedValue(ACTIVE_VIEW));
    const { container } = render(<AbonnementSection client={client} />, {
      wrapper: withAuth({ ...SUBSCRIBER, capabilities: [] }),
    });
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Ton abonnement' })).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the actif état with the renewal date and a résilier action', async () => {
    const client = fakeBillingClient(vi.fn().mockResolvedValue(ACTIVE_VIEW));
    render(<AbonnementSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText('Accès complet')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText(/Renouvellement le 1 août 2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Résilier l’abonnement/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reprendre mon abonnement' })).toBeNull();
  });

  it('renders the pending_cancellation état with the access-until note and no résilier action', async () => {
    const client = fakeBillingClient(vi.fn().mockResolvedValue(PENDING_VIEW));
    render(<AbonnementSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText('Résilié')).toBeInTheDocument();
    expect(screen.getByText(/Accès actif jusqu’au 1 août 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Rien ne te sera plus\s+prélevé/)).toBeInTheDocument();
    expect(screen.getByText(/sans nouveau paiement/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reprendre mon abonnement' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Résilier l’abonnement/ })).toBeNull();
  });

  it('renders the gentle expiré état keeping started grids, no pressure, and a re-subscribe link', async () => {
    const client = fakeBillingClient(vi.fn().mockResolvedValue(CANCELED_VIEW));
    render(<AbonnementSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText('Terminé')).toBeInTheDocument();
    expect(screen.getByText(/Ton abonnement s’est terminé/)).toBeInTheDocument();
    expect(screen.getByText(/tes\s+grilles commencées restent à toi/)).toBeInTheDocument();
    expect(screen.getByText(/sans pression/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Me réabonner' }).getAttribute('href')).toBe('/abonnement');
    expect(screen.queryByRole('button', { name: 'Reprendre mon abonnement' })).toBeNull();
  });

  it('renders the past_due état truthfully: still Accès complet, a recovery note, and a résilier action', async () => {
    const client = fakeBillingClient(vi.fn().mockResolvedValue(PAST_DUE_VIEW));
    render(<AbonnementSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText('Accès complet')).toBeInTheDocument();
    expect(screen.getByText('Paiement en attente')).toBeInTheDocument();
    expect(screen.getByText(/ton dernier prélèvement a échoué/)).toBeInTheDocument();
    expect(screen.getByText(/on réessaie\s+automatiquement/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'contact@wordsparrow.io' }).getAttribute('href')).toBe('mailto:contact@wordsparrow.io');
    // never silently "Version gratuite" — a paying-but-failed customer keeps the subscriber framing.
    expect(screen.queryByText('Version gratuite')).toBeNull();
    // résilier stays reachable in past_due (backend allows PAST_DUE → pending_cancellation).
    expect(screen.getByRole('button', { name: /Résilier l’abonnement/ })).toBeInTheDocument();
  });

  it('renders the never-subscribed free état neutrally, without an ended badge', async () => {
    const reject = vi.fn().mockRejectedValue(new BillingError('no-active-subscription', 404));
    render(<AbonnementSection client={fakeBillingClient(reject)} />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText('Version gratuite')).toBeInTheDocument();
    // never-subscribed shows no ended badge; "Terminé" is reserved for a genuinely lapsed subscription.
    expect(screen.queryByText('Terminé')).toBeNull();
    expect(screen.queryByText('Sans abonnement')).toBeNull();
    expect(screen.getByRole('link', { name: /Découvre l’abonnement/ }).getAttribute('href')).toBe('/abonnement');
    expect(screen.queryByRole('button', { name: 'Reprendre mon abonnement' })).toBeNull();
  });
});

describe('AbonnementSection réactivation flow', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('reactivates then refetches and reflects the actif state', async () => {
    const getSubscription = vi
      .fn<BillingClient['getSubscription']>()
      .mockResolvedValueOnce(PENDING_VIEW)
      .mockResolvedValue(ACTIVE_VIEW);
    const reactivateSubscription = vi
      .fn<BillingClient['reactivateSubscription']>()
      .mockResolvedValue(ACTIVE_VIEW);
    const client = fakeBillingClient(getSubscription, { reactivateSubscription });
    render(<AbonnementSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre mon abonnement' }));

    await waitFor(() => expect(reactivateSubscription).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Actif')).toBeInTheDocument();
    expect(screen.getByText(/Renouvellement le 1 août 2026/)).toBeInTheDocument();
    expect(getSubscription).toHaveBeenCalledTimes(2);
  });

  it('shows an inline error when reactivation fails and stays on the pending state', async () => {
    const getSubscription = vi.fn<BillingClient['getSubscription']>().mockResolvedValue(PENDING_VIEW);
    const reactivateSubscription = vi
      .fn<BillingClient['reactivateSubscription']>()
      .mockRejectedValue(new BillingError('provider-unavailable', 503));
    const client = fakeBillingClient(getSubscription, { reactivateSubscription });
    render(<AbonnementSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre mon abonnement' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponible/);
    expect(screen.getByText('Résilié')).toBeInTheDocument();
  });
});

describe('AbonnementSection résiliation flow', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('cancels then refetches and reflects the pending state', async () => {
    const getSubscription = vi
      .fn<BillingClient['getSubscription']>()
      .mockResolvedValueOnce(ACTIVE_VIEW)
      .mockResolvedValue(PENDING_VIEW);
    const cancelSubscription = vi.fn<BillingClient['cancelSubscription']>().mockResolvedValue(PENDING_VIEW);
    const client = fakeBillingClient(getSubscription, { cancelSubscription });
    render(<AbonnementSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    fireEvent.click(await screen.findByRole('button', { name: /Résilier l’abonnement/ }));
    expect(screen.getByRole('dialog', { name: 'Résilier ton abonnement ?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Oui, résilier' }));

    await waitFor(() => expect(cancelSubscription).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Résilié')).toBeInTheDocument();
    expect(getSubscription).toHaveBeenCalledTimes(2);
  });

  it('shows an inline error when résiliation fails with no active subscription', async () => {
    const getSubscription = vi.fn<BillingClient['getSubscription']>().mockResolvedValue(ACTIVE_VIEW);
    const cancelSubscription = vi
      .fn<BillingClient['cancelSubscription']>()
      .mockRejectedValue(new BillingError('no-active-subscription', 404));
    const client = fakeBillingClient(getSubscription, { cancelSubscription });
    render(<AbonnementSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    fireEvent.click(await screen.findByRole('button', { name: /Résilier l’abonnement/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Oui, résilier' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/pas d’abonnement actif/);
  });
});
