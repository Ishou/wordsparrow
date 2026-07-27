import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthClient, WhoAmIResult } from '@/application/auth';
import type { BillingClient } from '@/application/billing';
import { AuthProvider } from '@/ui/components/auth';
import { CGV_VERSION } from '@/ui/v2/cgv';

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
    useCanGoBack: () => false,
    useRouteContext: () => ({}),
  };
});

const { AbonnementOffer } = await import('@/ui/v2/AbonnementScreen');
const { ConditionsAbonnementScreen } = await import('@/ui/v2/ConditionsAbonnementScreen');

const ELIGIBLE: WhoAmIResult = {
  userId: '0190e3a4-7a2c-7c9e-8f1a-9b2d3e4f5a6b',
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

function fakeBillingClient(): BillingClient {
  return {
    getSubscription: vi.fn().mockResolvedValue({ tier: 'free', status: 'none', periodEnd: null }),
    createCheckoutSession: vi.fn().mockResolvedValue({
      checkoutUrl: 'https://checkout.test/session/abc',
      successUrl: 'https://wordsparrow.io/abonnement/merci',
      cancelUrl: 'https://wordsparrow.io/abonnement',
    }),
    cancelSubscription: vi.fn(),
    reactivateSubscription: vi.fn(),
    listReceipts: vi.fn().mockResolvedValue({ receipts: [], nextCursor: null }),
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider authClient={fakeAuthClient()} getPseudonym={() => 'Renard 423'}>
      {children}
    </AuthProvider>
  );
}

const originalLocation = window.location;

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
});

describe('CGV version is single-sourced', () => {
  it('renders the same version on /conditions-abonnement that is stamped into the consent record', async () => {
    render(<ConditionsAbonnementScreen />, { wrapper: Wrapper });
    expect(screen.getByText(new RegExp(`Version ${CGV_VERSION.replace('.', '\\.')}`))).toBeInTheDocument();

    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'http://localhost/abonnement', origin: 'http://localhost', assign },
    });
    const client = fakeBillingClient();
    render(<AbonnementOffer client={client} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole('checkbox', { name: /Conditions de vente/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /droit de rétractation/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'S’abonner' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer et payer' }));
    });

    await waitFor(() =>
      expect(client.createCheckoutSession).toHaveBeenCalledWith(
        'subscriber',
        'monthly',
        expect.objectContaining({ cgvVersion: CGV_VERSION }),
      ),
    );
  });
});
