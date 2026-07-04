import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { BillingClient } from '@/application/billing';
import { AuthProvider } from '@/ui/components/auth';

// PhoneShell pulls router primitives; stub them so the offer renders without a full router.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ to, children, onClick }: { to: string; children: ReactNode; onClick?: (e: unknown) => void }) => (
      <a href={String(to)} onClick={onClick}>
        {children}
      </a>
    ),
    useNavigate: () => vi.fn(),
    useRouteContext: () => ({}),
  };
});

const { AbonnementOffer } = await import('@/ui/v2/AbonnementScreen');

const USER_ID = '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b';

const ELIGIBLE: WhoAmIResult = {
  userId: USER_ID,
  displayName: 'Lapin 472',
  role: 'maintainer',
  capabilities: ['billing:subscribe'],
};

function fakeAuthClient(): AuthClient {
  return {
    whoami: vi.fn().mockResolvedValue(ELIGIBLE),
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

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider authClient={fakeAuthClient()} getPseudonym={() => 'Renard 423'}>
      {children}
    </AuthProvider>
  );
}

const cgvBox = () => screen.getByRole('checkbox', { name: /Conditions de vente/ });
const waiverBox = () => screen.getByRole('checkbox', { name: /droit de rétractation/ });
const subscribeButton = () => screen.getByRole('button', { name: "S'abonner" });

const originalLocation = window.location;

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('AbonnementOffer consent gate (ADR-0094)', () => {
  it('shows the récapitulatif before payment with price, first-charge date and renewal terms', () => {
    render(<AbonnementOffer client={fakeBillingClient()} />, { wrapper: Wrapper });

    const recap = screen.getByRole('region', { name: 'Récapitulatif' });
    expect(recap).toHaveTextContent('2 € TTC par mois');
    expect(recap).toHaveTextContent(/Aujourd/);
    expect(recap).toHaveTextContent('Reconduction tacite chaque mois');
  });

  it('keeps S\'abonner disabled until both consent boxes are checked', () => {
    render(<AbonnementOffer client={fakeBillingClient()} />, { wrapper: Wrapper });

    expect(subscribeButton()).toBeDisabled();

    fireEvent.click(cgvBox());
    expect(subscribeButton()).toBeDisabled();

    fireEvent.click(waiverBox());
    expect(subscribeButton()).toBeEnabled();
  });

  it('re-disables after unchecking one box', () => {
    render(<AbonnementOffer client={fakeBillingClient()} />, { wrapper: Wrapper });

    fireEvent.click(cgvBox());
    fireEvent.click(waiverBox());
    expect(subscribeButton()).toBeEnabled();

    fireEvent.click(cgvBox());
    expect(subscribeButton()).toBeDisabled();
  });

  it('runs the double-clic and sends the consent payload to createCheckoutSession', async () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'http://localhost/abonnement', origin: 'http://localhost', assign },
    });
    const client = fakeBillingClient();
    render(<AbonnementOffer client={client} />, { wrapper: Wrapper });

    fireEvent.click(cgvBox());
    fireEvent.click(waiverBox());

    // First click reviews (double-clic); no checkout yet.
    await act(async () => {
      fireEvent.click(subscribeButton());
    });
    expect(client.createCheckoutSession).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer et payer' }));
    });

    await waitFor(() =>
      expect(client.createCheckoutSession).toHaveBeenCalledWith('subscriber', 'monthly', {
        cgvAccepted: true,
        cgvVersion: '1.0',
        withdrawalWaiver: true,
      }),
    );
    expect(assign).toHaveBeenCalledWith('https://checkout.test/session/abc');
  });

  it('reopens the review step when a choice changes after reaching confirm', async () => {
    render(<AbonnementOffer client={fakeBillingClient()} />, { wrapper: Wrapper });

    fireEvent.click(cgvBox());
    fireEvent.click(waiverBox());
    await act(async () => {
      fireEvent.click(subscribeButton());
    });
    expect(screen.getByRole('button', { name: 'Confirmer et payer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Annuel/ }));
    expect(screen.queryByRole('button', { name: 'Confirmer et payer' })).toBeNull();
    expect(subscribeButton()).toBeEnabled();
  });
});
