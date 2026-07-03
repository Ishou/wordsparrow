import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { BillingClient, Receipt, ReceiptsPage } from '@/application/billing';
import { AuthProvider } from '@/ui/components/auth';

const { ReceiptsSection } = await import('@/ui/v2/ReceiptsSection');

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

const PAID: Receipt = { paidAt: '2026-06-29T14:03:00Z', amountMinorUnits: 200, currency: 'EUR', status: 'paid', receiptUrl: null };
const REFUNDED: Receipt = { paidAt: '2026-05-29T14:03:00Z', amountMinorUnits: 2000, currency: 'EUR', status: 'refunded', receiptUrl: null };

function fakeBillingClient(listReceipts: BillingClient['listReceipts']): BillingClient {
  return {
    getSubscription: vi.fn(),
    createCheckoutSession: vi.fn(),
    cancelSubscription: vi.fn(),
    listReceipts,
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

describe('ReceiptsSection', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('renders nothing without the billing:subscribe capability', async () => {
    const client = fakeBillingClient(vi.fn().mockResolvedValue({ receipts: [PAID], nextCursor: null }));
    const { container } = render(<ReceiptsSection client={client} />, {
      wrapper: withAuth({ ...SUBSCRIBER, capabilities: [] }),
    });
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Mes reçus' })).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the loading state before the first page resolves', async () => {
    const client = fakeBillingClient(vi.fn().mockReturnValue(new Promise<ReceiptsPage>(() => {})));
    render(<ReceiptsSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });
    expect(await screen.findByText('Chargement de tes reçus…')).toBeInTheDocument();
  });

  it('renders a receipt row with French date, amount, and status label', async () => {
    const client = fakeBillingClient(vi.fn().mockResolvedValue({ receipts: [PAID], nextCursor: null }));
    render(<ReceiptsSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText('29 juin 2026')).toBeInTheDocument();
    expect(screen.getByText(/2,00/)).toBeInTheDocument();
    expect(screen.getByText('Payé')).toBeInTheDocument();
  });

  it('never renders a link (Mollie exposes no per-payment receipt URL)', async () => {
    const client = fakeBillingClient(vi.fn().mockResolvedValue({ receipts: [PAID], nextCursor: null }));
    const { container } = render(<ReceiptsSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    await screen.findByText('29 juin 2026');
    expect(container.querySelector('a')).toBeNull();
  });

  it('shows the neutral empty state when the caller has no receipts', async () => {
    const client = fakeBillingClient(vi.fn().mockResolvedValue({ receipts: [], nextCursor: null }));
    render(<ReceiptsSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText('Aucun reçu pour le moment.')).toBeInTheDocument();
  });

  it('shows the error state when the first page fails to load', async () => {
    const client = fakeBillingClient(vi.fn().mockRejectedValue(new Error('boom')));
    render(<ReceiptsSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText('Impossible de charger tes reçus pour le moment.')).toBeInTheDocument();
  });

  it('loads and appends the next page on "Voir plus"', async () => {
    const listReceipts = vi
      .fn<BillingClient['listReceipts']>()
      .mockResolvedValueOnce({ receipts: [PAID], nextCursor: 'CURSOR2' })
      .mockResolvedValueOnce({ receipts: [REFUNDED], nextCursor: null });
    const client = fakeBillingClient(listReceipts);
    render(<ReceiptsSection client={client} />, { wrapper: withAuth(SUBSCRIBER) });

    expect(await screen.findByText('29 juin 2026')).toBeInTheDocument();
    expect(screen.queryByText('29 mai 2026')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Voir plus' }));

    expect(await screen.findByText('29 mai 2026')).toBeInTheDocument();
    // first page stays; second page appended
    expect(screen.getByText('29 juin 2026')).toBeInTheDocument();
    expect(screen.getByText(/20,00/)).toBeInTheDocument();
    expect(screen.getByText('Remboursé')).toBeInTheDocument();
    // last page reached — no more "Voir plus"
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
    expect(listReceipts).toHaveBeenNthCalledWith(2, 'CURSOR2');
  });
});
